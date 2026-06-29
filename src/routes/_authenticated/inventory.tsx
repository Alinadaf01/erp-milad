import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { WIDTHS, fmt, formatJalali } from "@/lib/calc";
import { useUserRoles, hasAnyRole } from "@/hooks/use-user-roles";
import { Printer, FileSpreadsheet, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { exportToExcel, printHtml, tableHtml } from "@/lib/export-utils";
import { TransactionHistoryManager } from "@/components/TransactionHistoryManager";

export const Route = createFileRoute("/_authenticated/inventory")({ component: InventoryPage });

const EDIT_ROLES = ["factory_manager", "warehouse_keeper"];

type Product = { id: string; name: string; category: string | null; widths: number[] };
type Tx = {
  id: string;
  product_id: string;
  width: number;
  type: "in" | "out";
  quantity: number;
  note: string | null;
  transaction_date: string;
  created_at: string;
  created_by: string | null;
};

function InventoryPage() {
  const qc = useQueryClient();
  const { data: me } = useUserRoles();
  const canEdit = hasAnyRole(me?.roles, EDIT_ROLES);
  const canManageHistory = hasAnyRole(me?.roles, ["factory_manager"]);

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await supabase.from("products").select("*").eq("active", true).order("name")).data ?? [],
  });
  const { data: inventory = [] } = useQuery({
    queryKey: ["inventory"],
    queryFn: async () => (await supabase.from("inventory").select("*")).data ?? [],
  });
  const { data: txs = [] } = useQuery({
    queryKey: ["product_inventory_transactions", canManageHistory],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("product_inventory_transactions")
        .select("id, product_id, width, type, quantity, note, transaction_date, created_at, created_by")
        .order("created_at", { ascending: false })
        .limit(canManageHistory ? 1000 : 50);
      if (error) throw error;
      return data as Tx[];
    },
  });

  const userIds = Array.from(new Set(txs.map((t) => t.created_by).filter(Boolean))) as string[];
  const { data: userMap = {} } = useQuery({
    queryKey: ["pit_user_names", userIds],
    queryFn: async () => {
      if (userIds.length === 0) return {} as Record<string, string>;
      const { data } = await supabase.from("user_profiles").select("user_id, full_name").in("user_id", userIds);
      const m: Record<string, string> = {};
      (data ?? []).forEach((u: any) => { m[u.user_id] = u.full_name; });
      return m;
    },
    enabled: userIds.length > 0,
  });

  const getQty = (pid: string, w: number) =>
    inventory.find((i: any) => i.product_id === pid && i.width === w)?.qty ?? 0;

  const mattresses = (products as Product[]).filter((p) => p.category !== "کالای خواب");
  const bedding = (products as Product[]).filter((p) => p.category === "کالای خواب");
  const productMap: Record<string, Product> = Object.fromEntries((products as Product[]).map((p) => [p.id, p]));

  const widths = Array.from(new Set<number>([
    ...WIDTHS,
    ...mattresses.flatMap((p: any) => (p.widths ?? []).filter((w: number) => w > 0)),
  ])).sort((a, b) => a - b);

  const [modal, setModal] = useState<{ product: Product; width: number; type: "in" | "out"; currentQty: number } | null>(null);
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const openModal = (product: Product, width: number, type: "in" | "out") => {
    setModal({ product, width, type, currentQty: getQty(product.id, width) });
    setQty(""); setNote(""); setDate(new Date().toISOString().slice(0, 10));
  };

  const submit = async () => {
    if (!modal) return;
    const q = Number(qty);
    if (!q || q <= 0 || isNaN(q)) return toast.error("مقدار نامعتبر");
    if (modal.type === "out" && q > modal.currentQty) {
      return toast.error("مقدار خروج بیشتر از موجودی است");
    }
    setSaving(true);
    const newStock = modal.type === "in" ? modal.currentQty + q : modal.currentQty - q;
    const { data: { user } } = await supabase.auth.getUser();
    const { error: txErr } = await (supabase as any).from("product_inventory_transactions").insert({
      product_id: modal.product.id,
      width: modal.width,
      type: modal.type,
      quantity: q,
      note: note || null,
      transaction_date: date,
      created_by: user?.id,
    });
    if (txErr) { setSaving(false); return toast.error(txErr.message); }
    const { error: upErr } = await supabase.from("inventory").upsert(
      { product_id: modal.product.id, width: modal.width, qty: newStock },
      { onConflict: "product_id,width" }
    );
    if (upErr) { setSaving(false); return toast.error(upErr.message); }
    toast.success(modal.type === "in" ? "ورود ثبت شد" : "خروج ثبت شد");
    setSaving(false);
    setModal(null);
    qc.invalidateQueries({ queryKey: ["inventory"] });
    qc.invalidateQueries({ queryKey: ["product_inventory_transactions"] });
  };

  const buildRows = () => mattresses.map((p) => {
    const row: Record<string, any> = { محصول: p.name };
    widths.forEach((w) => { row[`عرض ${w}`] = p.widths.includes(w) ? getQty(p.id, w) : ""; });
    return row;
  });
  const exportExcel = () => exportToExcel(buildRows(), "inventory", "موجودی محصولات");
  const printList = () => {
    const html = `<h1>گزارش موجودی محصولات</h1><div class="meta">تاریخ: ${formatJalali(new Date())}</div>` +
      tableHtml(["محصول", ...widths.map((w) => `عرض ${w}`)],
        mattresses.map((p) => [p.name, ...widths.map((w) => p.widths.includes(w) ? fmt(getQty(p.id, w)) : "—")]));
    printHtml("گزارش موجودی محصولات", html);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold">موجودی محصولات</h2>
          <p className="text-sm text-muted-foreground mt-1">ورود و خروج موجودی محصولات به تفکیک عرض، با ثبت تاریخچه.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={printList}><Printer className="ml-1 h-4 w-4" /> چاپ</Button>
          <Button variant="outline" size="sm" onClick={exportExcel}><FileSpreadsheet className="ml-1 h-4 w-4" /> اکسل</Button>
        </div>
      </div>

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>محصول</TableHead>
              {widths.map((w) => <TableHead key={w}>عرض {w}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {mattresses.length === 0 && <TableRow><TableCell colSpan={widths.length + 1} className="text-center text-muted-foreground py-8">تشکی موجود نیست</TableCell></TableRow>}
            {mattresses.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                {widths.map((w) => (
                  <TableCell key={w}>
                    {p.widths.includes(w) ? (
                      <QtyCell qty={getQty(p.id, w)} canEdit={canEdit} onIn={() => openModal(p, w, "in")} onOut={() => openModal(p, w, "out")} />
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="pt-4">
        <div className="border-t mb-4" />
        <h3 className="text-xl font-bold mb-3">موجودی کالای خواب</h3>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>نام محصول</TableHead>
                <TableHead>تعداد موجود</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bedding.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-8">کالای خوابی موجود نیست</TableCell></TableRow>}
              {bedding.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>
                    <QtyCell qty={getQty(p.id, 0)} canEdit={canEdit} onIn={() => openModal(p, 0, "in")} onOut={() => openModal(p, 0, "out")} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>

      <TransactionHistoryManager
        title="تاریخچه تراکنش‌ها"
        table="product_inventory_transactions"
        canManage={canManageHistory}
        onDeleted={() => qc.invalidateQueries({ queryKey: ["product_inventory_transactions"] })}
        rows={txs.map((t) => ({
          id: t.id, date: t.transaction_date,
          name: `${productMap[t.product_id]?.name ?? "—"}${t.width ? ` (عرض ${t.width})` : ""}`,
          type: t.type, quantity: Number(t.quantity), note: t.note ?? "",
          creatorId: t.created_by, creatorName: t.created_by ? (userMap[t.created_by] ?? "—") : "—",
        }))}
      />

      <Dialog open={!!modal} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {modal?.type === "in" ? "ورود به انبار" : "خروج از انبار"} — {modal?.product.name}
              {modal && modal.width > 0 ? ` (عرض ${modal.width})` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>تعداد</Label>
              <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div>
              <Label>تاریخ</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              {date && <p className="text-xs text-muted-foreground mt-1">{formatJalali(date)}</p>}
            </div>
            <div>
              <Label>توضیحات (اختیاری)</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            </div>
            <div className="text-sm text-muted-foreground">
              موجودی فعلی: {modal && fmt(modal.currentQty)}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(null)}>انصراف</Button>
            <Button
              onClick={submit}
              disabled={saving}
              className={modal?.type === "in" ? "bg-green-600 hover:bg-green-700 text-white" : ""}
              variant={modal?.type === "out" ? "destructive" : "default"}
            >
              ثبت
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QtyCell({ qty, canEdit, onIn, onOut }: { qty: number; canEdit: boolean; onIn: () => void; onOut: () => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-medium">{fmt(qty)}</span>
      {canEdit && (
        <div className="flex gap-1">
          <Button size="icon" className="h-7 w-7 bg-green-600 hover:bg-green-700 text-white" onClick={onIn} title="ورود به انبار">
            <ArrowDownToLine className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="destructive" className="h-7 w-7" onClick={onOut} title="خروج از انبار">
            <ArrowUpFromLine className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
