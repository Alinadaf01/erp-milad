
-- Audit log table for orders
CREATE TABLE public.order_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid,
  action text NOT NULL,
  old_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_audit_log_order_id ON public.order_audit_log(order_id, created_at DESC);

GRANT SELECT, INSERT ON public.order_audit_log TO authenticated;
GRANT ALL ON public.order_audit_log TO service_role;

ALTER TABLE public.order_audit_log ENABLE ROW LEVEL SECURITY;

-- Read policy: factory_manager, sales_manager, production_manager, warehouse_keeper, admin -> all
-- sales_expert, marketing_manager -> only own orders
CREATE POLICY "audit_log_select" ON public.order_audit_log
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'factory_manager')
  OR public.has_role(auth.uid(), 'sales_manager')
  OR public.has_role(auth.uid(), 'production_manager')
  OR public.has_role(auth.uid(), 'warehouse_keeper')
  OR EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.user_id = auth.uid()
      AND up.role IN ('admin','factory_manager','sales_manager','production_manager','warehouse_keeper')
  )
  OR EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_audit_log.order_id
      AND o.created_by = auth.uid()
  )
);

CREATE POLICY "audit_log_insert" ON public.order_audit_log
FOR INSERT TO authenticated
WITH CHECK (true);

-- Trigger function: auto-log changes
CREATE OR REPLACE FUNCTION public.log_order_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  uname text;
BEGIN
  SELECT full_name INTO uname FROM public.user_profiles WHERE user_id = uid;
  IF uname IS NULL THEN uname := 'کاربر'; END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.order_audit_log(order_id, user_id, action, old_value, new_value)
    VALUES (NEW.id, uid, 'سفارش ایجاد شد', NULL, NEW.status);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Status change
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF OLD.status = 'pending_approval' AND NEW.status = 'pending' THEN
        INSERT INTO public.order_audit_log(order_id, user_id, action, old_value, new_value)
        VALUES (NEW.id, uid, 'سفارش توسط ' || uname || ' تأیید شد', OLD.status, NEW.status);
      ELSIF OLD.status = 'pending_approval' AND NEW.status = 'cancelled' THEN
        INSERT INTO public.order_audit_log(order_id, user_id, action, old_value, new_value)
        VALUES (NEW.id, uid, 'سفارش توسط ' || uname || ' رد شد', OLD.status, NEW.status);
      ELSE
        INSERT INTO public.order_audit_log(order_id, user_id, action, old_value, new_value)
        VALUES (NEW.id, uid, 'وضعیت از ' || COALESCE(OLD.status,'') || ' به ' || COALESCE(NEW.status,'') || ' تغییر کرد', OLD.status, NEW.status);
      END IF;
    END IF;

    -- Due date set/changed
    IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
      INSERT INTO public.order_audit_log(order_id, user_id, action, old_value, new_value)
      VALUES (NEW.id, uid, 'تاریخ تحویل تنظیم شد', OLD.due_date::text, NEW.due_date::text);
    END IF;

    -- Exit number set/changed
    IF NEW.exit_number IS DISTINCT FROM OLD.exit_number THEN
      INSERT INTO public.order_audit_log(order_id, user_id, action, old_value, new_value)
      VALUES (NEW.id, uid, 'شماره خروجی ثبت شد', OLD.exit_number, NEW.exit_number);
    END IF;

    -- Generic edit: customer/notes/order_date/proforma changes
    IF (NEW.customer IS DISTINCT FROM OLD.customer)
       OR (NEW.notes IS DISTINCT FROM OLD.notes)
       OR (NEW.order_date IS DISTINCT FROM OLD.order_date)
       OR (NEW.proforma_number IS DISTINCT FROM OLD.proforma_number) THEN
      INSERT INTO public.order_audit_log(order_id, user_id, action, old_value, new_value)
      VALUES (NEW.id, uid, 'سفارش ویرایش شد', NULL, NULL);
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_order_changes
AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.log_order_changes();
