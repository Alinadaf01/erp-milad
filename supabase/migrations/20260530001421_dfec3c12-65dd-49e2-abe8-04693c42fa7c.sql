-- New roles
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sales_expert';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'production_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'warehouse_keeper';

-- user_profiles
CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  role public.app_role NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_profiles TO authenticated;
GRANT ALL ON public.user_profiles TO service_role;

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read all profiles" ON public.user_profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admins manage profiles" ON public.user_profiles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "users update own name" ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND role = (SELECT role FROM public.user_profiles WHERE user_id = auth.uid()));

CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Orders: exit_number + created_by
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS exit_number text,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Protect exit_number — only warehouse_keeper / factory_manager / admin
CREATE OR REPLACE FUNCTION public.protect_exit_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  allowed boolean;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.exit_number IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.exit_number IS NOT DISTINCT FROM OLD.exit_number THEN RETURN NEW; END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.user_profiles
    WHERE user_id = uid AND role IN ('warehouse_keeper', 'factory_manager')
  ) OR public.has_role(uid, 'admin') INTO allowed;

  IF NOT allowed THEN
    RAISE EXCEPTION 'تنها انباردار یا مدیر کارخانه می‌تواند شماره خروجی را تنظیم کند';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_protect_exit_number ON public.orders;
CREATE TRIGGER orders_protect_exit_number
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.protect_exit_number();