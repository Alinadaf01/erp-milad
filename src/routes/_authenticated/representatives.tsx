import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, ListOrdered } from "lucide-react";
import { toast } from "sonner";
import { useUserRoles, hasAnyRole } from "@/hooks/use-user-roles";
import { Checkbox } from "@/components/ui/checkbox";
import { formatJalali, ORDER_STATUSES } from "@/lib/calc";

export const Route = createFileRoute("/_authenticated/representatives")({ component: RepsPage });

const LEVELS = ["نقره‌ای", "طلایی", "برنزی", "ویژه"];
const ALLOWED_USERS_ROLES = ["sales_expert", "marketing_manager"];

const VIEW_ROLES = ["admin", "factory_manager", "sales_manager", "marketing_manager", "sales_expert"];
const EDIT_ROLES = ["admin", "factory_manager", "sales_manager", "marketing_manager"];
const DELETE_ROLES = ["admin", "factory_manager"];
const CAN_ORDER_ROLES = ["admin", "factory_manager"];

type Rep = {
  id: string; name: string; province: string | null; city: string | null;
  address: string | null; level: string | null; is_active: boolean; can_order: boolean; allowed_users: string[] | null;
};

function RepsPage() {
  const qc = useQueryClient();
  const { data: me } = useUserRoles();
  const canView = hasAnyRole(me?.roles, VIEW_ROLES);
  const canEdit = hasAnyRole(me?.roles, EDIT_ROLES);
  const canDelete = hasAnyRole(me?.roles, DELETE_ROLES);
  const canToggleOrder = hasAnyRole(me?.roles, CAN_ORDER_ROLES);

  const { data: reps = [] } = useQuery({
    queryKey: ["representatives"],
    queryFn: async () => (await (supabase.from("representatives") as any).select("*").order("created_at", { ascending: false })).data ?? [],
    enabled: canView,
  });

  const { data: salesUsers = [] } = useQuery({
    queryKey: ["sales-users-for-reps"],
    queryFn: async () => {
      const [{ data: profs }, { data: roleRows }] = await Promise.all([
        supabase.from("user_profiles").select("user_id, full_name, role"),
        (supabase.from("user_roles") as any).select("user_id, role"),
      ]);
      const map = new Map<string, { user_id: string; full_name: string; roles: Set<string> }>();
      (profs ?? []).forEach((p: any) => {
        const e = map.get(p.user_id) ?? { user_id: p.user_id, full_name: p.full_name ?? "", roles: new Set<string>() };
        if (p.role) e.roles.add(p.role);
        e.full_name = p.full_name ?? e.full_name;
        map.set(p.user_id, e);
      });
      (roleRows ?? []).forEach((r: any) => {
        const e = map.get(r.user_id) ?? { user_id: r.user_id, full_name: "", roles: new Set<string>() };
        e.roles.add(r.role);
        map.set(r.user_id, e);
      });
      return Array.from(map.values())
        .filter((u) => ALLOWED_USERS_ROLES.some((r) => u.roles.has(r)))
        .map((u) => ({ user_id: u.user_id, full_name: u.full_name || "—" }));
    },
    enabled: canEdit,
  });

  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Rep | null>(null);
  const [ordersRep, setOrdersRep] = useState<Rep | null>(null);
  const empty = { name: "", province: "", city: "", address: "", level: "", is_active: true, can_order: true, allowed_users: [] as string[] };
  const [form, setForm] = useState<typeof empty>(empty);

  const { data: repOrders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["rep-orders", ordersRep?.id],
    enabled: !!ordersRep,
    queryFn: async () => {
      const { data: orders } = await (supabase.from("orders") as any)
        .select("id, proforma_number, order_date, due_date, status, created_by")
        .eq("representative_id", ordersRep!.id)
        .is("deleted_at", null)
        .order("order_date", { ascending: false });
      const list = (orders ?? []) as any[];
      if (list.length === 0) return [];
      const ids = list.map((o) => o.id);
      const uids = Array.from(new Set(list.map((o) => o.created_by).filter(Boolean)));
      const [{ data: items }, { data: profs }] = await Promise.all([
        (supabase.from("order_items") as any).select("order_id").in("order_id", ids),
        uids.length > 0
          ? (supabase.from("user_profiles") as any).select("user_id, full_name").in("user_id", uids)
          : Promise.resolve({ data: [] }),
      ]);
      const countMap = new Map<string, number>();
      (items ?? []).forEach((it: any) => countMap.set(it.order_id, (countMap.get(it.order_id) ?? 0) + 1));
      const nameMap = new Map<string, string>();
      (profs ?? []).forEach((p: any) => nameMap.set(p.user_id, p.full_name ?? ""));
      return list.map((o) => ({
        ...o,
        item_count: countMap.get(o.id) ?? 0,
        creator: o.created_by ? (nameMap.get(o.created_by) ?? "—") : "—",
      }));
    },
  });

  const ordersStats = (() => {
    const total = repOrders.length;
    const completedSet = new Set(["completed", "delivered"]);
    const completed = repOrders.filter((o: any) => completedSet.has(o.status)).length;
    const active = repOrders.filter((o: any) => !completedSet.has(o.status) && o.status !== "cancelled").length;
    return { total, active, completed };
  })();

  const start = (r?: Rep) => {
    if (r) {
      setEdit(r);
      setForm({
        name: r.name, province: r.province ?? "", city: r.city ?? "", address: r.address ?? "",
        level: r.level ?? "", is_active: r.is_active, can_order: r.can_order,
        allowed_users: r.allowed_users ?? [],
      });
    } else { setEdit(null); setForm(empty); }
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("نام نماینده را وارد کنید");
    const payload: any = {
      name: form.name.trim(),
      province: form.province || null,
      city: form.city || null,
      address: form.address || null,
      level: form.level || null,
      is_active: form.is_active,
    };
    if (canToggleOrder || !edit) payload.can_order = form.can_order;
    payload.allowed_users = form.allowed_users && form.allowed_users.length > 0 ? form.allowed_users : null;
    const res = edit
      ? await (supabase.from("representatives") as any).update(payload).eq("id", edit.id)
      : await (supabase.from("representatives") as any).insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success("ذخیره شد");
    qc.invalidateQueries({ queryKey: ["representatives"] });
    qc.invalidateQueries({ queryKey: ["representatives-active"] });
    setOpen(false);
  };

  const del = async (r: Rep) => {
    if (!confirm(`حذف نماینده «${r.name}»؟`)) return;
    const { error } = await (supabase.from("representatives") as any).delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("حذف شد");
    qc.invalidateQueries({ queryKey: ["representatives"] });
    qc.invalidateQueries({ queryKey: ["representatives-active"] });
  };

  const toggleCanOrder = async (r: Rep) => {
    const { error } = await (supabase.from("representatives") as any).update({ can_order: !r.can_order }).eq("id", r.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["representatives"] });
    qc.invalidateQueries({ queryKey: ["representatives-active"] });
  };

  if (!canView) return <div className="text-muted-foreground">دسترسی ندارید</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">نمایندگان</h2>
          <p className="text-sm text-muted-foreground mt-1">مدیریت نمایندگان فروش</p>
        </div>
        {canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button onClick={() => start()}><Plus className="ml-1 h-4 w-4" /> نماینده جدید</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{edit ? "ویرایش نماینده" : "نماینده جدید"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>نام</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>استان</Label><Input value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} /></div>
                  <div><Label>شهر</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
                </div>
                <div><Label>آدرس</Label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
                <div>
                  <Label>سطح</Label>
                  <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v })}>
                    <SelectTrigger><SelectValue placeholder="انتخاب سطح" /></SelectTrigger>
                    <SelectContent>{LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between"><Label>فعال</Label>
                  <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className={!canToggleOrder && edit ? "opacity-50" : ""}>مجاز به سفارش</Label>
                  <Switch
                    checked={form.can_order}
                    disabled={!!edit && !canToggleOrder}
                    onCheckedChange={(v) => setForm({ ...form, can_order: v })}
                  />
                </div>
                <div className="space-y-2 border-t pt-3">
                  <Label>کاربران مجاز به ثبت سفارش</Label>
                  <p className="text-xs text-muted-foreground">مدیر فروش و مدیر کارخانه همیشه مجاز هستند. اگر هیچ موردی انتخاب نشود، همه کاربران مجازند.</p>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {(salesUsers as any[]).length === 0 && <p className="text-xs text-muted-foreground">کاربری یافت نشد</p>}
                    {(salesUsers as any[]).map((u) => {
                      const checked = form.allowed_users.includes(u.user_id);
                      return (
                        <label key={u.user_id} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              const next = v
                                ? [...form.allowed_users, u.user_id]
                                : form.allowed_users.filter((id) => id !== u.user_id);
                              setForm({ ...form, allowed_users: next });
                            }}
                          />
                          <span className="text-sm">{u.full_name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
              <DialogFooter><Button onClick={save}>ذخیره</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>نام</TableHead>
                <TableHead>استان</TableHead>
                <TableHead>شهر</TableHead>
                <TableHead>سطح</TableHead>
                <TableHead>وضعیت</TableHead>
                <TableHead>مجاز به سفارش</TableHead>
                <TableHead className="text-left">عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reps.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">نماینده‌ای ثبت نشده است</TableCell></TableRow>}
              {(reps as Rep[]).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className={!r.can_order ? "text-destructive font-medium" : ""}>{r.name}</TableCell>
                  <TableCell>{r.province ?? "—"}</TableCell>
                  <TableCell>{r.city ?? "—"}</TableCell>
                  <TableCell>{r.level ? <Badge variant="outline">{r.level}</Badge> : "—"}</TableCell>
                  <TableCell>{r.is_active ? <Badge>فعال</Badge> : <Badge variant="secondary">غیرفعال</Badge>}</TableCell>
                  <TableCell>
                    <Switch
                      checked={r.can_order}
                      disabled={!canToggleOrder}
                      onCheckedChange={() => toggleCanOrder(r)}
                    />
                  </TableCell>
                  <TableCell className="text-left">
                    <Button size="icon" variant="ghost" onClick={() => setOrdersRep(r)} title="مشاهده سفارشات"><ListOrdered className="h-4 w-4" /></Button>
                    {canEdit && <Button size="icon" variant="ghost" onClick={() => start(r)}><Pencil className="h-4 w-4" /></Button>}
                    {canDelete && <Button size="icon" variant="ghost" onClick={() => del(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!ordersRep} onOpenChange={(v) => !v && setOrdersRep(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>سفارشات نماینده: {ordersRep?.name}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Card><CardContent className="p-4 text-center"><div className="text-2xl font-bold">{ordersStats.total}</div><div className="text-xs text-muted-foreground mt-1">کل سفارشات</div></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><div className="text-2xl font-bold text-warning">{ordersStats.active}</div><div className="text-xs text-muted-foreground mt-1">سفارشات فعال</div></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><div className="text-2xl font-bold text-success">{ordersStats.completed}</div><div className="text-xs text-muted-foreground mt-1">تکمیل شده</div></CardContent></Card>
          </div>
          {ordersLoading ? (
            <div className="text-center text-muted-foreground py-6">در حال بارگذاری...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>شماره سفارش</TableHead>
                  <TableHead>تاریخ ثبت</TableHead>
                  <TableHead>تاریخ تحویل</TableHead>
                  <TableHead>تعداد اقلام</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>ثبت‌کننده</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {repOrders.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">سفارشی ثبت نشده است</TableCell></TableRow>}
                {(repOrders as any[]).map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>{o.proforma_number ?? o.id.slice(0, 8)}</TableCell>
                    <TableCell>{formatJalali(o.order_date)}</TableCell>
                    <TableCell>{o.due_date ? formatJalali(o.due_date) : "—"}</TableCell>
                    <TableCell>{o.item_count}</TableCell>
                    <TableCell><Badge variant="outline">{ORDER_STATUSES[o.status as keyof typeof ORDER_STATUSES] ?? o.status}</Badge></TableCell>
                    <TableCell>{o.creator}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
