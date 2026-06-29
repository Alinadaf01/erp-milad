import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, User, Archive, Search, RotateCcw, Trash2 } from "lucide-react";
import { fmt, fmtMoney, formatJalali } from "@/lib/calc";
import { OrderComments } from "@/components/OrderComments";
import { useUserRoles, hasAnyRole } from "@/hooks/use-user-roles";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/archive-orders")({
  component: ArchiveOrdersPage,
});

function ArchiveOrdersPage() {
  const qc = useQueryClient();
  const { data: me } = useUserRoles();
  const isFactoryManager = hasAnyRole(me?.roles, ["factory_manager", "admin"]);
  const isSalesExpert = me?.roles?.includes("sales_expert") || me?.roles?.includes("marketing_manager");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const restore = async (o: any) => {
    const items = o.order_items ?? [];
    for (const it of items) {
      const { data: inv } = await supabase
        .from("inventory")
        .select("qty")
        .eq("product_id", it.product_id)
        .eq("width", it.width)
        .maybeSingle();
      const current = Number(inv?.qty ?? 0);
      const newQty = current + Number(it.qty);
      await supabase.from("inventory").upsert(
        { product_id: it.product_id, width: it.width, qty: newQty },
        { onConflict: "product_id,width" }
      );
      await (supabase as any).from("product_inventory_transactions").insert({
        product_id: it.product_id,
        width: it.width,
        type: "in",
        quantity: it.qty,
        note: `بازگشت از بایگانی سفارش ${o.customer ?? ""}`,
        transaction_date: new Date().toISOString().slice(0, 10),
        created_by: me?.userId ?? null,
      });
    }
    const { error } = await supabase.from("orders").update({ status: "completed" }).eq("id", o.id);
    if (error) return toast.error(error.message);
    toast.success(`سفارش بازگردانده شد و موجودی ${items.length} محصول به‌روز شد`);
    qc.invalidateQueries({ queryKey: ["orders-archive"] });
    qc.invalidateQueries({ queryKey: ["orders"] });
    qc.invalidateQueries({ queryKey: ["inventory"] });
    qc.invalidateQueries({ queryKey: ["product_inventory_transactions"] });
  };
  const permanentDelete = async (id: string) => {
    if (!confirm("آیا از حذف این سفارش اطمینان دارید؟")) return;
    await supabase.from("order_items").delete().eq("order_id", id);
    const { error } = await supabase.from("orders").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("سفارش به‌طور کامل حذف شد");
    qc.invalidateQueries({ queryKey: ["orders-archive"] });
  };


  const { data: orders = [] } = useQuery({
    queryKey: ["orders-archive", me?.userId, isSalesExpert],
    queryFn: async () => {
      let q = (supabase.from("orders") as any)
        .select("*, order_items(*, products(name))")
        .is("deleted_at", null)
        .eq("status", "delivered")
        .order("order_date", { ascending: false });
      if (isSalesExpert) {
        q = q.eq("created_by", me?.userId);
      }
      return (await q).data ?? [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["user_profiles"],
    queryFn: async () => (await supabase.from("user_profiles").select("user_id, full_name")).data ?? [],
  });
  const profileMap = useMemo(() => {
    const m = new Map<string, string>();
    (profiles as any[]).forEach((p) => m.set(p.user_id, p.full_name));
    return m;
  }, [profiles]);

  const filtered = (orders as any[]).filter((o) => {
    if (search.trim() && !o.customer.toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (fromDate && o.order_date < fromDate) return false;
    if (toDate && o.order_date > toDate) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2"><Archive className="h-6 w-6" /> بایگانی سفارشات</h2>
        <p className="text-sm text-muted-foreground mt-1">سفارشات تحویل داده شده — فقط خواندنی</p>
      </div>

      <Card>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">جستجوی مشتری</Label>
            <div className="relative">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pr-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="نام مشتری..." />
            </div>
          </div>
          <div>
            <Label className="text-xs">از تاریخ</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">تا تاریخ</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <Card><CardContent className="text-center text-muted-foreground py-8">سفارشی در بایگانی یافت نشد</CardContent></Card>
        )}
        {filtered.map((o: any) => {
          const totalItems = o.order_items.reduce((a: number, b: any) => a + b.qty, 0);
          const totalPrice = o.order_items.reduce((a: number, b: any) => a + b.qty * (b.unit_price ?? 0), 0);
          const creator = o.created_by ? (profileMap.get(o.created_by) ?? "—") : "—";
          return (
            <Collapsible key={o.id}>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 py-3">
                  <div className="flex-1 flex items-center gap-3 flex-wrap">
                    <CollapsibleTrigger className="flex items-center gap-2">
                      <ChevronDown className="h-4 w-4" />
                      <CardTitle className="text-base">{o.customer}</CardTitle>
                    </CollapsibleTrigger>
                    <Badge className="bg-success text-success-foreground">تحویل داده شده</Badge>
                    <span className="text-sm text-muted-foreground">{o.order_items.length} قلم — {fmt(totalItems)} عدد</span>
                    {o.exit_number && <Badge variant="secondary">خروجی: {o.exit_number}</Badge>}
                    <span className="text-xs text-muted-foreground">تاریخ: {formatJalali(o.order_date)}</span>
                    {o.due_date && <span className="text-xs text-muted-foreground">تحویل: {formatJalali(o.due_date)}</span>}
                    <span className="text-xs text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" /> {creator}</span>
                  </div>
                  {isFactoryManager && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => restore(o)} title="بازگرداندن از بایگانی">
                        <RotateCcw className="h-4 w-4 ml-1" /> بازگردانی
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => permanentDelete(o.id)} title="حذف از بایگانی">
                        <Trash2 className="h-4 w-4 ml-1 text-destructive" /> حذف از بایگانی
                      </Button>
                    </div>
                  )}
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <div className="space-y-1 text-sm">
                      {o.order_items.map((it: any) => (
                        <div key={it.id} className="flex justify-between py-1 border-b border-border/50 last:border-0">
                          <span>{it.products?.name} — عرض {it.width}</span>
                          <span className="text-muted-foreground">{fmt(it.qty)} عدد {it.unit_price > 0 && `× ${fmtMoney(it.unit_price)}`}</span>
                        </div>
                      ))}
                      {totalPrice > 0 && <div className="text-left pt-2 font-medium">جمع: {fmtMoney(totalPrice)}</div>}
                      {o.notes && <div className="pt-2 text-muted-foreground">یادداشت: {o.notes}</div>}
                    </div>
                    <OrderComments orderId={o.id} readOnly />
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
