
ALTER TABLE public.raw_materials ADD COLUMN IF NOT EXISTS is_sized boolean NOT NULL DEFAULT false;
ALTER TABLE public.raw_materials ADD COLUMN IF NOT EXISTS material_type text NOT NULL DEFAULT 'scaled';

CREATE TABLE IF NOT EXISTS public.raw_material_sizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES public.raw_materials(id) ON DELETE CASCADE,
  width integer NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (material_id, width)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.raw_material_sizes TO authenticated;
GRANT ALL ON public.raw_material_sizes TO service_role;

ALTER TABLE public.raw_material_sizes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read raw_material_sizes"
  ON public.raw_material_sizes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Material editors write raw_material_sizes"
  ON public.raw_material_sizes FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.user_profiles
               WHERE user_id = auth.uid()
               AND role IN ('factory_manager','warehouse_keeper'))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.user_profiles
               WHERE user_id = auth.uid()
               AND role IN ('factory_manager','warehouse_keeper'))
  );

CREATE TRIGGER raw_material_sizes_updated_at
  BEFORE UPDATE ON public.raw_material_sizes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
