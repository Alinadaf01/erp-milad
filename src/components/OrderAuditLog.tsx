import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatJalaliDateTime } from "@/lib/calc";
import { History, User } from "lucide-react";

export function OrderAuditLog({ orderId }: { orderId: string }) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["order-audit-log", orderId],
    queryFn: async () => {
      const { data } = await (supabase.from("order_audit_log") as any)
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const userIds = Array.from(new Set((logs as any[]).map((l) => l.user_id).filter(Boolean)));
  const { data: profiles = [] } = useQuery({
    queryKey: ["audit-profiles", userIds.sort().join(",")],
    queryFn: async () => {
      if (userIds.length === 0) return [];
      const { data } = await supabase.from("user_profiles").select("user_id, full_name").in("user_id", userIds);
      return data ?? [];
    },
    enabled: userIds.length > 0,
  });
  const nameMap = new Map<string, string>();
  (profiles as any[]).forEach((p) => nameMap.set(p.user_id, p.full_name));

  return (
    <div className="mt-4 pt-4 border-t">
      <div className="flex items-center gap-2 mb-3 text-sm font-medium">
        <History className="h-4 w-4" />
        تاریخچه تغییرات
      </div>
      {isLoading ? (
        <div className="text-xs text-muted-foreground">در حال بارگذاری…</div>
      ) : logs.length === 0 ? (
        <div className="text-xs text-muted-foreground">رویدادی ثبت نشده است</div>
      ) : (
        <div className="space-y-2">
          {(logs as any[]).map((l) => (
            <div key={l.id} className="flex items-start justify-between gap-2 text-xs bg-muted/30 rounded p-2">
              <div className="flex-1">
                <div className="font-medium text-foreground">{l.action}</div>
                <div className="text-muted-foreground flex items-center gap-1 mt-1">
                  <User className="h-3 w-3" />
                  {l.user_id ? (nameMap.get(l.user_id) ?? "—") : "—"}
                </div>
              </div>
              <div className="text-muted-foreground whitespace-nowrap">{formatJalaliDateTime(l.created_at)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
