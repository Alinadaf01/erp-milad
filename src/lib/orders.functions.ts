import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const validateUniqueProformaNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      proformaNumber: z.string().optional().nullable(),
      excludeOrderId: z.string().uuid().optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const proformaNumber = data.proformaNumber?.trim();
    if (!proformaNumber) return { ok: true };

    let query = context.supabase
      .from("orders")
      .select("id")
      .eq("proforma_number", proformaNumber)
      .limit(1);

    if (data.excludeOrderId) query = query.neq("id", data.excludeOrderId);

    const { data: existing, error } = await query;
    if (error) throw new Error(error.message);
    if (existing && existing.length > 0) {
      throw new Error("این شماره پیش‌فاکتور قبلاً ثبت شده است");
    }

    return { ok: true };
  });