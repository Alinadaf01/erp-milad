-- Drop the old check constraint on orders.status
ALTER TABLE public.orders
DROP CONSTRAINT IF EXISTS orders_status_check;

-- Add the new check constraint with all valid status values
ALTER TABLE public.orders
ADD CONSTRAINT orders_status_check
CHECK (status IN ('pending_approval', 'pending', 'in_production', 'completed', 'delivered', 'overdue', 'deleted'));