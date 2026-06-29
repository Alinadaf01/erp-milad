
ALTER TABLE public.bom ADD COLUMN IF NOT EXISTS qty_90 numeric;
ALTER TABLE public.bom ADD COLUMN IF NOT EXISTS qty_120 numeric;
ALTER TABLE public.bom ADD COLUMN IF NOT EXISTS qty_140 numeric;
ALTER TABLE public.bom ADD COLUMN IF NOT EXISTS qty_160 numeric;
ALTER TABLE public.bom ADD COLUMN IF NOT EXISTS qty_180 numeric;
ALTER TABLE public.bom ADD COLUMN IF NOT EXISTS qty_200 numeric;

UPDATE public.bom SET qty_90 = qty_per_base_width WHERE qty_90 IS NULL;
