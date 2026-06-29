import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmt, fmtMoney, materialQtyPerUnit, WIDTHS, type CalcType } from "@/lib/calc";

export const Route = createFileRoute("/_authenticated/cost")({ component: CostPage });

function CostPage() {
  const [productId, setProductId] = useState("");
  const [width, setWidth] = useState(90);
  const [overhead, setOverhead] = useState(0);
  const [labor, setLabor] = useState(0);

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await supabase.from("products").select("*").order("name")).data ?? [],
  });
  const { data: bom = [] } = useQuery({
    queryKey: ["bom-cost", productId],
    queryFn: async () => {
      if (!productId) return [];
      const { data } = await supabase.from("bom").select("*, raw_materials(name, unit, price, calc_type, bom_type, is_sized)").eq("product_id", productId);
      return data ?? [];
    },
    enabled: !!productId,
  });

  const product = products.find((p: any) => p.id === productId);
  const length = Number(product?.length ?? 200);
  const rows = bom.map((b: any) => {
    const bomType = (b.raw_materials.bom_type ?? "scaled") as "scaled" | "fixed_per_size";
    const isSized = !!b.raw_materials.is_sized;
    const basePrice = Number(b.raw_materials.price);
    let qty: number;
    let price: number;
    if (isSized) {
      // Sized material: qty stays constant (count per product), price scales with width/90
      qty = Number(b.qty_per_base_width ?? 0);
      price = basePrice * (width / 90);
    } else if (bomType === "fixed_per_size") {
      const widthKey = (WIDTHS as readonly number[]).includes(width) ? `qty_${width}` : null;
      const v = widthKey ? (b as any)[widthKey] : null;
      qty = v === null || v === undefined ? Number(b.qty_per_base_width ?? 0) : Number(v);
      price = basePrice;
    } else {
      const calcType = (b.raw_materials.calc_type ?? "per_width") as CalcType;
      qty = materialQtyPerUnit(Number(b.qty_per_base_width), calcType, width, length);
      price = basePrice;
    }
    return { name: b.raw_materials.name, unit: b.raw_materials.unit, qty, price, cost: qty * price };
  });
  const materialCost = rows.reduce((a, b) => a + b.cost, 0);
  const total = materialCost + overhead + labor;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">محاسبه هزینه</h2>
        <p className="text-sm text-muted-foreground mt-1">قیمت تمام‌شده هر تشک بر اساس BOM و عرض انتخابی</p>
      </div>

      <Card>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <Label>محصول</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="انتخاب" /></SelectTrigger>
              <SelectContent>{products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>عرض (cm)</Label>
            {(() => {
              const isCustom = !(WIDTHS as readonly number[]).includes(width);
              return (
                <div className="flex gap-1">
                  <Select value={isCustom ? "__custom" : String(width)} onValueChange={(v) => setWidth(v === "__custom" ? width : Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WIDTHS.map((w) => <SelectItem key={w} value={String(w)}>{w}</SelectItem>)}
                      <SelectItem value="__custom">ویژه</SelectItem>
                    </SelectContent>
                  </Select>
                  {isCustom && (
                    <Input type="number" className="w-24" value={width} onChange={(e) => setWidth(Number(e.target.value))} placeholder="cm" />
                  )}
                </div>
              );
            })()}
          </div>
          <div><Label>هزینه دستمزد (تومان)</Label><Input type="number" value={labor} onChange={(e) => setLabor(Number(e.target.value))} /></div>
          <div><Label>هزینه سربار (تومان)</Label><Input type="number" value={overhead} onChange={(e) => setOverhead(Number(e.target.value))} /></div>
        </CardContent>
      </Card>

      {productId && (
        <Card>
          <CardHeader><CardTitle>تفکیک هزینه</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead>ماده</TableHead><TableHead>مقدار</TableHead><TableHead>قیمت واحد</TableHead><TableHead>هزینه</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">BOM این محصول تعریف نشده</TableCell></TableRow>}
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{fmt(r.qty)} {r.unit}</TableCell>
                    <TableCell>{fmtMoney(r.price)}</TableCell>
                    <TableCell>{fmtMoney(r.cost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-4 space-y-2 text-sm border-t pt-4">
              <div className="flex justify-between"><span>جمع هزینه مواد:</span><span>{fmtMoney(materialCost)}</span></div>
              <div className="flex justify-between"><span>دستمزد:</span><span>{fmtMoney(labor)}</span></div>
              <div className="flex justify-between"><span>سربار:</span><span>{fmtMoney(overhead)}</span></div>
              <div className="flex justify-between text-lg font-bold pt-2 border-t"><span>قیمت تمام‌شده:</span><span className="text-primary">{fmtMoney(total)}</span></div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
