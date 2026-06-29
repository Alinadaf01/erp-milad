import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const historyTableSchema = z.enum([
  "inventory_transactions",
  "product_inventory_transactions",
  "daily_consumption",
  "daily_production",
]);

export const deleteHistoryRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      table: historyTableSchema,
      ids: z.array(z.string().uuid()).max(1000).default([]),
      clearAll: z.boolean().default(false),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const [{ data: hasRole }, { data: profile }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "factory_manager" }),
      context.supabase.from("user_profiles").select("role").eq("user_id", context.userId).maybeSingle(),
    ]);
    if (!hasRole && profile?.role !== "factory_manager") {
      throw new Error("دسترسی غیرمجاز");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!data.clearAll && data.ids.length === 0) return { deleted: 0 };
    const query = supabaseAdmin.from(data.table).delete();
    const { error } = data.clearAll
      ? await query.not("id", "is", null)
      : await query.in("id", data.ids);
    if (error) throw error;
    return { deleted: data.clearAll ? -1 : data.ids.length };
  });