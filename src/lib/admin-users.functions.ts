import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const adminChangeUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      userId: z.string().uuid(),
      newPassword: z.string().min(6).max(128),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId: callerId } = context;

    // Verify caller is admin or factory_manager
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("user_profiles")
      .select("role")
      .eq("user_id", callerId)
      .maybeSingle();
    if (profileErr) throw new Error(profileErr.message);

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);

    const allowedRoles = new Set(["admin", "factory_manager"]);
    const callerRoles = new Set<string>();
    if (profile?.role) callerRoles.add(profile.role);
    (roles ?? []).forEach((r: any) => callerRoles.add(r.role));

    const isAllowed = Array.from(callerRoles).some((r) => allowedRoles.has(r));
    if (!isAllowed) {
      throw new Error("شما اجازه تغییر رمز عبور را ندارید");
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.newPassword,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
