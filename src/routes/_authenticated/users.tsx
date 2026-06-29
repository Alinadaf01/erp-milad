import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pencil, Save, X, ShieldAlert, KeyRound } from "lucide-react";
import { ROLE_LABELS, ASSIGNABLE_ROLES } from "@/lib/calc";
import { useUserRoles, hasAnyRole, type AppRole } from "@/hooks/use-user-roles";
import { useServerFn } from "@tanstack/react-start";
import { adminChangeUserPassword } from "@/lib/admin-users.functions";

export const Route = createFileRoute("/_authenticated/users")({
  component: UsersPage,
});

type Profile = { user_id: string; full_name: string; role: AppRole };

function UsersPage() {
  const qc = useQueryClient();
  const { data: me, isLoading: meLoading } = useUserRoles();
  const isAdmin = hasAnyRole(me?.roles, ["admin", "factory_manager"]);
  const changePasswordFn = useServerFn(adminChangeUserPassword);

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["all_user_profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_profiles").select("*").order("full_name");
      if (error) throw error;
      return data as Profile[];
    },
  });

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<AppRole>("user");

  const [pwTarget, setPwTarget] = useState<Profile | null>(null);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  if (meLoading) return <div>در حال بارگذاری...</div>;
  if (!isAdmin) {
    return (
      <Card className="p-8 text-center">
        <ShieldAlert className="h-10 w-10 mx-auto text-destructive mb-2" />
        <h2 className="text-lg font-bold">دسترسی غیرمجاز</h2>
        <p className="text-sm text-muted-foreground mt-2">
          فقط مدیر سیستم یا مدیر کارخانه می‌تواند این صفحه را ببیند.
        </p>
      </Card>
    );
  }

  const startEdit = (p: Profile) => {
    setEditId(p.user_id);
    setEditName(p.full_name);
    setEditRole(p.role);
  };

  const cancel = () => { setEditId(null); };

  const save = async (id: string) => {
    const { error } = await supabase
      .from("user_profiles")
      .update({ full_name: editName, role: editRole })
      .eq("user_id", id);
    if (error) return toast.error(error.message);
    toast.success("ذخیره شد");
    setEditId(null);
    qc.invalidateQueries({ queryKey: ["all_user_profiles"] });
    qc.invalidateQueries({ queryKey: ["user-roles"] });
    qc.invalidateQueries({ queryKey: ["user_profiles"] });
  };

  const openPw = (p: Profile) => {
    setPwTarget(p);
    setPw1("");
    setPw2("");
  };

  const submitPw = async () => {
    if (!pwTarget) return;
    if (pw1.length < 6) return toast.error("رمز عبور باید حداقل ۶ کاراکتر باشد");
    if (pw1 !== pw2) return toast.error("رمز عبور و تکرار آن یکسان نیستند");
    setPwSaving(true);
    try {
      await changePasswordFn({ data: { userId: pwTarget.user_id, newPassword: pw1 } });
      toast.success("رمز عبور با موفقیت تغییر کرد");
      setPwTarget(null);
    } catch (e: any) {
      toast.error(e?.message ?? "خطا در تغییر رمز عبور");
    } finally {
      setPwSaving(false);
    }
  };

  const myProfile = profiles.find((p) => p.user_id === me?.userId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold">مدیریت کاربران و نقش‌ها</h2>
          <p className="text-sm text-muted-foreground mt-1">
            نام کامل، نقش و رمز عبور هر کاربر را اینجا تنظیم کنید.
          </p>
        </div>
        {myProfile && (
          <Button variant="outline" onClick={() => openPw(myProfile)}>
            <KeyRound className="h-4 w-4 ml-1" /> تغییر رمز عبور من
          </Button>
        )}
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>نام کامل</TableHead>
              <TableHead>نقش</TableHead>
              <TableHead>عملیات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">در حال بارگذاری...</TableCell></TableRow>}
            {!isLoading && profiles.length === 0 && <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">کاربری ثبت نشده</TableCell></TableRow>}
            {profiles.map((p) => {
              const editing = editId === p.user_id;
              return (
                <TableRow key={p.user_id}>
                  <TableCell className="font-medium">
                    {editing ? (
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                    ) : (
                      p.full_name || <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {editing ? (
                      <Select value={editRole} onValueChange={(v) => setEditRole(v as AppRole)}>
                        <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ASSIGNABLE_ROLES.map((r) => (
                            <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline">{ROLE_LABELS[p.role] ?? p.role}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="flex gap-2">
                    {editing ? (
                      <>
                        <Button size="sm" onClick={() => save(p.user_id)}><Save className="h-4 w-4 ml-1" /> ذخیره</Button>
                        <Button size="sm" variant="ghost" onClick={cancel}><X className="h-4 w-4" /></Button>
                      </>
                    ) : (
                      <>
                        <Button size="icon" variant="ghost" onClick={() => startEdit(p)} title="ویرایش"><Pencil className="h-4 w-4" /></Button>
                        <Button size="sm" variant="outline" onClick={() => openPw(p)} title="تغییر رمز عبور">
                          <KeyRound className="h-4 w-4 ml-1" /> تغییر رمز عبور
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!pwTarget} onOpenChange={(o) => { if (!o) setPwTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تغییر رمز عبور</DialogTitle>
            <DialogDescription>
              رمز عبور جدید برای کاربر «{pwTarget?.full_name || "—"}» را وارد کنید. حداقل ۶ کاراکتر.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>رمز عبور جدید</Label>
              <Input type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} autoComplete="new-password" />
            </div>
            <div>
              <Label>تکرار رمز عبور</Label>
              <Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPwTarget(null)} disabled={pwSaving}>انصراف</Button>
            <Button onClick={submitPw} disabled={pwSaving}>{pwSaving ? "در حال ذخیره..." : "ذخیره رمز جدید"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="p-4 bg-muted/30 text-sm">
        <div className="font-medium mb-2">راهنمای نقش‌ها</div>
        <ul className="space-y-1 text-muted-foreground list-disc pr-5">
          <li><b>مدیر کارخانه:</b> دسترسی کامل، می‌تواند وضعیت «معوق» و «شماره خروجی» را تنظیم کند.</li>
          <li><b>مدیر فروش:</b> می‌تواند وضعیت «معوق» را تنظیم کند.</li>
          <li><b>کارشناس فروش:</b> ثبت و ویرایش سفارش (بدون وضعیت معوق و بدون شماره خروجی).</li>
          <li><b>مدیر بازاریابی:</b> همان دسترسی کارشناس فروش (ثبت و دیدن فقط سفارشات خودش).</li>
          <li><b>مدیر تولید:</b> مدیریت تولید و موجودی.</li>
          <li><b>انباردار:</b> تنظیم «شماره خروجی» سفارشات هنگام تحویل.</li>
        </ul>
      </Card>
    </div>
  );
}
