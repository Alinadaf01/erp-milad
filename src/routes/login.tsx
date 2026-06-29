import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Bed } from "lucide-react";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("حساب کاربری ایجاد شد");
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("ورود موفقیت‌آمیز");

      const { data: { user } } = await supabase.auth.getUser();
      let target: "/dashboard" | "/orders" | "/production" | "/inventory" = "/dashboard";
      if (user) {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();
        const role = profile?.role;
        if (role === "sales_expert" || role === "marketing_manager") target = "/orders";
        else if (role === "production_manager") target = "/production";
        else if (role === "warehouse_keeper") target = "/inventory";
        else target = "/dashboard";
      }
      navigate({ to: target });
    } catch (err: any) {
      toast.error(err.message || "خطا در ورود");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-background via-sidebar to-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Bed className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl">سیستم مدیریت کارخانه تشک</CardTitle>
          <CardDescription>برای ورود به پنل مدیریت وارد شوید</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">ایمیل</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required dir="ltr" autoComplete="off" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">رمز عبور</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required dir="ltr" autoComplete="new-password" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "در حال پردازش..." : mode === "login" ? "ورود" : "ثبت‌نام و ورود"}
            </Button>
            <button
              type="button"
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
              className="w-full text-sm text-muted-foreground hover:text-foreground"
            >
              {mode === "login" ? "حساب ندارید؟ ثبت‌نام کنید" : "حساب دارید؟ ورود"}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
