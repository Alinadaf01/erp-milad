import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Printer, FileSpreadsheet, AlertTriangle, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { toast } from "sonner";
import { fmt, formatJalali, WIDTHS } from "@/lib/calc";
import { useUserRoles, hasAnyRole } from "@/hooks/use-user-roles";
import { exportToExcel, printHtml, tableHtml } from "@/lib/export-utils";
import { TransactionHistoryManager } from "@/components/TransactionHistoryManager";

export const Route = createFileRoute("/_authenticated/material-stock")({ component: MaterialStockPage });

const VIEW_ROLES = ["admin", "factory_manager", "production_manager", "warehouse_keeper"];
const EDIT_ROLES = ["factory_manager", "warehouse_keeper"];

type Material = { id: string; name: string; unit: string; stock: number; is_sized: boolean };
type SizeRow = { id: string; material_id: string; width: number; quantity: number };
type Tx = {
  id: string;
  material_id: string;
  type: "in" | "out";
  quantity: number;
  note: string | null;
  transaction_date: string;
  created_at: string;
  created_by: string | null;
};

function MaterialStockPage() {
  const qc = useQueryClient();
  const { data: me } = useUserRoles();
  const canView = hasAnyRole(me?.roles, VIEW_ROLES);
  const canEdit = hasAnyRole(me?.roles, EDIT_ROLES);
  const canManageHistory = hasAnyRole(me?.roles, ["factory_manager"]);

  const { data: materials = [] } = useQuery({
    queryKey: ["raw_materials_stock"],
    queryFn: async () => {
      const { data, error } = await supabase.from("raw_materials").select("id, name, unit, stock, is_sized").order("name");
      if (error) throw error;
      return data as Material[];
    },
    enabled: canView,
  });

  const { data: sizes = [] } = useQuery({
    queryKey: ["raw_material_sizes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("raw_material_sizes").select("*");
      if (error) throw error;
      return (data ?? []) as SizeRow[];
    },
    enabled: canView,
  });

  const sizesByMat: Record<string, Record<number, { id?: string; qty: number }>> = {};
  for (const s of sizes) {
    sizesByMat[s.material_id] ??= {};
    sizesByMat[s.material_id][s.width] = { id: s.id, qty: Number(s.quantity) };
  }

  const { data: txs = [] } = useQuery({
    queryKey: ["inventory_transactions_recent", canManageHistory],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("inventory_transactions")
        .select("id, material_id, type, quantity, note, transaction_date, created_at, created_by")
        .order("created_at", { ascending: false })
        .limit(canManageHistory ? 1000 : 10);
      if (error) throw error;
      return data as Tx[];
    },
    enabled: canView,
  });

  const userIds = Array.from(new Set(txs.map((t) => t.created_by).filter(Boolean))) as string[];
  const { data: userMap = {} } = useQuery({
    queryKey: ["tx_user_names", userIds],
    queryFn: async () => {
      if (userIds.length === 0) return {} as Record<string, string>;
      const { data } = await supabase.from("user_profiles").select("user_id, full_name").in("user_id", userIds);
      const m: Record<string, string> = {};
      (data ?? []).forEach((u: any) => { m[u.user_id] = u.full_name; });
      return m;
    },
    enabled: userIds.length > 0,
  });

  const matMap: Record<string, Material> = Object.fromEntries(materials.map((m) => [m.id, m]));

  const [modal, setModal] = useState<{ material: Material; type: "in" | "out"; width?: number } | null>(null);
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const openModal = (material: Material, type: "in" | "out", width?: number) => {
    setModal({ material, type, width });
    setQty("");
    setNote("");
    setDate(new Date().toISOString().slice(0, 10));
  };

  const submit = async () => {
    if (!modal) return;
    const q = Number(qty);
    if (!q || q <= 0 || isNaN(q)) return toast.error("مقدار نامعتبر");
    const isSized = modal.material.is_sized;
    const currentQty = isSized
      ? (sizesByMat[modal.material.id]?.[modal.width!]?.qty ?? 0)
      : Number(modal.material.stock);
    if (modal.type === "out" && q > currentQty) {
      return toast.error("مقدار خروج بیشتر از موجودی است");
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const noteFull = (isSized ? `[عرض ${modal.width}] ` : "") + (note || "");

    const { error: txErr } = await (supabase as any).from("inventory_transactions").insert({
      material_id: modal.material.id,
      type: modal.type,
      quantity: q,
      note: noteFull || null,
      transaction_date: date,
      created_by: user?.id,
    });
    if (txErr) { setSaving(false); return toast.error(txErr.message); }

    const newQty = modal.type === "in" ? currentQty + q : currentQty - q;
    if (isSized) {
      const { error } = await (supabase as any)
        .from("raw_material_sizes")
        .upsert({ material_id: modal.material.id, width: modal.width, quantity: newQty }, { onConflict: "material_id,width" });
      if (error) { setSaving(false); return toast.error(error.message); }
    } else {
      const { error } = await supabase.from("raw_materials").update({ stock: newQty }).eq("id", modal.material.id);
      if (error) { setSaving(false); return toast.error(error.message); }
    }
    toast.success(modal.type === "in" ? "ورود ثبت شد" : "خروج ثبت شد");
    setSaving(false);
    setModal(null);
    qc.invalidateQueries({ queryKey: ["raw_materials_stock"] });
    qc.invalidateQueries({ queryKey: ["raw_materials"] });
    qc.invalidateQueries({ queryKey: ["raw_material_sizes"] });
    qc.invalidateQueries({ queryKey: ["inventory_transactions_recent"] });
  };

  const nonSized = materials.filter((m) => !m.is_sized);
  const sized = materials.filter((m) => m.is_sized);

  const exportExcel = () => {
    const nonSizedRows = nonSized.map((m) => ({ "نام ماده": m.name, واحد: m.unit, "موجودی فعلی": Number(m.stock) }));
    exportToExcel(nonSizedRows, "material_stock", "موجودی مواد خام");
  };
  const printList = () => {
    const html = `<h1>گزارش موجودی مواد خام</h1><div class="meta">تاریخ: ${formatJalali(new Date())}</div>` +
      `<h2>مواد غیرسایزی</h2>` +
      tableHtml(["نام ماده", "واحد", "موجودی فعلی"],
        nonSized.map((m) => [m.name, m.unit, fmt(Number(m.stock))])) +
      `<h2>مواد سایزی</h2>` +
      tableHtml(["نام ماده", "واحد", ...WIDTHS.map((w) => `عرض ${w}`)],
        sized.map((m) => [m.name, m.unit, ...WIDTHS.map((w) => fmt(sizesByMat[m.id]?.[w]?.qty ?? 0))]));
    printHtml("گزارش موجودی مواد خام", html);
  };

  if (!canView) {
    return <Card className="p-6 text-center text-muted-foreground">دسترسی به این صفحه ندارید</Card>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold">موجودی مواد خام</h2>
          <p className="text-sm text-muted-foreground mt-1">مشاهده و مدیریت ورود/خروج موجودی مواد خام</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={printList}><Printer className="ml-1 h-4 w-4" /> چاپ</Button>
          <Button variant="outline" size="sm" onClick={exportExcel}><FileSpreadsheet className="ml-1 h-4 w-4" /> اکسل</Button>
        </div>
      </div>

      <Tabs defaultValue="non_sized">
        <TabsList>
          <TabsTrigger value="non_sized">مواد غیرسایزی ({nonSized.length})</TabsTrigger>
          <TabsTrigger value="sized">مواد سایزی ({sized.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="non_sized">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>نام ماده</TableHead>
                  <TableHead>واحد</TableHead>
                  <TableHead>موجودی فعلی</TableHead>
                  {canEdit && <TableHead>عملیات</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {nonSized.length === 0 && <TableRow><TableCell colSpan={canEdit ? 4 : 3} className="text-center text-muted-foreground py-8">ماده‌ای ثبت نشده</TableCell></TableRow>}
                {nonSized.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell>{m.unit}</TableCell>
                    <TableCell>
                      <span className={Number(m.stock) <= 0 ? "text-destructive inline-flex items-center gap-1" : ""}>
                        {Number(m.stock) <= 0 && <AlertTriangle className="h-3 w-3" />}
                        {fmt(Number(m.stock))}
                      </span>
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => openModal(m, "in")}>
                            <ArrowDownToLine className="ml-1 h-4 w-4" /> ورود
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => openModal(m, "out")}>
                            <ArrowUpFromLine className="ml-1 h-4 w-4" /> خروج
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="sized">
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>نام ماده</TableHead>
                    <TableHead>واحد</TableHead>
                    {WIDTHS.map((w) => <TableHead key={w} className="text-center">عرض {w}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sized.length === 0 && <TableRow><TableCell colSpan={WIDTHS.length + 2} className="text-center text-muted-foreground py-8">ماده سایزی ثبت نشده</TableCell></TableRow>}
                  {sized.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell>{m.unit}</TableCell>
                      {WIDTHS.map((w) => {
                        const q = sizesByMat[m.id]?.[w]?.qty ?? 0;
                        return (
                          <TableCell key={w} className="text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span className={q <= 0 ? "text-destructive" : ""}>{fmt(q)}</span>
                              {canEdit && (
                                <div className="flex gap-1">
                                  <Button size="icon" variant="ghost" className="h-6 w-6 text-green-600" title="ورود" onClick={() => openModal(m, "in", w)}>
                                    <ArrowDownToLine className="h-3 w-3" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" title="خروج" onClick={() => openModal(m, "out", w)}>
                                    <ArrowUpFromLine className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <TransactionHistoryManager
        title="تاریخچه تراکنش‌ها"
        table="inventory_transactions"
        canManage={canManageHistory}
        onDeleted={() => qc.invalidateQueries({ queryKey: ["inventory_transactions_recent"] })}
        rows={txs.map((t) => ({
          id: t.id, date: t.transaction_date, name: matMap[t.material_id]?.name ?? "—",
          type: t.type, quantity: Number(t.quantity), note: t.note ?? "",
          creatorId: t.created_by, creatorName: t.created_by ? (userMap[t.created_by] ?? "—") : "—",
        }))}
      />

      <Dialog open={!!modal} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {modal?.type === "in" ? "ورود به انبار" : "خروج از انبار"} — {modal?.material.name}
              {modal?.width && ` (عرض ${modal.width})`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>مقدار ({modal?.material.unit})</Label>
              <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div>
              <Label>تاریخ</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>توضیحات (اختیاری)</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            </div>
            <div className="text-sm text-muted-foreground">
              موجودی فعلی: {modal && fmt(
                modal.material.is_sized
                  ? (sizesByMat[modal.material.id]?.[modal.width!]?.qty ?? 0)
                  : Number(modal.material.stock)
              )} {modal?.material.unit}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(null)}>انصراف</Button>
            <Button
              onClick={submit}
              disabled={saving}
              className={modal?.type === "in" ? "bg-green-600 hover:bg-green-700 text-white" : ""}
              variant={modal?.type === "out" ? "destructive" : "default"}
            >
              ثبت
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
