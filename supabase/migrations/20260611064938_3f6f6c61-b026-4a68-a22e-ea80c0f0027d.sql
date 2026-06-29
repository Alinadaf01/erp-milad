
CREATE TABLE public.daily_production (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_date date NOT NULL DEFAULT CURRENT_DATE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  width integer,
  quantity integer NOT NULL DEFAULT 0,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_production TO authenticated;
GRANT ALL ON public.daily_production TO service_role;

ALTER TABLE public.daily_production ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_production_select_allowed"
  ON public.daily_production FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_id = auth.uid()
        AND role IN ('factory_manager','warehouse_keeper','production_manager','sales_manager','marketing_manager')
    )
  );

CREATE POLICY "daily_production_insert_allowed"
  ON public.daily_production FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_id = auth.uid()
        AND role IN ('factory_manager','warehouse_keeper')
    )
  );

CREATE INDEX idx_daily_production_date ON public.daily_production(production_date DESC);
CREATE INDEX idx_daily_production_product ON public.daily_production(product_id);
