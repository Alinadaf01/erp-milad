
-- Representatives table
CREATE TABLE public.representatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  province text,
  city text,
  address text,
  level text,
  is_active boolean NOT NULL DEFAULT true,
  can_order boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.representatives TO authenticated;
GRANT ALL ON public.representatives TO service_role;

ALTER TABLE public.representatives ENABLE ROW LEVEL SECURITY;

-- View: factory_manager, sales_manager, marketing_manager, sales_expert
CREATE POLICY "reps_select" ON public.representatives FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'factory_manager')
  OR public.has_role(auth.uid(), 'sales_manager')
  OR public.has_role(auth.uid(), 'marketing_manager')
  OR public.has_role(auth.uid(), 'sales_expert')
  OR EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid()
    AND role IN ('admin','factory_manager','sales_manager','marketing_manager','sales_expert'))
);

-- Insert: factory_manager, sales_manager, marketing_manager
CREATE POLICY "reps_insert" ON public.representatives FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'factory_manager')
  OR public.has_role(auth.uid(), 'sales_manager')
  OR public.has_role(auth.uid(), 'marketing_manager')
  OR EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid()
    AND role IN ('admin','factory_manager','sales_manager','marketing_manager'))
);

-- Update: same as insert
CREATE POLICY "reps_update" ON public.representatives FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'factory_manager')
  OR public.has_role(auth.uid(), 'sales_manager')
  OR public.has_role(auth.uid(), 'marketing_manager')
  OR EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid()
    AND role IN ('admin','factory_manager','sales_manager','marketing_manager'))
);

-- Delete: only factory_manager (and admin)
CREATE POLICY "reps_delete" ON public.representatives FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'factory_manager')
  OR EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid()
    AND role IN ('admin','factory_manager'))
);

CREATE TRIGGER set_representatives_updated_at BEFORE UPDATE ON public.representatives
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Orders new columns
ALTER TABLE public.orders ADD COLUMN representative_id uuid REFERENCES public.representatives(id);
ALTER TABLE public.orders ADD COLUMN is_walk_in boolean NOT NULL DEFAULT false;
