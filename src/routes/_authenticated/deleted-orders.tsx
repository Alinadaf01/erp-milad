import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, RotateCcw, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { ORDER_STATUSES, fmt, fmtMoney } from "@/lib/calc";
import { useUserRoles, hasAnyRole } from "@/hooks/use-user-roles";

export const Route = createFileRoute("/_authenticated/deleted-orders")({
  component: DeletedOrdersPage,
});

const ALLOWED = ["admin", "factory_manager"] as const;

function DeletedOrdersPage() {
  const qc = useQueryClient();
  const { data: me, isLoading: meLoading } = useUserRoles();
  const allowed = hasAnyRole(me?.roles, ALLOWED);

  const { data: orders = [] } = useQuery({
    queryKey: ["orders-deleted"],
    enabled: allowed,
    queryFn: async () =>
      (await (supabase.from("orders") as any)
        .select("*, order_items(*, products(name))")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })).data ?? [],
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["user_profiles"],
    enabled: allowed,
    queryFn: async () => (await supabase.from("user_profiles").select("user_id, full_name")).data ?? [],
  });
  const profileMap = useMemo(() => {
    const m = new Map<string, string>();
    (profiles as any[]).forEach((p) => m.set(p.user_id, p.full_name));
    return m;
  }, [profiles]);

  if (meLoading) return <div>در حال بارگذاری...</div>;
  if (!allowed) {
    return (
      <Card className="p-8 text-center">
        <ShieldAlert className="h-10 w-10 mx-auto text-destructive mb-2" />
        <h2 className="text-lg font-bold">دسترسی غیرمجاز</h2>
        <p className="text-sm text-muted-foreground mt-2">
          فقط مدیر کارخانه می‌تواند این بخش را ببیند.
        </p>
      </Card>
    );
  }

  const restore = async (o: any) => {
    const prev = o.previous_status || "pending";
    const { error } = await (supabase.from("orders") as any)
      .update({ status: prev, deleted_at: null, previous_status: null })
      .eq("id", o.id);
    if (error) return toast.error(error.message);
    toast.success("سفارش بازگردانده شد");
    qc.invalidateQueries({ queryKey: ["orders-deleted"] });
    qc.invalidateQueries({ queryKey: ["orders"] });
  };

  const permanentDelete = async (id: string) => {
    if (!confirm("حذف نهایی این سفارش؟ این عمل غیرقابل بازگشت است.")) return;
    await supabase.from("order_items").delete().eq("order_id", id);
    const { error } = await supabase.from("orders").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("سفارش به‌طور نهایی حذف شد");
    qc.invalidateQueries({ queryKey: ["orders-deleted"] });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">سفارشات حذف‌شده</h2>
        <p className="text-sm text-muted-foreground mt-1">
          سفارشات حذف‌شده اینجا نگه‌داری می‌شوند. می‌توانید آن‌ها را بازگردانید یا به‌طور نهایی حذف کنید.
        </p>
      </div>

      <div className="space-y-3">
        {orders.length === 0 && (
          <Card><CardContent className="text-center text-muted-foreground py-8">سفارش حذف‌شده‌ای وجود ندارد</CardContent></Card>
        )}
        {orders.map((o: any) => {
          const totalItems = o.order_items.reduce((a: number, b: any) => a + b.qty, 0);
          const totalPrice = o.order_items.reduce((a: number, b: any) => a + b.qty * (b.unit_price ?? 0), 0);
          const creator = o.created_by ? (profileMap.get(o.created_by) ?? "—") : "—";
          const prevLabel = o.previous_status ? ORDER_STATUSES[o.previous_status as keyof typeof ORDER_STATUSES] : "—";
          return (
            <Card key={o.id}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 py-3">
                <div className="flex-1 flex items-center gap-3 flex-wrap">
                  <CardTitle className="text-base">{o.customer}</CardTitle>
                  <Badge variant="destructive">حذف‌شده</Badge>
                  <span className="text-xs text-muted-foreground">وضعیت قبلی: {prevLabel}</span>
                  <span className="text-sm text-muted-foreground">{o.order_items.length} قلم — {fmt(totalItems)} عدد</span>
                  {o.exit_number && <Badge variant="secondary">خروجی: {o.exit_number}</Badge>}
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" /> {creator}</span>
                  {o.deleted_at && <span className="text-xs text-muted-foreground">حذف در: {String(o.deleted_at).slice(0, 10)}</span>}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => restore(o)}>
                    <RotateCcw className="h-4 w-4 ml-1" /> بازگرداندن
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => permanentDelete(o.id)}>
                    <Trash2 className="h-4 w-4 ml-1" /> حذف نهایی
                  </Button>
                </div>
              </CardHeader>
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
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
