import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, Trash2, ChevronDown, Pencil, Lock, User, Printer, Check, X, Search } from "lucide-react";
import { toast } from "sonner";
import { ORDER_STATUSES, RESTRICTED_STATUSES, RESTRICTED_ROLES, EXIT_NUMBER_ROLES, ORDER_CREATE_ROLES, ORDER_DELETE_ROLES, DUE_DATE_ROLES, PROFORMA_CREATE_ROLES, canEditOrderFor, canEditProformaFor, allowedStatusesFor, fmt, fmtMoney, formatJalali, WIDTHS, BEDDING_CATEGORY } from "@/lib/calc";
import { useUserRoles, hasAnyRole } from "@/hooks/use-user-roles";
import { OrderComments } from "@/components/OrderComments";
import { OrderAuditLog } from "@/components/OrderAuditLog";
import { printHtml, tableHtml } from "@/lib/export-utils";
import { validateUniqueProformaNumber } from "@/lib/orders.functions";

function printOrder(o: any, creator: string) {
  const totalItems = o.order_items.reduce((a: number, b: any) => a + b.qty, 0);
  const totalPrice = o.order_items.reduce((a: number, b: any) => a + b.qty * (b.unit_price ?? 0), 0);
  const html = `<h1>سفارش — ${o.customer}</h1>
    <div class="meta">تاریخ سفارش: ${formatJalali(o.order_date)} ${o.due_date ? ` — تحویل: ${formatJalali(o.due_date)}` : ""}</div>
    <div class="meta">ثبت‌کننده: ${creator}${o.exit_number ? ` — شماره خروجی: ${o.exit_number}` : ""}</div>
    <div class="meta">وضعیت: ${ORDER_STATUSES[o.status as keyof typeof ORDER_STATUSES] ?? o.status}</div>` +
    tableHtml(["محصول", "عرض", "تعداد", "قیمت واحد", "جمع"],
      o.order_items.map((it: any) => [it.products?.name ?? "—", it.width, fmt(it.qty), fmtMoney(it.unit_price ?? 0), fmtMoney(it.qty * (it.unit_price ?? 0))])) +
    `<div class="total">جمع اقلام: ${fmt(totalItems)} عدد — جمع کل: ${fmtMoney(totalPrice)}</div>` +
    (o.notes ? `<div class="meta">یادداشت: ${o.notes}</div>` : "");
  printHtml(`سفارش ${o.customer}`, html);
}

export const Route = createFileRoute("/_authenticated/orders")({ component: OrdersPage });

type Item = { id?: string; product_id: string; width: number; qty: number; unit_price: number };
type Order = { id: string; customer: string; order_date: string; due_date: string | null; status: string; notes: string | null; exit_number: string | null; proforma_number: string | null };

function OrdersPage() {
  const qc = useQueryClient();
  const validateProformaNumber = useServerFn(validateUniqueProformaNumber);
  const todayStr = new Date().toISOString().slice(0, 10);
  const [filter, setFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const { data: me } = useUserRoles();
  const canSetRestricted = hasAnyRole(me?.roles, RESTRICTED_ROLES);
  const canEditExit = hasAnyRole(me?.roles, EXIT_NUMBER_ROLES);
  const canCreate = hasAnyRole(me?.roles, ORDER_CREATE_ROLES);
  const canDelete = hasAnyRole(me?.roles, ORDER_DELETE_ROLES);
  const canSetDueDate = hasAnyRole(me?.roles, DUE_DATE_ROLES);
  const canApprove = hasAnyRole(me?.roles, ["admin", "sales_manager"]);
  const canCreateProforma = hasAnyRole(me?.roles, PROFORMA_CREATE_ROLES);
  const canEditRep = hasAnyRole(me?.roles, ["admin", "factory_manager", "sales_manager", "sales_expert", "marketing_manager"]);

  // Who can add/remove/edit items on the currently-edited order
  const canEditItemsFor = (o: any | null): boolean => {
    if (!o) return true; // creating new order
    if (hasAnyRole(me?.roles, ["admin", "factory_manager"])) return true;
    if (o.status === "pending_approval") return o.created_by === me?.userId;
    return false;
  };

  const approveOrder = async (id: string, status: "pending" | "cancelled") => {
    const { error } = await supabase.from("orders").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(status === "pending" ? "سفارش تأیید شد" : "سفارش رد شد");
    qc.invalidateQueries({ queryKey: ["orders"] });
    qc.invalidateQueries({ queryKey: ["cartable"] });
  };

  const isSalesExpert = me?.roles?.includes("sales_expert") || me?.roles?.includes("marketing_manager");
  const { data: orders = [] } = useQuery({
    queryKey: ["orders", me?.userId, isSalesExpert],
    queryFn: async () => {
      let q = (supabase.from("orders") as any)
        .select("*, order_items(*, products(name))")
        .is("deleted_at", null)
        .neq("status", "delivered")
        .order("order_date", { ascending: false });
      if (isSalesExpert) q = q.eq("created_by", me?.userId);
      return (await q).data ?? [];
    },
  });
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await supabase.from("products").select("*").eq("active", true).order("name")).data ?? [],
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

  const { data: reps = [] } = useQuery({
    queryKey: ["representatives-active"],
    queryFn: async () => (await (supabase.from("representatives") as any).select("id, name, can_order, is_active, allowed_users").order("name")).data ?? [],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const repMap = useMemo(() => {
    const m = new Map<string, any>();
    (reps as any[]).forEach((r) => m.set(r.id, r));
    return m;
  }, [reps]);
  const isAlwaysAllowed = hasAnyRole(me?.roles, ["admin", "factory_manager", "sales_manager"]);
  const visibleReps = useMemo(() => {
    return (reps as any[]).filter((r) => {
      if (isAlwaysAllowed) return true;
      if (!r.allowed_users || r.allowed_users.length === 0) return true;
      return me?.userId ? r.allowed_users.includes(me.userId) : false;
    });
  }, [reps, isAlwaysAllowed, me?.userId]);

  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Order | null>(null);
  const [customerMode, setCustomerMode] = useState<"rep" | "walk_in">("rep");
  const [repId, setRepId] = useState<string>("");
  const [header, setHeader] = useState({ customer: "", order_date: new Date().toISOString().slice(0, 10), due_date: "", status: "pending", notes: "", exit_number: "", proforma_number: "" });
  const [items, setItems] = useState<Item[]>([]);

  const reset = () => {
    setHeader({ customer: "", order_date: new Date().toISOString().slice(0, 10), due_date: "", status: "pending", notes: "", exit_number: "", proforma_number: "" });
    setItems([]); setEdit(null); setCustomerMode("rep"); setRepId("");
  };

  const addLine = () => setItems([...items, { product_id: "", width: 90, qty: 1, unit_price: 0 }]);
  const removeLine = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateLine = (i: number, patch: Partial<Item>) => setItems(items.map((it, idx) => idx === i ? { ...it, ...patch } : it));

  const initialStatusForNew = () => {
    const r = new Set(me?.roles ?? []);
    if (r.has("admin") || r.has("factory_manager") || r.has("sales_manager")) return "pending";
    if (r.has("sales_expert") || r.has("marketing_manager")) return "pending_approval";
    return "pending";
  };
  const startNew = () => {
    reset();
    setHeader((h) => ({ ...h, status: initialStatusForNew() }));
    setItems([{ product_id: "", width: 90, qty: 1, unit_price: 0 }]);
    setOpen(true);
  };

  const startEdit = (o: any) => {
    setEdit(o);
    setHeader({ customer: o.customer, order_date: o.order_date, due_date: o.due_date ?? "", status: o.status, notes: o.notes ?? "", exit_number: o.exit_number ?? "", proforma_number: o.proforma_number ?? "" });
    setItems(o.order_items.map((it: any) => ({ id: it.id, product_id: it.product_id, width: it.width, qty: it.qty, unit_price: it.unit_price ?? 0 })));
    if (o.representative_id) { setCustomerMode("rep"); setRepId(o.representative_id); }
    else { setCustomerMode("walk_in"); setRepId(""); }
    setOpen(true);
  };

  const save = async () => {
    let customerName = header.customer.trim();
    let resolvedRepId: string | null = null;
    let walkIn = false;
    if (customerMode === "rep") {
      if (!repId) return toast.error("یک نماینده انتخاب کنید");
      // Re-verify can_order live from DB to avoid stale cache
      const { data: freshRep, error: repErr } = await (supabase.from("representatives") as any)
        .select("id, name, can_order, is_active").eq("id", repId).maybeSingle();
      // If RLS or fetch fails, fall back to cached rep from the list to avoid blocking the user
      const fallbackRep = repMap.get(repId);
      const effectiveRep = freshRep ?? fallbackRep;
      if (repErr && !effectiveRep) return toast.error(repErr.message);
      if (!effectiveRep) return toast.error("نماینده یافت نشد");
      if (effectiveRep.can_order === false) {
        qc.invalidateQueries({ queryKey: ["representatives-active"] });
        return toast.error("این نماینده مجاز به سفارش نیست");
      }
      customerName = effectiveRep.name;
      resolvedRepId = repId;
      walkIn = false;

    } else {
      if (!customerName) return toast.error("نام مشتری را وارد کنید");
      walkIn = true;
    }
    if (items.length === 0) return toast.error("حداقل یک محصول اضافه کنید");
    if (items.some(i => !i.product_id || i.qty <= 0)) return toast.error("اطلاعات اقلام را کامل کنید");
    if ((RESTRICTED_STATUSES as readonly string[]).includes(header.status) && !canSetRestricted) {
      return toast.error("تنها مدیر فروش یا مدیر کارخانه می‌تواند وضعیت معوق را تنظیم کند");
    }
    const oldDue = edit?.due_date ?? "";
    const newDue = header.due_date || "";
    if (newDue !== oldDue && !canSetDueDate) {
      return toast.error("شما اجازه تنظیم تاریخ تحویل را ندارید");
    }
    const isSettingDueDate = !edit || newDue !== oldDue;
    if (isSettingDueDate && newDue && newDue < todayStr) {
      return toast.error("تاریخ تحویل نمیتواند از امروز کمتر باشد");
    }
    const currentStatus = edit?.status ?? initialStatusForNew();
    if (!allowedStatusesFor(me?.roles, currentStatus).has(header.status)) {
      return toast.error("شما اجازه تنظیم این وضعیت را ندارید");
    }

    // Build payload — only include exit_number if user can edit it and it changed
    const basePayload: any = {
      customer: customerName,
      representative_id: resolvedRepId,
      is_walk_in: walkIn,
      order_date: header.order_date,
      due_date: header.due_date || null,
      status: header.status,
      notes: header.notes,
    };
    const newExit = header.exit_number.trim() || null;
    const oldExit = edit?.exit_number ?? null;
    if (newExit !== oldExit) {
      if (!canEditExit) {
        return toast.error("تنها انباردار یا مدیر کارخانه می‌تواند شماره خروجی را تنظیم کند");
      }
      basePayload.exit_number = newExit;
    }

    const newProforma = header.proforma_number.trim() || null;
    const oldProforma = edit?.proforma_number ?? null;
    if (newProforma) {
      try {
        await validateProformaNumber({ data: { proformaNumber: newProforma, excludeOrderId: edit?.id ?? null } });
      } catch (e: any) {
        return toast.error(e?.message ?? "این شماره پیش‌فاکتور قبلاً ثبت شده است");
      }
    }
    if (newProforma !== oldProforma) {
      const currentStatusForProforma = edit?.status ?? initialStatusForNew();
      const allowed = edit
        ? canEditProformaFor(me?.roles, currentStatusForProforma)
        : canCreateProforma;
      if (!allowed) {
        return toast.error("شما اجازه تنظیم شماره پیش‌فاکتور را ندارید");
      }
      basePayload.proforma_number = newProforma;
    }

    let orderId = edit?.id;
    if (edit) {
      const { error } = await supabase.from("orders").update(basePayload).eq("id", edit.id);
      if (error) return toast.error(error.message);
    } else {
      const insertPayload = { ...basePayload, created_by: me?.userId ?? null };
      const { data, error } = await supabase.from("orders").insert(insertPayload).select().single();
      if (error) return toast.error(error.message);
      orderId = data.id;
    }
    const itemsEditable = canEditItemsFor(edit);
    if (!edit || itemsEditable) {
      if (edit) {
        await supabase.from("order_items").delete().eq("order_id", edit.id);
      }
      const { error: itemsError } = await supabase.from("order_items").insert(
        items.map(i => ({ order_id: orderId!, product_id: i.product_id, width: i.width, qty: i.qty, unit_price: i.unit_price }))
      );
      if (itemsError) return toast.error(itemsError.message);
    }

    // Auto-deduct product inventory when transitioning to "delivered"
    const isDelivering = header.status === "delivered" && (!edit || edit.status !== "delivered");
    if (isDelivering) {
      // First validate all items have sufficient inventory
      const shortages: { name: string; width: number; current: number; needed: number }[] = [];
      for (const it of items) {
        const prod = products.find((p: any) => p.id === it.product_id);
        const { data: inv } = await supabase
          .from("inventory")
          .select("qty")
          .eq("product_id", it.product_id)
          .eq("width", it.width)
          .maybeSingle();
        const current = Number(inv?.qty ?? 0);
        const needed = Number(it.qty);
        if (current < needed) {
          shortages.push({ name: prod?.name ?? "محصول", width: it.width, current, needed });
        }
      }
      if (shortages.length > 0) {
        const first = shortages[0];
        return toast.error(
          `موجودی ${first.name} ${first.width} سانت کافی نیست. موجودی فعلی: ${first.current} عدد، نیاز: ${first.needed} عدد`
        );
      }
      // All items sufficient — deduct inventory and record transactions
      const orderLabel = newProforma ?? edit?.proforma_number ?? (orderId ? orderId.slice(0, 8) : "");
      for (const it of items) {
        const { data: inv } = await supabase
          .from("inventory")
          .select("qty")
          .eq("product_id", it.product_id)
          .eq("width", it.width)
          .maybeSingle();
        const current = Number(inv?.qty ?? 0);
        const newQty = current - Number(it.qty);
        await supabase.from("inventory").upsert(
          { product_id: it.product_id, width: it.width, qty: newQty },
          { onConflict: "product_id,width" }
        );
        await (supabase as any).from("product_inventory_transactions").insert({
          product_id: it.product_id,
          width: it.width,
          type: "out",
          quantity: it.qty,
          note: `تحویل سفارش ${orderLabel}`,
          transaction_date: new Date().toISOString().slice(0, 10),
          created_by: me?.userId ?? null,
        });
      }
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["product_inventory_transactions"] });
    }


    toast.success("ذخیره شد");
    qc.invalidateQueries({ queryKey: ["orders"] });
    setOpen(false); reset();
  };

  const del = async (o: any) => {
    if (!confirm("این سفارش به بخش «سفارشات حذف‌شده» منتقل می‌شود. ادامه می‌دهید؟")) return;
    const { error } = await (supabase.from("orders") as any)
      .update({ deleted_at: new Date().toISOString(), previous_status: o.status, status: "deleted" })
      .eq("id", o.id);
    if (error) return toast.error(error.message);
    toast.success("سفارش به سفارشات حذف‌شده منتقل شد");
    qc.invalidateQueries({ queryKey: ["orders"] });
    qc.invalidateQueries({ queryKey: ["orders-deleted"] });
  };

  const filtered = orders.filter((o: any) => {
    const matchesStatus = filter === "all" || o.status === filter;
    if (!matchesStatus) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    const customer = (o.customer ?? "").toLowerCase();
    const proforma = (o.proforma_number ?? "").toLowerCase();
    const exitNum = (o.exit_number ?? "").toLowerCase();
    return customer.includes(q) || proforma.includes(q) || exitNum.includes(q);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold">سفارشات</h2>
          <p className="text-sm text-muted-foreground mt-1">مدیریت سفارشات چندمحصولی مشتریان</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همه وضعیت‌ها</SelectItem>
              {Object.entries(ORDER_STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
            {canCreate && <DialogTrigger asChild><Button onClick={startNew}><Plus className="ml-1 h-4 w-4" /> سفارش جدید</Button></DialogTrigger>}
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{edit ? "ویرایش سفارش" : "سفارش جدید"}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="border rounded-lg p-3 space-y-3 bg-muted/20">
                  <Label>مشتری</Label>
                  {canEditRep ? (
                    <RadioGroup value={customerMode} onValueChange={(v) => setCustomerMode(v as any)} className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <RadioGroupItem value="rep" id="cm-rep" />
                        <span>نماینده</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <RadioGroupItem value="walk_in" id="cm-walk" />
                        <span>متفرقه</span>
                      </label>
                    </RadioGroup>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      {customerMode === "rep" ? "نماینده" : "متفرقه"}
                    </div>
                  )}
                  {customerMode === "rep" ? (
                    canEditRep ? (
                      <>
                        <Select value={repId} onValueChange={(v) => {
                          const r = repMap.get(v);
                          if (r && !r.can_order) { toast.error("این نماینده مجاز به سفارش نیست"); return; }
                          setRepId(v);
                        }}>
                          <SelectTrigger><SelectValue placeholder="انتخاب نماینده" /></SelectTrigger>
                          <SelectContent>
                            {visibleReps.map((r) => (
                              <SelectItem key={r.id} value={r.id} disabled={!r.can_order}>
                                <span className={!r.can_order ? "text-destructive" : ""}>
                                  {r.name}{!r.can_order && " — غیرمجاز"}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {repId && !repMap.get(repId)?.can_order && (
                          <p className="text-xs text-destructive">این نماینده مجاز به سفارش نیست</p>
                        )}
                      </>
                    ) : (
                      <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                        {repMap.get(repId)?.name ?? "—"}
                      </div>
                    )
                  ) : (
                    canEditRep ? (
                      <Input placeholder="نام مشتری متفرقه" value={header.customer} onChange={(e) => setHeader({ ...header, customer: e.target.value })} />
                    ) : (
                      <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                        {header.customer || "—"}
                      </div>
                    )
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label>وضعیت</Label>
                    <Select value={header.status} onValueChange={(v) => setHeader({ ...header, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(ORDER_STATUSES).map(([k, v]) => {
                          const currentStatus = edit?.status ?? initialStatusForNew();
                          const allowed = allowedStatusesFor(me?.roles, currentStatus);
                          const disabled = !allowed.has(k);
                          return (
                            <SelectItem key={k} value={k} disabled={disabled}>
                              <span className="flex items-center gap-1">{v}{disabled && <Lock className="h-3 w-3 opacity-60" />}</span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="flex items-center gap-1">
                      تاریخ تحویل
                      {!canSetDueDate && <Lock className="h-3 w-3 opacity-60" />}
                    </Label>
                    <Input type="date" value={header.due_date} onChange={(e) => setHeader({ ...header, due_date: e.target.value })} disabled={!canSetDueDate} readOnly={!canSetDueDate} min={todayStr} />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="flex items-center gap-1">
                      شماره خروجی
                      {!canEditExit && <Lock className="h-3 w-3 opacity-60" />}
                      <span className="text-xs text-muted-foreground">{canEditExit ? "(فقط انباردار / مدیر کارخانه)" : "(فقط انباردار یا مدیر کارخانه می‌تواند تنظیم کند)"}</span>
                    </Label>
                    <Input
                      value={header.exit_number}
                      onChange={(e) => setHeader({ ...header, exit_number: e.target.value })}
                      disabled={!canEditExit}
                      placeholder={canEditExit ? "مثال: EX-1024" : "—"}
                    />
                  </div>
                  {(() => {
                    const currentStatusForProforma = edit?.status ?? initialStatusForNew();
                    const canEditProforma = edit
                      ? canEditProformaFor(me?.roles, currentStatusForProforma)
                      : canCreateProforma;
                    return (
                      <div className="md:col-span-2">
                        <Label className="flex items-center gap-1">
                          شماره پیش‌فاکتور
                          {!canEditProforma && <Lock className="h-3 w-3 opacity-60" />}
                        </Label>
                        <Input
                          value={header.proforma_number}
                          onChange={(e) => setHeader({ ...header, proforma_number: e.target.value })}
                          disabled={!canEditProforma}
                          placeholder={canEditProforma ? "مثال: PF-1024" : "—"}
                        />
                      </div>
                    );
                  })()}
                </div>
                <div><Label>یادداشت</Label><Textarea value={header.notes} onChange={(e) => setHeader({ ...header, notes: e.target.value })} /></div>

                <div className="border-t pt-4">
                  {(() => {
                  const itemsEditable = canEditItemsFor(edit);
                  return (
                  <>
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-base">اقلام سفارش</Label>
                    <Button type="button" size="sm" variant="outline" onClick={addLine} disabled={!itemsEditable}><Plus className="ml-1 h-4 w-4" /> افزودن محصول</Button>
                  </div>
                  {!itemsEditable && (
                    <div className="text-xs text-muted-foreground mb-2">پس از تأیید مدیر فروش، فقط مدیر کارخانه می‌تواند محصول اضافه یا حذف کند.</div>
                  )}
                  <div className="space-y-2">
                    {items.map((it, i) => {
                      const prod = products.find((p: any) => p.id === it.product_id);
                      const isBedding = prod?.category === BEDDING_CATEGORY;
                      return (
                        <div key={i} className="grid grid-cols-12 gap-2 items-end p-3 rounded-lg bg-muted/30">
                          <div className={isBedding ? "col-span-12 md:col-span-6" : "col-span-12 md:col-span-4"}>
                            <Label className="text-xs">محصول</Label>
                            <Select
                              value={it.product_id}
                              onValueChange={(v) => {
                                const p = products.find((x: any) => x.id === v);
                                const bedding = p?.category === BEDDING_CATEGORY;
                                updateLine(i, { product_id: v, ...(bedding ? { width: 0 } : {}) });
                              }}
                            >
                              <SelectTrigger><SelectValue placeholder="انتخاب" /></SelectTrigger>
                              <SelectContent>{products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          {!isBedding && (
                            <div className="col-span-4 md:col-span-2">
                              <Label className="text-xs">عرض</Label>
                              {(() => {
                                const presetWidths = (prod?.widths ?? [...WIDTHS]) as number[];
                                const isCustom = !presetWidths.includes(it.width);
                                return (
                                  <div className="flex gap-1">
                                    <Select
                                      value={isCustom ? "__custom" : String(it.width)}
                                      onValueChange={(v) => updateLine(i, { width: v === "__custom" ? (it.width || 0) : Number(v) })}
                                    >
                                      <SelectTrigger><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        {presetWidths.map((w: number) => <SelectItem key={w} value={String(w)}>{w}</SelectItem>)}
                                        <SelectItem value="__custom">ویژه</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    {isCustom && (
                                      <Input type="number" className="w-20" value={it.width || ""} onChange={(e) => updateLine(i, { width: Number(e.target.value) })} placeholder="cm" />
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                          <div className="col-span-4 md:col-span-2"><Label className="text-xs">تعداد</Label><Input type="number" value={it.qty} onChange={(e) => updateLine(i, { qty: Number(e.target.value) })} /></div>
                          <div className="col-span-3 md:col-span-3"><Label className="text-xs">قیمت واحد</Label><Input type="number" value={it.unit_price} onChange={(e) => updateLine(i, { unit_price: Number(e.target.value) })} /></div>
                          <div className="col-span-1"><Button size="icon" variant="ghost" onClick={() => removeLine(i)} disabled={!itemsEditable}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>
                          <div className="col-span-12 text-xs text-muted-foreground">جمع خط: {fmtMoney(it.qty * it.unit_price)}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 text-sm text-left font-medium">
                    جمع کل: {fmt(items.reduce((a, b) => a + b.qty, 0))} عدد — {fmtMoney(items.reduce((a, b) => a + b.qty * b.unit_price, 0))}
                  </div>
                  </>
                  );
                  })()}
                </div>
              </div>
              <DialogFooter><Button onClick={save}>ذخیره</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          placeholder="جستجو بر اساس نام مشتری، شماره پیش‌فاکتور یا شماره سفارش"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-md"
        />
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && <Card><CardContent className="text-center text-muted-foreground py-8">سفارشی یافت نشد</CardContent></Card>}
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
                      <CardTitle className="text-base">{o.is_walk_in ? `${o.customer} (متفرقه)` : o.customer}</CardTitle>
                    </CollapsibleTrigger>
                    <Badge variant="outline"
                      className={
                        o.status === "delivered" ? "bg-success text-success-foreground" :
                        o.status === "completed" ? "bg-primary text-primary-foreground" :
                        o.status === "in_production" ? "bg-warning text-warning-foreground" :
                        o.status === "overdue" ? "bg-destructive text-destructive-foreground" : ""
                      }>
                      {ORDER_STATUSES[o.status as keyof typeof ORDER_STATUSES]}
                    </Badge>
                    <span className="text-sm text-muted-foreground">{o.order_items.length} قلم — {fmt(totalItems)} عدد</span>
                    {o.exit_number && <Badge variant="secondary">خروجی: {o.exit_number}</Badge>}
                    {o.proforma_number && <Badge variant="secondary">پیش‌فاکتور: {o.proforma_number}</Badge>}
                    {o.due_date && <span className="text-xs text-muted-foreground">تحویل: {formatJalali(o.due_date)}</span>}
                    <span className="text-xs text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" /> {creator}</span>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {canApprove && o.status === "pending_approval" && (
                      <>
                        <Button size="sm" onClick={() => approveOrder(o.id, "pending")}>
                          <Check className="h-4 w-4 ml-1" /> تأیید
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => approveOrder(o.id, "cancelled")}>
                          <X className="h-4 w-4 ml-1" /> رد
                        </Button>
                      </>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => printOrder(o, creator)} title="چاپ"><Printer className="h-4 w-4" /></Button>
                    {canEditOrderFor(me?.roles, o.status) && (
                      <Button size="icon" variant="ghost" onClick={() => startEdit(o)}><Pencil className="h-4 w-4" /></Button>
                    )}
                    {canDelete && (
                      <Button size="icon" variant="ghost" onClick={() => del(o)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    )}
                  </div>
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
                    <OrderComments orderId={o.id} />
                    <OrderAuditLog orderId={o.id} />
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
