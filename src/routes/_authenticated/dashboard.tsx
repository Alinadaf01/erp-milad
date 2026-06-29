import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Package, Boxes, ShoppingCart, Warehouse, AlertTriangle, Inbox, Check, X, Clock, Hammer, CheckCircle2, CalendarClock } from "lucide-react";
import { fmt, ORDER_STATUSES, formatJalali } from "@/lib/calc";
import { useUserRoles, type AppRole } from "@/hooks/use-user-roles";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

type StatCard = { label: string; value: number; icon: any; color: string; sub?: string; alert?: boolean };

function pickRole(roles: AppRole[]): AppRole {
  const priority: AppRole[] = ["factory_manager", "admin", "sales_manager", "production_manager", "warehouse_keeper", "sales_expert", "marketing_manager", "user"];
  for (const r of priority) if (roles.includes(r)) return r;
  return "user";
}

function Dashboard() {
  const qc = useQueryClient();
  const { data: me } = useUserRoles();
  const role = pickRole(me?.roles ?? []);
  const userId = me?.userId;

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("orders").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("ذخیره شد");
    qc.invalidateQueries({ queryKey: ["dash"] });
    qc.invalidateQueries({ queryKey: ["orders"] });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">داشبورد</h2>
        <p className="text-muted-foreground text-sm mt-1">نمای کلی بر اساس نقش شما</p>
      </div>

      {(role === "factory_manager" || role === "admin") && <FactoryManagerView onUpdate={updateStatus} />}
      {role === "sales_manager" && <SalesManagerView onUpdate={updateStatus} />}
      {(role === "sales_expert" || role === "marketing_manager") && userId && <SalesExpertView userId={userId} />}
      {role === "production_manager" && <ProductionManagerView onUpdate={updateStatus} />}
      {role === "warehouse_keeper" && <WarehouseKeeperView onUpdate={updateStatus} />}
      {role === "user" && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">برای دسترسی به داشبورد، نقش شما باید توسط مدیر تعیین شود.</CardContent></Card>
      )}
    </div>
  );
}

function StatGrid({ stats }: { stats: StatCard[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((s) => (
        <Card key={s.label} className={s.alert ? "border-destructive/60 bg-destructive/10" : ""}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
            <s.icon className={`h-5 w-5 ${s.color}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${s.alert ? "text-destructive" : ""}`}>{fmt(Number(s.value))}</div>
            {s.sub && <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function OrderRow({ o, children }: { o: any; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-card/50 flex-wrap">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-medium">{o.customer}</span>
        <Badge variant="outline">{ORDER_STATUSES[o.status as keyof typeof ORDER_STATUSES] ?? o.status}</Badge>
        <span className="text-xs text-muted-foreground">ثبت: {formatJalali(o.order_date)}</span>
        {o.due_date && <span className="text-xs text-muted-foreground">تحویل: {formatJalali(o.due_date)}</span>}
      </div>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}

function CartableCard({ title, items, empty, children }: { title: string; items: any[]; empty: string; children: (o: any) => React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-3">
        <Inbox className="h-5 w-5 text-primary" />
        <CardTitle className="text-base">کارتابل — {title}</CardTitle>
        <Badge variant="secondary" className="mr-2">{fmt(items.length)}</Badge>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">{empty}</p>
        ) : (
          <div className="space-y-2">
            {items.map((o) => <OrderRow key={o.id} o={o}>{children(o)}</OrderRow>)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ===== Factory Manager =====
function FactoryManagerView({ onUpdate }: { onUpdate: (id: string, s: string) => void }) {
  const { data } = useQuery({
    queryKey: ["dash", "factory_manager"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [orders, materials, inventory, cartable] = await Promise.all([
        supabase.from("orders").select("id, status, due_date").is("deleted_at" as any, null),
        supabase.from("raw_materials").select("id, stock"),
        supabase.from("inventory").select("qty"),
        (supabase.from("orders") as any).select("id, customer, order_date, due_date, status, created_by").eq("status", "pending").is("deleted_at", null).order("order_date", { ascending: false }).limit(20),
      ]);
      const all = orders.data ?? [];
      const active = all.filter((o: any) => !["delivered", "cancelled"].includes(o.status)).length;
      const overdue = all.filter((o: any) => o.status !== "delivered" && o.status !== "cancelled" && o.due_date && o.due_date < today).length;
      const lowStock = (materials.data ?? []).filter((m: any) => Number(m.stock) <= 0).length;
      const totalStock = (inventory.data ?? []).reduce((a: number, b: any) => a + (b.qty ?? 0), 0);
      return { active, overdue, lowStock, totalStock, cartable: cartable.data ?? [] };
    },
  });
  const stats: StatCard[] = [
    { label: "کل سفارشات فعال", value: data?.active ?? 0, icon: ShoppingCart, color: "text-primary" },
    { label: "سفارشات معوق", value: data?.overdue ?? 0, icon: AlertTriangle, color: "text-destructive", alert: (data?.overdue ?? 0) > 0 },
    { label: "کمبود مواد خام", value: data?.lowStock ?? 0, icon: Boxes, color: "text-warning", alert: (data?.lowStock ?? 0) > 0 },
    { label: "موجودی کل کالای ساخته‌شده", value: data?.totalStock ?? 0, icon: Warehouse, color: "text-success" },
  ];
  return (
    <>
      <StatGrid stats={stats} />
      <CartableCard title="سفارشات تأیید شده جدید" items={data?.cartable ?? []} empty="سفارش تأیید شده جدیدی وجود ندارد">{() => null}</CartableCard>
    </>
  );
}

// ===== Sales Manager =====
function SalesManagerView({ onUpdate }: { onUpdate: (id: string, s: string) => void }) {
  const { data } = useQuery({
    queryKey: ["dash", "sales_manager"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [orders, cartable] = await Promise.all([
        supabase.from("orders").select("id, status, due_date").is("deleted_at" as any, null),
        (supabase.from("orders") as any).select("id, customer, order_date, due_date, status, created_by").eq("status", "pending_approval").is("deleted_at", null).order("order_date", { ascending: false }).limit(20),
      ]);
      const all = orders.data ?? [];
      const pendingApproval = all.filter((o: any) => o.status === "pending_approval").length;
      const active = all.filter((o: any) => !["delivered", "cancelled"].includes(o.status)).length;
      const overdue = all.filter((o: any) => o.status !== "delivered" && o.status !== "cancelled" && o.due_date && o.due_date < today).length;
      return { pendingApproval, active, overdue, cartable: cartable.data ?? [] };
    },
  });
  const stats: StatCard[] = [
    { label: "در انتظار تأیید", value: data?.pendingApproval ?? 0, icon: Clock, color: "text-warning" },
    { label: "کل سفارشات فعال", value: data?.active ?? 0, icon: ShoppingCart, color: "text-primary" },
    { label: "سفارشات معوق", value: data?.overdue ?? 0, icon: AlertTriangle, color: "text-destructive", alert: (data?.overdue ?? 0) > 0 },
  ];
  return (
    <>
      <StatGrid stats={stats} />
      <CartableCard title="سفارشات در انتظار تأیید" items={data?.cartable ?? []} empty="سفارش در انتظار تأییدی وجود ندارد">
        {(o) => (
          <>
            <Button size="sm" onClick={() => onUpdate(o.id, "pending")}><Check className="h-4 w-4 ml-1" /> تأیید</Button>
            <Button size="sm" variant="destructive" onClick={() => onUpdate(o.id, "cancelled")}><X className="h-4 w-4 ml-1" /> رد</Button>
          </>
        )}
      </CartableCard>
    </>
  );
}

// ===== Sales Expert =====
function SalesExpertView({ userId }: { userId: string }) {
  const { data } = useQuery({
    queryKey: ["dash", "sales_expert", userId],
    queryFn: async () => {
      const { data: orders } = await (supabase.from("orders") as any)
        .select("id, customer, order_date, due_date, status, created_by")
        .eq("created_by", userId)
        .is("deleted_at", null)
        .order("order_date", { ascending: false });
      const all = orders ?? [];
      return {
        pendingApproval: all.filter((o: any) => o.status === "pending_approval").length,
        inProduction: all.filter((o: any) => o.status === "in_production").length,
        completed: all.filter((o: any) => o.status === "completed" || o.status === "delivered").length,
        recent: all.slice(0, 10),
      };
    },
  });
  const stats: StatCard[] = [
    { label: "در انتظار تأیید", value: data?.pendingApproval ?? 0, icon: Clock, color: "text-warning" },
    { label: "در حال تولید", value: data?.inProduction ?? 0, icon: Hammer, color: "text-primary" },
    { label: "تکمیل شده", value: data?.completed ?? 0, icon: CheckCircle2, color: "text-success" },
  ];
  return (
    <>
      <StatGrid stats={stats} />
      <CartableCard title="آخرین سفارشات شما" items={data?.recent ?? []} empty="هنوز سفارشی ثبت نکرده‌اید">{() => null}</CartableCard>
    </>
  );
}

// ===== Production Manager =====
function ProductionManagerView({ onUpdate }: { onUpdate: (id: string, s: string) => void }) {
  const { data } = useQuery({
    queryKey: ["dash", "production_manager"],
    queryFn: async () => {
      const now = new Date();
      const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7);
      const todayStr = now.toISOString().slice(0, 10);
      const weekEndStr = weekEnd.toISOString().slice(0, 10);
      const [orders, weekPlan, cartable] = await Promise.all([
        supabase.from("orders").select("id, status, due_date").is("deleted_at" as any, null),
        (supabase.from("orders") as any).select("id, customer, order_date, due_date, status").in("status", ["pending", "in_production"]).gte("due_date", todayStr).lte("due_date", weekEndStr).is("deleted_at", null).order("due_date", { ascending: true }),
        (supabase.from("orders") as any).select("id, customer, order_date, due_date, status, created_by").eq("status", "pending").is("deleted_at", null).order("order_date", { ascending: false }).limit(20),
      ]);
      const all = orders.data ?? [];
      const needDue = all.filter((o: any) => o.status === "pending" && !o.due_date).length;
      const inProduction = all.filter((o: any) => o.status === "in_production").length;
      return { needDue, inProduction, week: weekPlan.data ?? [], cartable: cartable.data ?? [] };
    },
  });
  const stats: StatCard[] = [
    { label: "نیازمند تاریخ تحویل", value: data?.needDue ?? 0, icon: CalendarClock, color: "text-warning" },
    { label: "در حال تولید", value: data?.inProduction ?? 0, icon: Hammer, color: "text-primary" },
    { label: "برنامه تولید هفته جاری", value: data?.week.length ?? 0, icon: Package, color: "text-success" },
  ];
  return (
    <>
      <StatGrid stats={stats} />
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">برنامه تولید ۷ روز آینده</CardTitle></CardHeader>
        <CardContent>
          {(data?.week ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">سفارشی برای هفته جاری ندارید</p>
          ) : (
            <div className="space-y-2">{(data?.week ?? []).map((o: any) => <OrderRow key={o.id} o={o} />)}</div>
          )}
        </CardContent>
      </Card>
      <CartableCard title="سفارشات جدید تأیید شده" items={data?.cartable ?? []} empty="سفارش تأیید شده جدیدی نیست">
        {(o) => (
          <Button size="sm" onClick={() => onUpdate(o.id, "in_production")}><Check className="h-4 w-4 ml-1" /> شروع تولید</Button>
        )}
      </CartableCard>
    </>
  );
}

// ===== Warehouse Keeper =====
function WarehouseKeeperView({ onUpdate }: { onUpdate: (id: string, s: string) => void }) {
  const { data } = useQuery({
    queryKey: ["dash", "warehouse_keeper"],
    queryFn: async () => {
      const [materials, inventory, products, cartable] = await Promise.all([
        supabase.from("raw_materials").select("id, name, stock, unit"),
        supabase.from("inventory").select("product_id, qty"),
        supabase.from("products").select("id, name"),
        (supabase.from("orders") as any).select("id, customer, order_date, due_date, status, created_by").eq("status", "in_production").is("deleted_at", null).order("order_date", { ascending: false }).limit(20),
      ]);
      const mats = materials.data ?? [];
      const low = mats.filter((m: any) => Number(m.stock) <= 0);
      const inv = inventory.data ?? [];
      const totalStock = inv.reduce((a: number, b: any) => a + (b.qty ?? 0), 0);
      return { mats, low, totalStock, products: products.data ?? [], inventory: inv, cartable: cartable.data ?? [] };
    },
  });
  const stats: StatCard[] = [
    { label: "اقلام مواد خام", value: data?.mats.length ?? 0, icon: Boxes, color: "text-primary" },
    { label: "کمبود مواد خام", value: data?.low.length ?? 0, icon: AlertTriangle, color: "text-destructive", alert: (data?.low.length ?? 0) > 0 },
    { label: "موجودی کل کالای ساخته‌شده", value: data?.totalStock ?? 0, icon: Warehouse, color: "text-success" },
  ];
  return (
    <>
      <StatGrid stats={stats} />
      {(data?.low.length ?? 0) > 0 && (
        <Card className="border-destructive/60 bg-destructive/10">
          <CardHeader className="pb-3"><CardTitle className="text-base text-destructive">مواد خام با کمبود موجودی</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1">
              {(data?.low ?? []).map((m: any) => (
                <div key={m.id} className="flex justify-between text-sm border-b py-1">
                  <span>{m.name}</span>
                  <span className="text-destructive font-medium">{fmt(Number(m.stock))} {m.unit ?? ""}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      <CartableCard title="سفارشات در حال تولید آماده تغییر وضعیت" items={data?.cartable ?? []} empty="سفارشی در حال تولید نیست">
        {(o) => (
          <Button size="sm" onClick={() => onUpdate(o.id, "completed")}><Check className="h-4 w-4 ml-1" /> تکمیل شد</Button>
        )}
      </CartableCard>
    </>
  );
}
