import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Package, Boxes, ListChecks, Warehouse, ShoppingCart, Factory, Calculator, LogOut, Bed, Users, Trash2, Archive, UserCheck, BarChart3, ClipboardList, FlaskConical } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUserRoles, hasAnyRole } from "@/hooks/use-user-roles";

const ALL_ROLES = ["admin", "factory_manager", "sales_manager", "sales_expert", "marketing_manager", "production_manager", "warehouse_keeper"];

const sections: { label: string; items: { title: string; url: string; icon: any; roles: string[] }[] }[] = [
  {
    label: "منوی اصلی",
    items: [
      { title: "داشبورد", url: "/dashboard", icon: LayoutDashboard, roles: ALL_ROLES },
      { title: "سفارشات", url: "/orders", icon: ShoppingCart, roles: ALL_ROLES },
      { title: "برنامه تولید", url: "/production", icon: Factory, roles: ["admin", "factory_manager", "production_manager"] },
    ],
  },
  {
    label: "مدیریت انبار",
    items: [
      { title: "موجودی مواد خام", url: "/material-stock", icon: Warehouse, roles: ["admin", "factory_manager", "production_manager", "warehouse_keeper"] },
      { title: "موجودی محصولات", url: "/inventory", icon: Warehouse, roles: ["admin", "factory_manager", "warehouse_keeper", "sales_manager", "marketing_manager", "production_manager"] },
      { title: "مصرف روزانه", url: "/daily-consumption", icon: FlaskConical, roles: ["admin", "factory_manager", "warehouse_keeper"] },
      { title: "تولید روزانه", url: "/daily-production", icon: ClipboardList, roles: ["admin", "factory_manager", "warehouse_keeper"] },
    ],
  },
  {
    label: "مدیریت محصول",
    items: [
      { title: "مواد خام", url: "/materials", icon: Boxes, roles: ["admin", "factory_manager", "warehouse_keeper"] },
      { title: "محصولات", url: "/products", icon: Package, roles: ["admin", "factory_manager"] },
      { title: "فهرست مواد (BOM)", url: "/bom", icon: ListChecks, roles: ["admin", "factory_manager"] },
      { title: "محاسبه هزینه", url: "/cost", icon: Calculator, roles: ["admin", "factory_manager"] },
    ],
  },
  {
    label: "مدیریت فروش",
    items: [
      { title: "نمایندگان", url: "/representatives", icon: UserCheck, roles: ["admin", "factory_manager", "sales_manager", "marketing_manager", "sales_expert"] },
      { title: "گزارش فروش", url: "/sales-report", icon: BarChart3, roles: ["admin", "factory_manager", "sales_manager", "marketing_manager"] },
      { title: "بایگانی سفارشات", url: "/archive-orders", icon: Archive, roles: ALL_ROLES },
    ],
  },
];

const adminSection = {
  label: "مدیریت سیستم",
  items: [
    { title: "کاربران و نقش‌ها", url: "/users", icon: Users },
    { title: "سفارشات حذف‌شده", url: "/deleted-orders", icon: Trash2 },
  ],
};

export function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { data: me } = useUserRoles();
  const showAdmin = hasAnyRole(me?.roles, ["admin", "factory_manager"]);

  const logout = async () => {
    await supabase.auth.signOut();
    toast.success("خروج موفق");
    navigate({ to: "/login" });
  };

  return (
    <Sidebar side="right" collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Bed className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold">کارخانه تشک</span>
            <span className="text-xs text-muted-foreground">پنل مدیریت</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {sections.map((section) => {
          const visible = section.items.filter((it) => hasAnyRole(me?.roles, it.roles));
          if (visible.length === 0) return null;
          return (
            <SidebarGroup key={section.label}>
              <SidebarGroupLabel className="font-bold text-sidebar-foreground">{section.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visible.map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild isActive={path === item.url} className="pr-4">
                        <Link to={item.url}>
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
        {showAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="font-bold text-sidebar-foreground">{adminSection.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminSection.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={path === item.url} className="pr-4">
                      <Link to={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={logout}>
              <LogOut />
              <span>خروج</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
