import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { fmt, fmtMoney, formatJalali, WIDTHS } from "@/lib/calc";
import { AlertTriangle, CheckCircle2, Printer, FileSpreadsheet } from "lucide-react";
import { exportSheetsToExcel, printHtml, tableHtml } from "@/lib/export-utils";

export const Route = createFileRoute("/_authenticated/production")({ component: ProductionPage });

function ProductionPage() {
  const { data } = useQuery({
    queryKey: ["production-plan"],
    queryFn: async () => {
      const [{ data: orders }, { data: inv }, { data: bom }, { data: mats }, { data: sizes }] = await Promise.all([
        supabase.from("orders").select("*, order_items(*, products(name,length))").not("status", "in", "(completed,delivered)"),
        supabase.from("inventory").select("*"),
        supabase.from("bom").select("*, products(name,length), raw_materials(id,name,unit,stock,price,bom_type,is_sized)"),
        supabase.from("raw_materials").select("*"),
        (supabase as any).from("raw_material_sizes").select("*"),
      ]);
      return { orders: orders ?? [], inv: inv ?? [], bom: bom ?? [], mats: mats ?? [], sizes: (sizes ?? []) as any[] };
    },
  });

  if (!data) return <div>در حال بارگذاری...</div>;

  // Aggregate demand per product+width
  type Key = string;
  const demand = new Map<Key, { product_id: string; product_name: string; width: number; length: number; needed: number; due: string | null }>();
  for (const o of data.orders) {
    for (const it of o.order_items) {
      const k = `${it.product_id}|${it.width}`;
      const cur = demand.get(k) ?? { product_id: it.product_id, product_name: it.products?.name ?? "?", width: it.width, length: it.products?.length ?? 200, needed: 0, due: o.due_date };
      cur.needed += it.qty;
      if (o.due_date && (!cur.due || o.due_date < cur.due)) cur.due = o.due_date;
      demand.set(k, cur);
    }
  }

  // Plan rows
  const plan = Array.from(demand.values()).map((d) => {
    const stock = data.inv.find((i: any) => i.product_id === d.product_id && i.width === d.width)?.qty ?? 0;
    const toProduce = Math.max(0, d.needed - stock);
    return { ...d, stock, toProduce };
  }).sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));

  // Material consumption from real per-width BOM values (no scale_type involved)
  // Sized materials track per-width need vs per-width stock; non-sized aggregate.
  const sizesByMat: Record<string, Record<number, number>> = {};
  for (const s of data.sizes) {
    sizesByMat[s.material_id] ??= {};
    sizesByMat[s.material_id][s.width] = Number(s.quantity);
  }
  type MatRow = { id: string; name: string; unit: string; stock: number; price: number; needed: number; is_sized: boolean; width?: number };
  const matNeed = new Map<string, MatRow>();
  for (const row of plan) {
    if (row.toProduce <= 0) continue;
    const productBom = data.bom.filter((b: any) => b.product_id === row.product_id);
    for (const b of productBom) {
      const m = b.raw_materials;
      const isSized = !!m?.is_sized;
      let perUnit: number;
      if (isSized) {
        // For sized materials, BOM stores count per unit (from same product width).
        perUnit = Number(b.qty_per_base_width ?? 0);
      } else {
        const bomType = (m?.bom_type ?? "scaled") as "scaled" | "fixed_per_size";
        if (bomType === "scaled") {
          const base = Number((b as any).qty_90 ?? b.qty_per_base_width ?? 0);
          perUnit = base * (row.width / 90);
        } else {
          const widthKey = (WIDTHS as readonly number[]).includes(row.width) ? `qty_${row.width}` : null;
          const rawPer = widthKey ? (b as any)[widthKey] : null;
          perUnit = rawPer === null || rawPer === undefined ? Number(b.qty_per_base_width ?? 0) : Number(rawPer);
        }
      }
      if (!perUnit) continue;
      const key = isSized ? `${m.id}|${row.width}` : m.id;
      const stock = isSized ? (sizesByMat[m.id]?.[row.width] ?? 0) : Number(m.stock);
      const cur = matNeed.get(key) ?? {
        id: m.id, name: m.name + (isSized ? ` (عرض ${row.width})` : ""),
        unit: m.unit, stock, price: Number(m.price), needed: 0, is_sized: isSized, width: isSized ? row.width : undefined,
      };
      cur.needed += perUnit * row.toProduce;
      matNeed.set(key, cur);
    }
  }
  const materialRows = Array.from(matNeed.values());
  const totalCost = materialRows.reduce((a, b) => a + b.needed * b.price, 0);

  const exportExcel = () => {
    const wb1 = plan.map((r) => ({ محصول: r.product_name, عرض: r.width, سفارش: r.needed, موجودی: r.stock, "نیاز تولید": r.toProduce, مهلت: r.due ? formatJalali(r.due) : "" }));
    const wb2 = materialRows.map((m) => ({ ماده: m.name, "مورد نیاز": m.needed, موجود: m.stock, واحد: m.unit, هزینه: m.needed * m.price }));
    exportSheetsToExcel([{ name: "تولید", rows: wb1 }, { name: "مواد", rows: wb2 }], "production_plan");
  };
  const printPlan = () => {
    const html = `<h1>برنامه تولید</h1><div class="meta">تاریخ: ${formatJalali(new Date())}</div>
      <h2>جدول تولید</h2>` +
      tableHtml(["محصول", "عرض", "سفارش", "موجودی", "نیاز تولید", "مهلت"],
        plan.map((r) => [r.product_name, r.width, fmt(r.needed), fmt(r.stock), r.toProduce > 0 ? fmt(r.toProduce) : "کافی", r.due ? formatJalali(r.due) : "—"])) +
      `<h2>مصرف مواد خام</h2>` +
      tableHtml(["ماده", "مورد نیاز", "موجود", "واحد", "هزینه"],
        materialRows.map((m) => [m.name, fmt(m.needed), fmt(m.stock), m.unit, fmtMoney(m.needed * m.price)])) +
      `<div class="total">هزینه تخمینی کل مواد: ${fmtMoney(totalCost)}</div>`;
    printHtml("برنامه تولید", html);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold">برنامه تولید</h2>
          <p className="text-sm text-muted-foreground mt-1">محاسبه خودکار نیاز تولید و مواد بر اساس سفارشات فعال و موجودی</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={printPlan}><Printer className="ml-1 h-4 w-4" /> چاپ</Button>
          <Button variant="outline" size="sm" onClick={exportExcel}><FileSpreadsheet className="ml-1 h-4 w-4" /> اکسل</Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>جدول تولید</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>محصول</TableHead><TableHead>عرض</TableHead><TableHead>سفارش</TableHead>
              <TableHead>موجودی</TableHead><TableHead>نیاز تولید</TableHead><TableHead>مهلت</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {plan.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">سفارش فعالی وجود ندارد</TableCell></TableRow>}
              {plan.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{r.product_name}</TableCell>
                  <TableCell>{r.width}</TableCell>
                  <TableCell>{fmt(r.needed)}</TableCell>
                  <TableCell>{fmt(r.stock)}</TableCell>
                  <TableCell>
                    {r.toProduce > 0
                      ? <Badge className="bg-warning text-warning-foreground">{fmt(r.toProduce)}</Badge>
                      : <Badge className="bg-success text-success-foreground"><CheckCircle2 className="h-3 w-3 ml-1" /> کافی</Badge>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.due ? formatJalali(r.due) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>مصرف مواد خام</span>
            <span className="text-sm font-normal text-muted-foreground">هزینه تخمینی مواد: {fmtMoney(totalCost)}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>ماده</TableHead><TableHead>مورد نیاز</TableHead><TableHead>موجود</TableHead>
              <TableHead>وضعیت</TableHead><TableHead>هزینه</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {materialRows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">نیازی به تولید نیست</TableCell></TableRow>}
              {materialRows.map((m, i) => {
                const short = m.needed - m.stock;
                return (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell>{fmt(m.needed)} {m.unit}</TableCell>
                    <TableCell>{fmt(m.stock)} {m.unit}</TableCell>
                    <TableCell>
                      {short > 0
                        ? <Badge className="bg-destructive text-destructive-foreground"><AlertTriangle className="h-3 w-3 ml-1" /> کمبود {fmt(short)}</Badge>
                        : <Badge className="bg-success text-success-foreground">کافی</Badge>}
                    </TableCell>
                    <TableCell>{fmtMoney(m.needed * m.price)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
