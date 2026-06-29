import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { CATEGORIES, WIDTHS, BEDDING_CATEGORY } from "@/lib/calc";

export const Route = createFileRoute("/_authenticated/products")({ component: ProductsPage });

type Product = { id: string; name: string; category: string; widths: number[]; length: number; active: boolean };

function ProductsPage() {
  const qc = useQueryClient();
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data as Product[];
    },
  });

  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Product | null>(null);
  const initial = { name: "", category: "طبی", widths: [...WIDTHS] as number[], length: 200, active: true };
  const [form, setForm] = useState(initial);
  const [customWidth, setCustomWidth] = useState("");

  const reset = () => { setForm(initial); setEdit(null); setCustomWidth(""); };

  const toggleWidth = (w: number) => {
    setForm((f) => ({ ...f, widths: f.widths.includes(w) ? f.widths.filter(x => x !== w) : [...f.widths, w].sort((a, b) => a - b) }));
  };

  const addCustomWidth = () => {
    const w = Number(customWidth);
    if (!w || w <= 0 || isNaN(w)) return toast.error("عرض نامعتبر");
    if (form.widths.includes(w)) return toast.error("این عرض قبلاً اضافه شده");
    setForm((f) => ({ ...f, widths: [...f.widths, w].sort((a, b) => a - b) }));
    setCustomWidth("");
  };

  const isBedding = form.category === BEDDING_CATEGORY;

  const save = async () => {
    if (!form.name.trim()) return toast.error("نام محصول را وارد کنید");
    if (!isBedding && form.widths.length === 0) return toast.error("حداقل یک عرض را انتخاب کنید");
    const payload = isBedding
      ? { ...form, widths: [0], length: 0 }
      : { ...form };
    const op = edit
      ? supabase.from("products").update(payload).eq("id", edit.id)
      : supabase.from("products").insert(payload);
    const { error } = await op;
    if (error) return toast.error(error.message);
    toast.success(edit ? "ویرایش شد" : "اضافه شد");
    qc.invalidateQueries({ queryKey: ["products"] });
    setOpen(false); reset();
  };

  const del = async (id: string) => {
    if (!confirm("حذف شود؟ تمام BOM و سفارشات مرتبط نیز حذف می‌شود.")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("حذف شد");
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  const startEdit = (p: Product) => {
    setEdit(p);
    setForm({ name: p.name, category: p.category, widths: p.widths, length: p.length, active: p.active });
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">محصولات</h2>
          <p className="text-sm text-muted-foreground mt-1">انواع تشک و دسته‌بندی‌ها</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
          <DialogTrigger asChild><Button><Plus className="ml-1 h-4 w-4" /> افزودن محصول</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{edit ? "ویرایش محصول" : "افزودن محصول"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>نام محصول</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div>
                <Label>دسته‌بندی</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {!isBedding && (
                <>
                  <div>
                    <Label>عرض‌های موجود (سانتیمتر)</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {Array.from(new Set([...WIDTHS, ...form.widths])).sort((a, b) => a - b).map((w) => (
                        <Button key={w} type="button" size="sm" variant={form.widths.includes(w) ? "default" : "outline"} onClick={() => toggleWidth(w)}>
                          {w}
                        </Button>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-2 items-center">
                      <Label className="text-xs whitespace-nowrap">عرض ویژه:</Label>
                      <Input type="number" className="w-24" value={customWidth} onChange={(e) => setCustomWidth(e.target.value)} placeholder="cm" />
                      <Button type="button" size="sm" variant="outline" onClick={addCustomWidth}>افزودن</Button>
                    </div>
                  </div>
                  <div><Label>طول (سانتیمتر)</Label><Input type="number" value={form.length} onChange={(e) => setForm({ ...form, length: Number(e.target.value) })} /></div>
                </>
              )}
              <div className="flex items-center justify-between"><Label>فعال</Label><Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /></div>
            </div>
            <DialogFooter><Button onClick={save}>ذخیره</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {(() => {
        const mattresses = products.filter((p) => p.category !== BEDDING_CATEGORY);
        const bedding = products.filter((p) => p.category === BEDDING_CATEGORY);
        const renderRow = (p: Product) => {
          const isBed = p.category === BEDDING_CATEGORY;
          return (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.name}</TableCell>
              <TableCell>
                {isBed
                  ? <Badge className="bg-primary text-primary-foreground">کالای خواب</Badge>
                  : <Badge variant="secondary">{p.category}</Badge>}
              </TableCell>
              <TableCell>{isBed ? "—" : p.widths.join(" ، ")}</TableCell>
              <TableCell>{isBed ? "—" : p.length}</TableCell>
              <TableCell>{p.active ? <Badge className="bg-success text-success-foreground">فعال</Badge> : <Badge variant="outline">غیرفعال</Badge>}</TableCell>
              <TableCell className="flex gap-2">
                <Button size="icon" variant="ghost" onClick={() => startEdit(p)}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => del(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </TableCell>
            </TableRow>
          );
        };
        return (
          <>
            <Card>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>نام</TableHead><TableHead>دسته</TableHead><TableHead>عرض‌ها (cm)</TableHead>
                  <TableHead>طول</TableHead><TableHead>وضعیت</TableHead><TableHead>عملیات</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {mattresses.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">تشکی ثبت نشده</TableCell></TableRow>}
                  {mattresses.map(renderRow)}
                </TableBody>
              </Table>
            </Card>

            <div className="pt-4">
              <div className="border-t mb-4" />
              <h3 className="text-xl font-bold mb-3">کالای خواب</h3>
              <Card>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>نام</TableHead><TableHead>دسته</TableHead><TableHead>عرض‌ها (cm)</TableHead>
                    <TableHead>طول</TableHead><TableHead>وضعیت</TableHead><TableHead>عملیات</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {bedding.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">کالای خوابی ثبت نشده</TableCell></TableRow>}
                    {bedding.map(renderRow)}
                  </TableBody>
                </Table>
              </Card>
            </div>
          </>
        );
      })()}
    </div>
  );
}
