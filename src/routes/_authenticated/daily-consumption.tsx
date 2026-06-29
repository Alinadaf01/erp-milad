import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Printer, FileSpreadsheet, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { fmt, formatJalali, WIDTHS } from "@/lib/calc";
import { useUserRoles, hasAnyRole } from "@/hooks/use-user-roles";
import { exportToExcel, printHtml, tableHtml } from "@/lib/export-utils";
import { TransactionHistoryManager } from "@/components/TransactionHistoryManager";

export const Route = createFileRoute("/_authenticated/daily-consumption")({ component: DailyConsumptionPage });

const ACCESS_ROLES = ["admin", "factory_manager", "warehouse_keeper"];

type Material = { id: string; name: string; unit: string; stock: number; is_sized: boolean };
type SizeRow = { id: string; material_id: string; width: number; quantity: number };
type DCRow = {
  id: string;
  consumption_date: string;
  material_id: string | null;
  quantity: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

function DailyConsumptionPage() {
  const qc = useQueryClient();
  const { data: me } = useUserRoles();
  const canAccess = hasAnyRole(me?.roles, ACCESS_ROLES);
  const canManageHistory = hasAnyRole(me?.roles, ["factory_manager"]);

  const today = new Date().toISOString().slice(0, 10);

  const { data: materials = [] } = useQuery({
    queryKey: ["daily_consumption_materials"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("raw_materials")
        .select("id, name, unit, stock, is_sized")
        .order("name");
      if (error) throw error;
      return data as Material[];
    },
    enabled: canAccess,
  });

  const { data: sizes = [] } = useQuery({
    queryKey: ["raw_material_sizes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("raw_material_sizes").select("*");
      if (error) throw error;
      return (data ?? []) as SizeRow[];
    },
    enabled: canAccess,
  });

  const sizesByMat: Record<string, Record<number, number>> = {};
  for (const s of sizes) {
    sizesByMat[s.material_id] ??= {};
    sizesByMat[s.material_id][s.width] = Number(s.quantity);
  }

  const [filterDate, setFilterDate] = useState("");
  const { data: history = [] } = useQuery({
    queryKey: ["daily_consumption_history", filterDate, canManageHistory],
    queryFn: async () => {
      let q = (supabase as any)
        .from("daily_consumption")
        .select("id, consumption_date, material_id, quantity, note, created_by, created_at")
        .order("consumption_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(canManageHistory ? 1000 : 500);
      if (filterDate) q = q.eq("consumption_date", filterDate);
      const { data, error } = await q;
      if (error) throw error;
      return data as DCRow[];
    },
    enabled: canAccess,
  });

  const userIds = Array.from(new Set(history.map((r) => r.created_by).filter(Boolean))) as string[];
  const { data: userMap = {} } = useQuery({
    queryKey: ["dc_user_names", userIds],
    queryFn: async () => {
      if (userIds.length === 0) return {} as Record<string, string>;
      const { data } = await supabase.from("user_profiles").select("user_id, full_name").in("user_id", userIds);
      const m: Record<string, string> = {};
      (data ?? []).forEach((u: any) => { m[u.user_id] = u.full_name; });
      return m;
    },
    enabled: userIds.length > 0,
  });

  const matMap = useMemo(() => Object.fromEntries(materials.map((m) => [m.id, m])), [materials]);
  const nonSized = materials.filter((m) => !m.is_sized);
  const sized = materials.filter((m) => m.is_sized);

  // Quantities: nonSizedQtys[mat_id] = string, sizedQtys[mat_id][width] = string
  const [nonSizedQtys, setNonSizedQtys] = useState<Record<string, string>>({});
  const [sizedQtys, setSizedQtys] = useState<Record<string, Record<number, string>>>({});
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!canAccess) return;
    type Entry = { material: Material; quantity: number; width?: number };
    const entries: Entry[] = [];
    for (const m of nonSized) {
      const q = Number(nonSizedQtys[m.id] ?? 0);
      if (q > 0) entries.push({ material: m, quantity: q });
    }
    for (const m of sized) {
      for (const w of WIDTHS) {
        const q = Number(sizedQtys[m.id]?.[w] ?? 0);
        if (q > 0) entries.push({ material: m, quantity: q, width: w });
      }
    }
    if (entries.length === 0) return toast.error("هیچ مقداری وارد نشده");

    // Check stock sufficiency
    for (const e of entries) {
      const avail = e.material.is_sized
        ? (sizesByMat[e.material.id]?.[e.width!] ?? 0)
        : Number(e.material.stock ?? 0);
      if (e.quantity > avail) {
        return toast.error(`موجودی ${e.material.name}${e.width ? ` (عرض ${e.width})` : ""} کافی نیست`);
      }
    }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const jdate = formatJalali(today);

    const dcRows = entries.map((e) => ({
      consumption_date: today,
      material_id: e.material.id,
      quantity: e.quantity,
      created_by: user?.id ?? null,
      note: `مصرف روزانه ${jdate}${e.width ? ` (عرض ${e.width})` : ""}`,
    }));
    const { error: dcErr } = await (supabase as any).from("daily_consumption").insert(dcRows);
    if (dcErr) { setSaving(false); return toast.error(dcErr.message); }

    for (const e of entries) {
      if (e.material.is_sized) {
        const cur = sizesByMat[e.material.id]?.[e.width!] ?? 0;
        const newQty = Math.max(0, cur - e.quantity);
        await (supabase as any).from("raw_material_sizes").upsert(
          { material_id: e.material.id, width: e.width, quantity: newQty },
          { onConflict: "material_id,width" }
        );
      } else {
        const newStock = Math.max(0, Number(e.material.stock ?? 0) - e.quantity);
        await supabase.from("raw_materials").update({ stock: newStock }).eq("id", e.material.id);
      }
      await (supabase as any).from("inventory_transactions").insert({
        material_id: e.material.id,
        type: "out",
        quantity: e.quantity,
        note: `مصرف روزانه ${jdate}${e.width ? ` (عرض ${e.width})` : ""}`,
        transaction_date: today,
        created_by: user?.id ?? null,
      });
    }

    toast.success("مصرف روزانه با موفقیت ثبت شد");
    setNonSizedQtys({});
    setSizedQtys({});
    setSaving(false);
    qc.invalidateQueries({ queryKey: ["daily_consumption_history"] });
    qc.invalidateQueries({ queryKey: ["daily_consumption_materials"] });
    qc.invalidateQueries({ queryKey: ["raw_materials_stock"] });
    qc.invalidateQueries({ queryKey: ["raw_materials"] });
    qc.invalidateQueries({ queryKey: ["raw_material_sizes"] });
    qc.invalidateQueries({ queryKey: ["inventory_transactions_recent"] });
  };

  const exportExcel = () => {
    exportToExcel(
      history.map((r) => ({
        تاریخ: formatJalali(r.consumption_date),
        "نام ماده": matMap[r.material_id ?? ""]?.name ?? "—",
        واحد: matMap[r.material_id ?? ""]?.unit ?? "—",
        "مقدار مصرف": r.quantity,
        یادداشت: r.note ?? "",
        "ثبت‌کننده": r.created_by ? (userMap[r.created_by] ?? "—") : "—",
      })),
      "daily_consumption", "مصرف روزانه"
    );
  };
  const printList = () => {
    const html = `<h1>تاریخچه مصرف روزانه</h1><div class="meta">تاریخ چاپ: ${formatJalali(new Date())}</div>` +
      tableHtml(["تاریخ", "نام ماده", "واحد", "مقدار مصرف", "یادداشت", "ثبت‌کننده"],
        history.map((r) => [
          formatJalali(r.consumption_date),
          matMap[r.material_id ?? ""]?.name ?? "—",
          matMap[r.material_id ?? ""]?.unit ?? "—",
          fmt(r.quantity),
          r.note ?? "—",
          r.created_by ? (userMap[r.created_by] ?? "—") : "—",
        ]));
    printHtml("تاریخچه مصرف روزانه", html);
  };

  if (!canAccess) {
    return <Card className="p-6 text-center text-muted-foreground">دسترسی به این صفحه ندارید</Card>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><FlaskConical className="h-6 w-6" /> مصرف روزانه</h2>
          <p className="text-sm text-muted-foreground mt-1">ثبت مصرف روزانه مواد خام و کسر خودکار از موجودی</p>
        </div>
        <div className="text-sm bg-muted px-3 py-2 rounded-md">
          تاریخ امروز: <span className="font-bold">{formatJalali(today)}</span>
        </div>
      </div>

      <Card className="p-4 space-y-4">
        <Tabs defaultValue="non_sized">
          <TabsList>
            <TabsTrigger value="non_sized">مواد غیرسایزی ({nonSized.length})</TabsTrigger>
            <TabsTrigger value="sized">مواد سایزی ({sized.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="non_sized">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>نام ماده</TableHead>
                    <TableHead className="text-center">واحد</TableHead>
                    <TableHead className="text-center">موجودی فعلی</TableHead>
                    <TableHead className="text-center w-40">مقدار مصرف</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nonSized.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">ماده‌ای یافت نشد</TableCell></TableRow>
                  )}
                  {nonSized.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell className="text-center">{m.unit}</TableCell>
                      <TableCell className="text-center">{fmt(m.stock)}</TableCell>
                      <TableCell className="p-1">
                        <Input type="number" min={0} step="any" className="w-32 text-center mx-auto"
                          value={nonSizedQtys[m.id] ?? ""} placeholder="0"
                          onChange={(e) => setNonSizedQtys((s) => ({ ...s, [m.id]: e.target.value }))} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="sized">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>نام ماده</TableHead>
                    <TableHead className="text-center">واحد</TableHead>
                    {WIDTHS.map((w) => <TableHead key={w} className="text-center">عرض {w}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sized.length === 0 && (
                    <TableRow><TableCell colSpan={WIDTHS.length + 2} className="text-center text-muted-foreground py-6">ماده سایزی یافت نشد</TableCell></TableRow>
                  )}
                  {sized.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell className="text-center">{m.unit}</TableCell>
                      {WIDTHS.map((w) => {
                        const avail = sizesByMat[m.id]?.[w] ?? 0;
                        return (
                          <TableCell key={w} className="p-1 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span className="text-xs text-muted-foreground">موجودی: {fmt(avail)}</span>
                              <Input type="number" min={0} step="any" className="w-24 text-center"
                                value={sizedQtys[m.id]?.[w] ?? ""} placeholder="0"
                                onChange={(e) => setSizedQtys((s) => ({
                                  ...s,
                                  [m.id]: { ...(s[m.id] ?? {}), [w]: e.target.value }
                                }))} />
                            </div>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end">
          <Button onClick={submit} disabled={saving || materials.length === 0} className="bg-primary">
            {saving ? "در حال ثبت..." : "ثبت مصرف امروز"}
          </Button>
        </div>
      </Card>

      <TransactionHistoryManager
        title="تاریخچه مصرف"
        table="daily_consumption"
        canManage={canManageHistory}
        onPrint={printList}
        onDeleted={() => qc.invalidateQueries({ queryKey: ["daily_consumption_history"] })}
        rows={history.map((r) => ({
          id: r.id, date: r.consumption_date, name: matMap[r.material_id ?? ""]?.name ?? "—",
          type: "out", quantity: Number(r.quantity), note: r.note ?? "",
          creatorId: r.created_by, creatorName: r.created_by ? (userMap[r.created_by] ?? "—") : "—",
        }))}
      />
    </div>
  );
}
