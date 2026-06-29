import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole =
  | "admin" | "user"
  | "sales_manager" | "factory_manager"
  | "sales_expert" | "marketing_manager"
  | "production_manager" | "warehouse_keeper";

export function useUserRoles() {
  return useQuery({
    queryKey: ["user-roles"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { roles: [] as AppRole[], userId: null as string | null, fullName: "" };
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("user_profiles").select("role, full_name").eq("user_id", user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
      ]);
      const set = new Set<AppRole>();
      if (profile?.role) set.add(profile.role as AppRole);
      (roles ?? []).forEach((r: any) => set.add(r.role));
      return { roles: Array.from(set), userId: user.id, fullName: profile?.full_name ?? user.email ?? "" };
    },
  });
}

export function hasAnyRole(roles: AppRole[] | undefined, allowed: readonly string[]) {
  if (!roles) return false;
  return roles.some((r) => allowed.includes(r));
}
