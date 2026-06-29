
CREATE TABLE public.daily_consumption (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumption_date date NOT NULL DEFAULT (now()::date),
  material_id uuid REFERENCES public.raw_materials(id) ON DELETE SET NULL,
  quantity numeric NOT NULL DEFAULT 0,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_daily_consumption_date ON public.daily_consumption(consumption_date DESC);
CREATE INDEX idx_daily_consumption_material ON public.daily_consumption(material_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_consumption TO authenticated;
GRANT ALL ON public.daily_consumption TO service_role;

ALTER TABLE public.daily_consumption ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_consumption_select"
ON public.daily_consumption FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'factory_manager'::app_role)
  OR has_role(auth.uid(), 'warehouse_keeper'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE user_id = auth.uid()
      AND role IN ('admin'::app_role, 'factory_manager'::app_role, 'warehouse_keeper'::app_role)
  )
);

CREATE POLICY "daily_consumption_insert"
ON public.daily_consumption FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'factory_manager'::app_role)
  OR has_role(auth.uid(), 'warehouse_keeper'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE user_id = auth.uid()
      AND role IN ('admin'::app_role, 'factory_manager'::app_role, 'warehouse_keeper'::app_role)
  )
);
