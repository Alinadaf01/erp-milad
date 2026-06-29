import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileSpreadsheet, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { exportToExcel } from "@/lib/export-utils";
import { formatJalali, fmt } from "@/lib/calc";
import { deleteHistoryRecords } from "@/lib/history.functions";

type HistoryTable = "inventory_transactions" | "product_inventory_transactions" | "daily_consumption" | "daily_production";

export type ManagedHistoryRow = {
  id: string;
  date: string;
  name: string;
  type: "in" | "out";
  quantity: number;
  note: string;
  creatorId: string | null;
  creatorName: string;
};

export function TransactionHistoryManager({
  title,
  rows,
  table,
  canManage,
  onDeleted,
  onPrint,
}: {
  title: string;
  rows: ManagedHistoryRow[];
  table: HistoryTable;
  canManage: boolean;
  onDeleted: () => void;
  onPrint?: () => void;
}) {
  const deleteRecords = useServerFn(deleteHistoryRecords);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [type, setType] = useState("all");
  const [creator, setCreator] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);

  const creators = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((row) => { if (row.creatorId) map.set(row.creatorId, row.creatorName); });
    return Array.from(map.entries());
  }, [rows]);

  const filtered = useMemo(() => rows.filter((row) =>
    (!fromDate || row.date >= fromDate) &&
    (!toDate || row.date <= toDate) &&
    (type === "all" || row.type === type) &&
    (creator === "all" || row.creatorId === creator)
  ), [rows, fromDate, toDate, type, creator]);

  const exportHistory = () => exportToExcel(filtered.map((row) => ({
    تاریخ: formatJalali(row.date),
    "نام ماده/محصول": row.name,
    نوع: row.type === "in" ? "ورود" : "خروج",
    مقدار: row.quantity,
    توضیحات: row.note || "—",
    "ثبت‌کننده": row.creatorName,
  })), `history-${table}`, "تاریخچه");

  const remove = async (ids: string[], clearAll = false) => {
    const message = clearAll
      ? "آیا از پاک کردن تمام تاریخچه اطمینان دارید؟"
      : `آیا از حذف ${ids.length} تراکنش اطمینان دارید؟ این عملیات قابل بازگشت نیست`;
    if (!window.confirm(message)) return;
    setDeleting(true);
    try {
      await deleteRecords({ data: { table, ids, clearAll } });
      setSelected([]);
      onDeleted();
      toast.success(clearAll ? "کل تاریخچه پاک شد" : "تراکنش‌های انتخابی حذف شدند");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "حذف تاریخچه ناموفق بود");
    } finally {
      setDeleting(false);
    }
  };

  const visibleIds = filtered.map((row) => row.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h3 className="text-lg font-bold">{title}</h3>
        <div className="flex flex-wrap items-center gap-2">
          {onPrint && (
            <Button variant="outline" size="sm" onClick={onPrint}>
              <Printer className="ml-1 h-4 w-4" /> چاپ
            </Button>
          )}
          {canManage && (
            <>
            <Button variant="outline" size="sm" onClick={exportHistory}>
              <FileSpreadsheet className="ml-1 h-4 w-4" /> خروجی اکسل
            </Button>
            <Button variant="outline" size="sm" disabled={deleting || selected.length === 0} onClick={() => remove(selected)}>
              <Trash2 className="ml-1 h-4 w-4" /> حذف موارد انتخابی
            </Button>
            <Button variant="destructive" size="sm" disabled={deleting || rows.length === 0} onClick={() => remove([], true)}>
              پاک کردن کل تاریخچه
            </Button>
            </>
          )}
        </div>
      </div>

      {canManage && (
        <Card className="p-3 mb-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1 text-xs text-muted-foreground">از تاریخ<Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></label>
            <label className="space-y-1 text-xs text-muted-foreground">تا تاریخ<Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue placeholder="نوع تراکنش" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه انواع</SelectItem>
                <SelectItem value="in">ورود</SelectItem>
                <SelectItem value="out">خروج</SelectItem>
              </SelectContent>
            </Select>
            <Select value={creator} onValueChange={setCreator}>
              <SelectTrigger><SelectValue placeholder="ثبت‌کننده" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه ثبت‌کنندگان</SelectItem>
                {creators.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </Card>
      )}

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {canManage && <TableHead className="w-10"><Checkbox checked={allVisibleSelected} onCheckedChange={(checked) => setSelected(checked ? Array.from(new Set([...selected, ...visibleIds])) : selected.filter((id) => !visibleIds.includes(id)))} /></TableHead>}
              <TableHead>تاریخ</TableHead><TableHead>نام ماده/محصول</TableHead><TableHead>نوع</TableHead>
              <TableHead>مقدار</TableHead><TableHead>توضیحات</TableHead><TableHead>ثبت‌کننده</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && <TableRow><TableCell colSpan={canManage ? 7 : 6} className="text-center text-muted-foreground py-8">رکوردی یافت نشد</TableCell></TableRow>}
            {filtered.map((row) => (
              <TableRow key={row.id}>
                {canManage && <TableCell><Checkbox checked={selected.includes(row.id)} onCheckedChange={(checked) => setSelected((current) => checked ? [...current, row.id] : current.filter((id) => id !== row.id))} /></TableCell>}
                <TableCell>{formatJalali(row.date)}</TableCell>
                <TableCell>{row.name}</TableCell>
                <TableCell className={row.type === "in" ? "font-medium text-primary" : "font-medium text-destructive"}>{row.type === "in" ? "ورود" : "خروج"}</TableCell>
                <TableCell>{fmt(row.quantity)}</TableCell>
                <TableCell className="text-muted-foreground">{row.note || "—"}</TableCell>
                <TableCell>{row.creatorName}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}