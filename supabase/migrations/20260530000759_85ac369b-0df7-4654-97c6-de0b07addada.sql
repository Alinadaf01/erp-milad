-- Add new roles
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sales_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'factory_manager';

-- Add calc_type to raw_materials
ALTER TABLE public.raw_materials
  ADD COLUMN IF NOT EXISTS calc_type text NOT NULL DEFAULT 'per_width'
  CHECK (calc_type IN ('fixed', 'per_width', 'per_area'));

-- Allow new order statuses (status is plain text, ensure values are valid via check)
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'in_production', 'completed', 'delivered', 'overdue'));