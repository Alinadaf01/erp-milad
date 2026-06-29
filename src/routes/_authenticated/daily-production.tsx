import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Printer, FileSpreadsheet, Factory } from "lucide-react";
import { toast } from "sonner";
import { fmt, formatJalali, WIDTHS, BEDDING_CATEGORY } from "@/lib/calc";
import { useUserRoles, hasAnyRole } from "@/hooks/use-user-roles";
import { exportToExcel, printHtml, tableHtml } from "@/lib/export-utils";
import { TransactionHistoryManager } from "@/components/TransactionHistoryManager";

export const Route = createFileRoute("/_authenticated/daily-production")({ component: DailyProductionPage });

const ACCESS_ROLES = ["admin", "factory_manager", "warehouse_keeper"];

type Product = { id: string; name: string; category: string; widths: number[]; active: boolean };
type DPRow = {
  id: string;
  production_date: string;
  product_id: string | null;
  width: number | null;
  quantity: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

function DailyProductionPage() {
  const qc = useQueryClient();
  const { data: me } = useUserRoles();
  const canAccess = hasAnyRole(me?.roles, ACCESS_ROLES);
  const canManageHistory = hasAnyRole(me?.roles, ["factory_manager"]);

  const today = new Date().toISOString().slice(0, 10);

  const { data: products = [] } = useQuery({
    queryKey: ["daily_production_products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, category, widths, active")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as Product[];
    },
    enabled: canAccess,
  });

  const [filterDate, setFilterDate] = useState("");
  const { data: history = [] } = useQuery({
    queryKey: ["daily_production_history", filterDate, canManageHistory],
    queryFn: async () => {
      let q = (supabase as any)
        .from("daily_production")
        .select("id, production_date, product_id, width, quantity, note, created_by, created_at")
        .order("production_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(canManageHistory ? 1000 : 500);
      if (filterDate) q = q.eq("production_date", filterDate);
      const { data, error } = await q;
      if (error) throw error;
      return data as DPRow[];
    },
    enabled: canAccess,
  });

  const userIds = Array.from(new Set(history.map((r) => r.created_by).filter(Boolean))) as string[];
  const { data: userMap = {} } = useQuery({
    queryKey: ["dp_user_names", userIds],
    queryFn: async () => {
      if (userIds.length === 0) return {} as Record<string, string>;
      const { data } = await supabase.from("user_profiles").select("user_id, full_name").in("user_id", userIds);
      const m: Record<string, string> = {};
      (data ?? []).forEach((u: any) => { m[u.user_id] = u.full_name; });
      return m;
    },
    enabled: userIds.length > 0,
  });

  const prodMap = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);

  // Form state: qtys[productId][width] for mattresses, qtys[productId]["_"] for bedding
  const [qtys, setQtys] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState(false);

  const setQty = (pid: string, key: string, v: string) => {
    setQtys((s) => ({ ...s, [pid]: { ...(s[pid] ?? {}), [key]: v } }));
  };

  const submit = async () => {
    if (!canAccess) return;
    const entries: { product_id: string; width: number; quantity: number; name: string }[] = [];
    for (const p of products) {
      const isBed = p.category === BEDDING_CATEGORY;
      if (isBed) {
        const q = Number(qtys[p.id]?.["_"] ?? 0);
        if (q > 0) entries.push({ product_id: p.id, width: 0, quantity: q, name: p.name });
      } else {
        for (const w of WIDTHS) {
          const q = Number(qtys[p.id]?.[String(w)] ?? 0);
          if (q > 0) entries.push({ product_id: p.id, width: w, quantity: q, name: p.name });
        }
      }
    }
    if (entries.length === 0) return toast.error("هیچ تعدادی وارد نشده");
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const jdate = formatJalali(today);

    const dpRows = entries.map((e) => ({
      production_date: today,
      product_id: e.product_id,
      width: e.width,
      quantity: e.quantity,
      created_by: user?.id ?? null,
      note: `تولید روزانه ${jdate}`,
    }));
    const { error: dpErr } = await (supabase as any).from("daily_production").insert(dpRows);
    if (dpErr) { setSaving(false); return toast.error(dpErr.message); }

    // Update inventory + product_inventory_transactions
    for (const e of entries) {
      const { data: invRow } = await supabase
        .from("inventory")
        .select("qty")
        .eq("product_id", e.product_id)
        .eq("width", e.width)
        .maybeSingle();
      const current = Number(invRow?.qty ?? 0);
      const newQty = current + e.quantity;
      await (supabase as any)
        .from("inventory")
        .upsert({ product_id: e.product_id, width: e.width, qty: newQty }, { onConflict: "product_id,width" });
      await (supabase as any).from("product_inventory_transactions").insert({
        product_id: e.product_id,
        width: e.width,
        type: "in",
        quantity: e.quantity,
        note: `تولید روزانه ${jdate}`,
        transaction_date: today,
        created_by: user?.id ?? null,
      });
    }

    toast.success("تولید روزانه با موفقیت ثبت شد");
    setQtys({});
    setSaving(false);
    qc.invalidateQueries({ queryKey: ["daily_production_history"] });
    qc.invalidateQueries({ queryKey: ["inventory"] });
    qc.invalidateQueries({ queryKey: ["product_inventory_transactions"] });
  };

  const exportExcel = () => {
    exportToExcel(
      history.map((r) => ({
        تاریخ: formatJalali(r.production_date),
        محصول: prodMap[r.product_id ?? ""]?.name ?? "—",
        عرض: r.width && r.width > 0 ? r.width : "—",
        تعداد: r.quantity,
        "ثبت‌کننده": r.created_by ? (userMap[r.created_by] ?? "—") : "—",
      })),
      "daily_production", "تولید روزانه"
    );
  };
  const printList = () => {
    const html = `<h1>تاریخچه تولید روزانه</h1><div class="meta">تاریخ چاپ: ${formatJalali(new Date())}</div>` +
      tableHtml(["تاریخ", "محصول", "عرض", "تعداد", "ثبت‌کننده"],
        history.map((r) => [
          formatJalali(r.production_date),
          prodMap[r.product_id ?? ""]?.name ?? "—",
          r.width && r.width > 0 ? String(r.width) : "—",
          fmt(r.quantity),
          r.created_by ? (userMap[r.created_by] ?? "—") : "—",
        ]));
    printHtml("تاریخچه تولید روزانه", html);
  };

  if (!canAccess) {
    return <Card className="p-6 text-center text-muted-foreground">دسترسی به این صفحه ندارید</Card>;
  }

  const mattresses = products.filter((p) => p.category !== BEDDING_CATEGORY);
  const bedding = products.filter((p) => p.category === BEDDING_CATEGORY);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><Factory className="h-6 w-6" /> تولید روزانه</h2>
          <p className="text-sm text-muted-foreground mt-1">ثبت تولید روزانه محصولات و افزایش خودکار موجودی</p>
        </div>
        <div className="text-sm bg-muted px-3 py-2 rounded-md">
          تاریخ امروز: <span className="font-bold">{formatJalali(today)}</span>
        </div>
      </div>

      <Card className="p-4 space-y-6">
        {mattresses.length > 0 && (
          <div>
            <h3 className="font-bold mb-2">تشک‌ها</h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>محصول</TableHead>
                    {WIDTHS.map((w) => <TableHead key={w} className="text-center">{w}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mattresses.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      {WIDTHS.map((w) => (
                        <TableCell key={w} className="p-1">
                          <Input
                            type="number"
                            min={0}
                            className="w-20 text-center"
                            value={qtys[p.id]?.[String(w)] ?? ""}
                            placeholder="0"
                            onChange={(e) => setQty(p.id, String(w), e.target.value)}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {bedding.length > 0 && (
          <div>
            <h3 className="font-bold mb-2">کالای خواب</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>محصول</TableHead>
                  <TableHead className="text-center w-40">تعداد</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bedding.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="p-1">
                      <Input
                        type="number"
                        min={0}
                        className="w-32 text-center mx-auto"
                        value={qtys[p.id]?.["_"] ?? ""}
                        placeholder="0"
                        onChange={(e) => setQty(p.id, "_", e.target.value)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {products.length === 0 && (
          <div className="text-center text-muted-foreground py-6">محصول فعالی یافت نشد</div>
        )}

        <div className="flex justify-end">
          <Button onClick={submit} disabled={saving || products.length === 0} className="bg-primary">
            {saving ? "در حال ثبت..." : "ثبت تولید امروز"}
          </Button>
        </div>
      </Card>

      <TransactionHistoryManager
        title="تاریخچه تولیدات"
        table="daily_production"
        canManage={canManageHistory}
        onPrint={printList}
        onDeleted={() => qc.invalidateQueries({ queryKey: ["daily_production_history"] })}
        rows={history.map((r) => ({
          id: r.id, date: r.production_date,
          name: `${prodMap[r.product_id ?? ""]?.name ?? "—"}${r.width && r.width > 0 ? ` (عرض ${r.width})` : ""}`,
          type: "in", quantity: Number(r.quantity), note: r.note ?? "",
          creatorId: r.created_by, creatorName: r.created_by ? (userMap[r.created_by] ?? "—") : "—",
        }))}
      />
    </div>
  );
}
