import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, AlertTriangle, Printer, FileSpreadsheet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { fmt, fmtMoney, CALC_TYPES, MATERIAL_EDIT_ROLES, formatJalali, WIDTHS, type CalcType } from "@/lib/calc";
import { useUserRoles, hasAnyRole } from "@/hooks/use-user-roles";
import { exportToExcel, printHtml, tableHtml } from "@/lib/export-utils";

export const Route = createFileRoute("/_authenticated/materials")({ component: MaterialsPage });

type BomType = "scaled" | "fixed_per_size";
const BOM_TYPES: Record<BomType, string> = {
  scaled: "مصرفی با ضریب",
  fixed_per_size: "ضریبی با سایز جداگانه",
};
type MaterialType = "scaled" | "weighted" | "fixed" | "sized";
const MATERIAL_TYPES: Record<MaterialType, string> = {
  scaled: "تیراژی",
  weighted: "وزنی",
  fixed: "ثابت",
  sized: "سایزی",
};
type Material = {
  id: string; name: string; unit: string; stock: number; price: number;
  calc_type: CalcType; bom_type: BomType; is_sized: boolean; material_type: MaterialType;
};
type SizeRow = { id: string; material_id: string; width: number; quantity: number };

function MaterialsPage() {
  const qc = useQueryClient();
  const { data: me } = useUserRoles();
  const canEdit = hasAnyRole(me?.roles, MATERIAL_EDIT_ROLES);
  const { data: materials = [] } = useQuery({
    queryKey: ["raw_materials"],
    queryFn: async () => {
      const { data, error } = await supabase.from("raw_materials").select("*").order("name");
      if (error) throw error;
      return data as Material[];
    },
  });

  const { data: sizes = [] } = useQuery({
    queryKey: ["raw_material_sizes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("raw_material_sizes").select("*");
      if (error) throw error;
      return (data ?? []) as SizeRow[];
    },
  });

  const sizesByMat: Record<string, Record<number, number>> = {};
  for (const s of sizes) {
    sizesByMat[s.material_id] ??= {};
    sizesByMat[s.material_id][s.width] = Number(s.quantity);
  }

  const nonSized = materials.filter((m) => !m.is_sized);
  const sized = materials.filter((m) => m.is_sized);

  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Material | null>(null);
  const [form, setForm] = useState<{
    name: string; unit: string; stock: number; price: number;
    calc_type: CalcType; bom_type: BomType; is_sized: boolean; material_type: MaterialType;
  }>({
    name: "", unit: "کیلوگرم", stock: 0, price: 0,
    calc_type: "per_width", bom_type: "scaled", is_sized: false, material_type: "scaled",
  });
  const [sizeQtys, setSizeQtys] = useState<Record<number, string>>({});

  const reset = () => {
    setForm({ name: "", unit: "کیلوگرم", stock: 0, price: 0, calc_type: "per_width", bom_type: "scaled", is_sized: false, material_type: "scaled" });
    setSizeQtys({});
    setEdit(null);
  };

  useEffect(() => {
    if (form.is_sized && form.material_type !== "sized") setForm((f) => ({ ...f, material_type: "sized" }));
    if (!form.is_sized && form.material_type === "sized") setForm((f) => ({ ...f, material_type: "scaled" }));
  }, [form.is_sized]);

  const save = async () => {
    if (!form.name.trim()) return toast.error("نام را وارد کنید");
    const payload = {
      name: form.name, unit: form.unit,
      stock: form.is_sized ? 0 : form.stock,
      price: form.price, calc_type: form.calc_type, bom_type: form.bom_type,
      is_sized: form.is_sized, material_type: form.material_type,
    };
    let materialId = edit?.id;
    if (edit) {
      const { error } = await supabase.from("raw_materials").update(payload).eq("id", edit.id);
      if (error) return toast.error(error.message);
    } else {
      const { data, error } = await supabase.from("raw_materials").insert(payload).select("id").single();
      if (error) return toast.error(error.message);
      materialId = (data as any).id;
    }
    if (form.is_sized && materialId) {
      const rows = WIDTHS.map((w) => ({
        material_id: materialId,
        width: w,
        quantity: Number(sizeQtys[w] ?? 0) || 0,
      }));
      const { error: upErr } = await (supabase as any).from("raw_material_sizes").upsert(rows, { onConflict: "material_id,width" });
      if (upErr) return toast.error(upErr.message);
    }
    toast.success(edit ? "ویرایش شد" : "اضافه شد");
    qc.invalidateQueries({ queryKey: ["raw_materials"] });
    qc.invalidateQueries({ queryKey: ["raw_material_sizes"] });
    setOpen(false); reset();
  };

  const del = async (id: string) => {
    if (!confirm("حذف شود؟")) return;
    const { error } = await supabase.from("raw_materials").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("حذف شد");
    qc.invalidateQueries({ queryKey: ["raw_materials"] });
    qc.invalidateQueries({ queryKey: ["raw_material_sizes"] });
  };

  const startEdit = (m: Material) => {
    setEdit(m);
    setForm({
      name: m.name, unit: m.unit, stock: m.stock, price: m.price,
      calc_type: m.calc_type ?? "per_width",
      bom_type: (m.bom_type ?? "scaled") as BomType,
      is_sized: !!m.is_sized,
      material_type: (m.material_type ?? "scaled") as MaterialType,
    });
    const cur = sizesByMat[m.id] ?? {};
    const obj: Record<number, string> = {};
    for (const w of WIDTHS) obj[w] = String(cur[w] ?? 0);
    setSizeQtys(obj);
    setOpen(true);
  };

  const exportExcel = () => {
    exportToExcel(
      materials.map((m) => ({
        نام: m.name, واحد: m.unit,
        "نوع ماده": MATERIAL_TYPES[(m.material_type ?? "scaled") as MaterialType],
        "نوع محاسبه": CALC_TYPES[m.calc_type ?? "per_width"],
        سایزی: m.is_sized ? "بله" : "خیر",
        موجودی: Number(m.stock), "قیمت واحد": Number(m.price),
      })),
      "raw_materials", "مواد خام"
    );
  };
  const printList = () => {
    const html = `<h1>گزارش مواد خام</h1><div class="meta">تاریخ: ${formatJalali(new Date())}</div>` +
      tableHtml(["نام", "واحد", "نوع ماده", "نوع محاسبه", "سایزی", "موجودی", "قیمت واحد"],
        materials.map((m) => [
          m.name, m.unit,
          MATERIAL_TYPES[(m.material_type ?? "scaled") as MaterialType],
          CALC_TYPES[m.calc_type ?? "per_width"],
          m.is_sized ? "بله" : "خیر",
          fmt(Number(m.stock)), fmtMoney(Number(m.price))
        ]));
    printHtml("گزارش مواد خام", html);
  };

  const renderNonSizedRow = (m: Material) => (
    <TableRow key={m.id}>
      <TableCell className="font-medium">{m.name}</TableCell>
      <TableCell>{m.unit}</TableCell>
      <TableCell><Badge variant="outline">{MATERIAL_TYPES[(m.material_type ?? "scaled") as MaterialType]}</Badge></TableCell>
      <TableCell><Badge variant="outline">{CALC_TYPES[m.calc_type ?? "per_width"]}</Badge></TableCell>
      <TableCell>
        <span className={Number(m.stock) <= 0 ? "text-destructive flex items-center gap-1" : "text-success"}>
          {Number(m.stock) <= 0 && <AlertTriangle className="h-3 w-3" />}
          {fmt(Number(m.stock))}
        </span>
      </TableCell>
      <TableCell>{fmtMoney(Number(m.price))}</TableCell>
      <TableCell className="flex gap-2">
        {canEdit && <Button size="icon" variant="ghost" onClick={() => startEdit(m)}><Pencil className="h-4 w-4" /></Button>}
        {canEdit && <Button size="icon" variant="ghost" onClick={() => del(m.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
        {!canEdit && <span className="text-xs text-muted-foreground">—</span>}
      </TableCell>
    </TableRow>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold">مواد خام</h2>
          <p className="text-sm text-muted-foreground mt-1">مدیریت موجودی، قیمت و نوع محاسبه مصرف مواد</p>
        </div>
        <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={printList}><Printer className="ml-1 h-4 w-4" /> چاپ</Button>
        <Button variant="outline" size="sm" onClick={exportExcel}><FileSpreadsheet className="ml-1 h-4 w-4" /> اکسل</Button>
        {canEdit && (
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="ml-1 h-4 w-4" /> افزودن ماده</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{edit ? "ویرایش ماده" : "افزودن ماده خام"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>نام</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>واحد</Label><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>

              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label className="text-sm font-medium">سایزی هست؟</Label>
                  <p className="text-xs text-muted-foreground mt-1">برای موادی که موجودی هر سایز جداگانه نگهداری می‌شود</p>
                </div>
                <Switch checked={form.is_sized} onCheckedChange={(v) => setForm({ ...form, is_sized: v })} />
              </div>

              <div>
                <Label>نوع ماده</Label>
                <Select value={form.material_type} onValueChange={(v) => setForm({ ...form, material_type: v as MaterialType })} disabled={form.is_sized}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(MATERIAL_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {!form.is_sized && (
                <>
                  <div>
                    <Label>نوع محاسبه مصرف</Label>
                    <Select value={form.calc_type} onValueChange={(v) => setForm({ ...form, calc_type: v as CalcType })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(CALC_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>نوع محاسبه در BOM</Label>
                    <Select value={form.bom_type} onValueChange={(v) => setForm({ ...form, bom_type: v as BomType })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(BOM_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>موجودی</Label><Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} /></div>
                </>
              )}

              {form.is_sized && (
                <div className="space-y-2">
                  <Label>موجودی هر سایز</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {WIDTHS.map((w) => (
                      <div key={w}>
                        <Label className="text-xs">عرض {w}</Label>
                        <Input type="number" min={0} value={sizeQtys[w] ?? ""} placeholder="0"
                          onChange={(e) => setSizeQtys((s) => ({ ...s, [w]: e.target.value }))} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div><Label>قیمت واحد (تومان)</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} /></div>
            </div>
            <DialogFooter><Button onClick={save}>ذخیره</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        )}
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
                  <TableHead>نام</TableHead>
                  <TableHead>واحد</TableHead>
                  <TableHead>نوع ماده</TableHead>
                  <TableHead>نوع محاسبه</TableHead>
                  <TableHead>موجودی</TableHead>
                  <TableHead>قیمت واحد</TableHead>
                  <TableHead>عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nonSized.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">هنوز ماده‌ای ثبت نشده</TableCell></TableRow>}
                {nonSized.map(renderNonSizedRow)}
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
                    <TableHead>نام</TableHead>
                    <TableHead>واحد</TableHead>
                    {WIDTHS.map((w) => <TableHead key={w} className="text-center">عرض {w}</TableHead>)}
                    <TableHead>قیمت واحد</TableHead>
                    <TableHead>عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sized.length === 0 && <TableRow><TableCell colSpan={WIDTHS.length + 4} className="text-center text-muted-foreground py-8">ماده سایزی ثبت نشده</TableCell></TableRow>}
                  {sized.map((m) => {
                    const s = sizesByMat[m.id] ?? {};
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.name}</TableCell>
                        <TableCell>{m.unit}</TableCell>
                        {WIDTHS.map((w) => (
                          <TableCell key={w} className="text-center">
                            <span className={(s[w] ?? 0) <= 0 ? "text-destructive" : ""}>{fmt(s[w] ?? 0)}</span>
                          </TableCell>
                        ))}
                        <TableCell>{fmtMoney(Number(m.price))}</TableCell>
                        <TableCell className="flex gap-2">
                          {canEdit && <Button size="icon" variant="ghost" onClick={() => startEdit(m)}><Pencil className="h-4 w-4" /></Button>}
                          {canEdit && <Button size="icon" variant="ghost" onClick={() => del(m.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                          {!canEdit && <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
