import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Printer, FileSpreadsheet, BarChart3 } from "lucide-react";
import { fmt, fmtMoney, formatJalali, ORDER_STATUSES } from "@/lib/calc";
import { useUserRoles, hasAnyRole } from "@/hooks/use-user-roles";
import { exportToExcel, printHtml, tableHtml } from "@/lib/export-utils";

export const Route = createFileRoute("/_authenticated/sales-report")({ component: SalesReportPage });

const ACCESS_ROLES = ["admin", "factory_manager", "sales_manager", "marketing_manager"];

function SalesReportPage() {
  const { data: me } = useUserRoles();
  const canView = hasAnyRole(me?.roles, ACCESS_ROLES);

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [repId, setRepId] = useState<string>("__all");
  const [status, setStatus] = useState<string>("__all");

  const { data: reps = [] } = useQuery({
    queryKey: ["reps-for-report"],
    enabled: canView,
    queryFn: async () => (await (supabase.from("representatives") as any).select("id, name").order("name")).data ?? [],
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["sales-report-orders", fromDate, toDate, repId, status],
    enabled: canView,
    queryFn: async () => {
      let q = (supabase.from("orders") as any)
        .select("id, customer, order_date, due_date, status, proforma_number, representative_id, is_walk_in, order_items(id, width, qty, unit_price, products(name))")
        .is("deleted_at", null)
        .order("order_date", { ascending: false });
      if (fromDate) q = q.gte("order_date", fromDate);
      if (toDate) q = q.lte("order_date", toDate);
      if (repId !== "__all") q = q.eq("representative_id", repId);
      if (status !== "__all") q = q.eq("status", status);
      return (await q).data ?? [];
    },
  });

  const repMap = useMemo(() => {
    const m = new Map<string, string>();
    (reps as any[]).forEach((r) => m.set(r.id, r.name));
    return m;
  }, [reps]);

  const rows = useMemo(() => {
    const out: any[] = [];
    (orders as any[]).forEach((o) => {
      const partyName = o.is_walk_in
        ? `${o.customer} (متفرقه)`
        : (o.representative_id ? (repMap.get(o.representative_id) ?? o.customer) : o.customer);
      (o.order_items ?? []).forEach((it: any) => {
        out.push({
          order_id: o.id,
          order_no: o.proforma_number || o.id.slice(0, 8),
          party: partyName,
          product: it.products?.name ?? "—",
          width: it.width,
          qty: it.qty,
          unit_price: Number(it.unit_price ?? 0),
          total: it.qty * Number(it.unit_price ?? 0),
          due_date: o.due_date,
          status: o.status,
        });
      });
    });
    return out;
  }, [orders, repMap]);

  const totalQty = rows.reduce((a, r) => a + r.qty, 0);
  const totalAmount = rows.reduce((a, r) => a + r.total, 0);

  const handleExcel = () => {
    const data: Record<string, any>[] = rows.map((r) => ({
      "شماره سفارش": r.order_no,
      "مشتری/نماینده": r.party,
      "محصول": r.product,
      "عرض": r.width,
      "تعداد": r.qty,
      "قیمت واحد": r.unit_price,
      "جمع کل": r.total,
      "تاریخ تحویل": r.due_date ? formatJalali(r.due_date) : "—",
      "وضعیت": ORDER_STATUSES[r.status as keyof typeof ORDER_STATUSES] ?? r.status,
    }));
    data.push({
      "شماره سفارش": "", "مشتری/نماینده": "", "محصول": "", "عرض": "",
      "تعداد": totalQty, "قیمت واحد": "", "جمع کل": totalAmount,
      "تاریخ تحویل": "", "وضعیت": "جمع کل",
    });
    exportToExcel(data, `sales-report-${new Date().toISOString().slice(0, 10)}`, "گزارش فروش");
  };

  const handlePrint = () => {
    const headers = ["شماره سفارش", "مشتری/نماینده", "محصول", "عرض", "تعداد", "قیمت واحد", "جمع کل", "تاریخ تحویل", "وضعیت"];
    const body = rows.map((r) => [
      r.order_no, r.party, r.product, r.width, fmt(r.qty), fmtMoney(r.unit_price), fmtMoney(r.total),
      r.due_date ? formatJalali(r.due_date) : "—",
      ORDER_STATUSES[r.status as keyof typeof ORDER_STATUSES] ?? r.status,
    ]);
    const meta = `<div class="meta">از ${fromDate ? formatJalali(fromDate) : "ابتدا"} تا ${toDate ? formatJalali(toDate) : "امروز"}${repId !== "__all" ? ` — نماینده: ${repMap.get(repId) ?? ""}` : ""}${status !== "__all" ? ` — وضعیت: ${ORDER_STATUSES[status as keyof typeof ORDER_STATUSES]}` : ""}</div>`;
    const totals = `<div class="total">جمع کل تعداد: ${fmt(totalQty)} — جمع کل مبلغ: ${fmtMoney(totalAmount)}</div>`;
    printHtml("گزارش فروش", `<h1>گزارش فروش</h1>${meta}${tableHtml(headers, body)}${totals}`);
  };

  if (!canView) return <div className="text-muted-foreground">دسترسی ندارید</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><BarChart3 className="h-6 w-6" /> گزارش فروش</h2>
          <p className="text-sm text-muted-foreground mt-1">گزارش جامع فروش بر اساس بازه تاریخ، نماینده و وضعیت</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrint}><Printer className="h-4 w-4 ml-1" /> چاپ</Button>
          <Button variant="outline" onClick={handleExcel}><FileSpreadsheet className="h-4 w-4 ml-1" /> خروجی اکسل</Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">از تاریخ</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">تا تاریخ</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">نماینده</Label>
            <Select value={repId} onValueChange={setRepId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">همه</SelectItem>
                {(reps as any[]).map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">وضعیت سفارش</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">همه</SelectItem>
                {Object.entries(ORDER_STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>شماره سفارش</TableHead>
                <TableHead>مشتری/نماینده</TableHead>
                <TableHead>محصول و عرض</TableHead>
                <TableHead>تعداد</TableHead>
                <TableHead>قیمت واحد</TableHead>
                <TableHead>جمع کل</TableHead>
                <TableHead>تاریخ تحویل</TableHead>
                <TableHead>وضعیت</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">داده‌ای یافت نشد</TableCell></TableRow>}
              {rows.map((r, i) => (
                <TableRow key={`${r.order_id}-${i}`}>
                  <TableCell>{r.order_no}</TableCell>
                  <TableCell>{r.party}</TableCell>
                  <TableCell>{r.product} — عرض {r.width}</TableCell>
                  <TableCell>{fmt(r.qty)}</TableCell>
                  <TableCell>{r.unit_price > 0 ? fmtMoney(r.unit_price) : "—"}</TableCell>
                  <TableCell>{r.total > 0 ? fmtMoney(r.total) : "—"}</TableCell>
                  <TableCell>{r.due_date ? formatJalali(r.due_date) : "—"}</TableCell>
                  <TableCell><Badge variant="outline">{ORDER_STATUSES[r.status as keyof typeof ORDER_STATUSES] ?? r.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
            {rows.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="font-bold text-left">جمع کل</TableCell>
                  <TableCell className="font-bold">{fmt(totalQty)}</TableCell>
                  <TableCell />
                  <TableCell className="font-bold">{fmtMoney(totalAmount)}</TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
