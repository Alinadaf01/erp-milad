import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { WIDTHS } from "@/lib/calc";

export const Route = createFileRoute("/_authenticated/bom")({ component: BomPage });

const WIDTH_COL = (w: number) => `qty_${w}` as const;
const EMPTY_BOM: any[] = [];

function BomPage() {
  const qc = useQueryClient();
  const [productId, setProductId] = useState<string>("");

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await supabase.from("products").select("*").order("name")).data ?? [],
  });
  const { data: materials = [] } = useQuery({
    queryKey: ["raw_materials"],
    queryFn: async () => (await supabase.from("raw_materials").select("*").order("name")).data ?? [],
  });
  const { data: bomData } = useQuery({
    queryKey: ["bom", productId],
    queryFn: async () => {
      if (!productId) return [];
      const { data, error } = await (supabase as any)
        .from("bom")
        .select("*, raw_materials(name, unit, bom_type, is_sized)")
        .eq("product_id", productId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!productId,
  });
  const bom = bomData ?? EMPTY_BOM;

  // Local editable state: rows[bomId][width] = string. For sized materials, single value at "count" key.
  const [rows, setRows] = useState<Record<string, Record<number | "count", string>>>({});
  useEffect(() => {
    const next: Record<string, Record<number | "count", string>> = {};
    for (const b of bom as any[]) {
      const r: Record<number | "count", string> = {} as any;
      const isSized = !!b.raw_materials?.is_sized;
      if (isSized) {
        const v = b.qty_per_base_width;
        r["count"] = v === null || v === undefined ? "" : String(v);
      } else {
        for (const w of WIDTHS) {
          const v = b[WIDTH_COL(w)];
          r[w] = v === null || v === undefined ? "" : String(v);
        }
      }
      next[b.id] = r;
    }
    setRows(next);
  }, [bom]);

  const [matId, setMatId] = useState("");

  const addMaterial = async () => {
    if (!productId || !matId) return toast.error("ماده خام را انتخاب کنید");
    const exists = (bom as any[]).find((b) => b.material_id === matId);
    if (exists) return toast.error("این ماده قبلاً اضافه شده است");
    const { error } = await (supabase as any)
      .from("bom")
      .insert({ product_id: productId, material_id: matId, qty_per_base_width: 0 });
    if (error) return toast.error(error.message);
    setMatId("");
    qc.invalidateQueries({ queryKey: ["bom", productId] });
  };

  const saveRow = async (b: any) => {
    const r = rows[b.id] ?? {};
    const isSized = !!b.raw_materials?.is_sized;
    const bomType = (b.raw_materials?.bom_type ?? "scaled") as "scaled" | "fixed_per_size";
    const payload: any = {};
    if (isSized) {
      const raw = (r as any)["count"];
      const v = raw === "" || raw === undefined ? 0 : Number(raw);
      payload.qty_per_base_width = v;
      // clear per-width columns for sized materials
      for (const w of WIDTHS) payload[WIDTH_COL(w)] = null;
    } else if (bomType === "scaled") {
      // Only qty_90 is editable. Other widths derive automatically.
      const raw90 = r[90];
      const v90 = raw90 === "" || raw90 === undefined ? null : Number(raw90);
      payload.qty_90 = v90;
      payload.qty_per_base_width = v90 ?? 0;
      for (const w of WIDTHS) {
        if (w === 90) continue;
        payload[WIDTH_COL(w)] = v90 === null ? null : Number((v90 * (w / 90)).toFixed(6));
      }
    } else {
      for (const w of WIDTHS) {
        const raw = r[w];
        payload[WIDTH_COL(w)] = raw === "" || raw === undefined ? null : Number(raw);
      }
      if (payload.qty_90 !== null && payload.qty_90 !== undefined) {
        payload.qty_per_base_width = payload.qty_90;
      }
    }
    const { error } = await (supabase as any).from("bom").update(payload).eq("id", b.id);
    if (error) return toast.error(error.message);
    toast.success("ذخیره شد");
    qc.invalidateQueries({ queryKey: ["bom", productId] });
  };

  const del = async (id: string) => {
    if (!confirm("حذف شود؟")) return;
    await supabase.from("bom").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["bom", productId] });
  };

  const setCell = (bomId: string, w: number | "count", v: string) => {
    setRows((s) => ({ ...s, [bomId]: { ...(s[bomId] ?? {}), [w]: v } }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">فهرست مواد (BOM)</h2>
        <p className="text-sm text-muted-foreground mt-1">
          مقدار واقعی مصرف هر ماده خام را برای هر عرض جداگانه وارد کنید. ضریب تبدیل فقط در صفحه محاسبه هزینه استفاده می‌شود.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>انتخاب محصول</CardTitle></CardHeader>
        <CardContent>
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger className="max-w-md"><SelectValue placeholder="یک محصول انتخاب کنید" /></SelectTrigger>
            <SelectContent>{products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        </CardContent>
      </Card>

      {productId && (
        <>
          <Card>
            <CardHeader><CardTitle>افزودن ماده</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div className="md:col-span-2">
                <Label>ماده خام</Label>
                <Select value={matId} onValueChange={setMatId}>
                  <SelectTrigger><SelectValue placeholder="انتخاب کنید" /></SelectTrigger>
                  <SelectContent>{materials.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button onClick={addMaterial}><Plus className="ml-1 h-4 w-4" /> افزودن ماده</Button>
            </CardContent>
          </Card>

          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ماده</TableHead>
                    <TableHead>واحد</TableHead>
                    <TableHead className="text-center">نوع</TableHead>
                    {WIDTHS.map((w) => <TableHead key={w} className="text-center">{w}</TableHead>)}
                    <TableHead>عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bom.length === 0 && <TableRow><TableCell colSpan={WIDTHS.length + 4} className="text-center text-muted-foreground py-8">هیچ ماده‌ای ثبت نشده</TableCell></TableRow>}
                  {(bom as any[]).map((b: any) => {
                    const isSized = !!b.raw_materials?.is_sized;
                    const bomType = (b.raw_materials?.bom_type ?? "scaled") as "scaled" | "fixed_per_size";
                    const base90 = Number(rows[b.id]?.[90] ?? 0);
                    return (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.raw_materials?.name}</TableCell>
                      <TableCell>{b.raw_materials?.unit}</TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground">
                        {isSized ? "سایزی (تعداد)" : bomType === "scaled" ? "ضریب" : "سایز جداگانه"}
                      </TableCell>
                      {isSized ? (
                        <TableCell colSpan={WIDTHS.length} className="p-1 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-xs text-muted-foreground">تعداد در هر محصول:</span>
                            <Input
                              type="number"
                              step="any"
                              min={0}
                              className="w-24 text-center"
                              value={(rows[b.id] as any)?.["count"] ?? ""}
                              placeholder="0"
                              onChange={(e) => setCell(b.id, "count", e.target.value)}
                            />
                            <span className="text-xs text-muted-foreground">از همان سایز محصول</span>
                          </div>
                        </TableCell>
                      ) : (
                        WIDTHS.map((w) => (
                          <TableCell key={w} className="p-1 text-center">
                            {bomType === "scaled" && w !== 90 ? (
                              <span className="text-xs text-muted-foreground">
                                {base90 > 0 ? (base90 * (w / 90)).toFixed(3) : "—"}
                              </span>
                            ) : (
                              <Input
                                type="number"
                                step="any"
                                min={0}
                                className="w-20 text-center"
                                value={rows[b.id]?.[w] ?? ""}
                                placeholder="0"
                                onChange={(e) => setCell(b.id, w, e.target.value)}
                              />
                            )}
                          </TableCell>
                        ))
                      )}
                      <TableCell className="space-x-1 space-x-reverse">
                        <Button size="icon" variant="ghost" onClick={() => saveRow(b)} title="ذخیره"><Save className="h-4 w-4 text-primary" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => del(b.id)} title="حذف"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
