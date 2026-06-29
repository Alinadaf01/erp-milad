CREATE TABLE public.product_inventory_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  width integer NOT NULL DEFAULT 0,
  type text NOT NULL CHECK (type IN ('in','out')),
  quantity numeric NOT NULL,
  note text,
  transaction_date date NOT NULL DEFAULT (now()::date),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.product_inventory_transactions TO authenticated;
GRANT ALL ON public.product_inventory_transactions TO service_role;

ALTER TABLE public.product_inventory_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view product transactions"
  ON public.product_inventory_transactions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Factory manager or warehouse keeper can insert product transactions"
  ON public.product_inventory_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_id = auth.uid()
        AND role IN ('factory_manager', 'warehouse_keeper')
    )
  );

CREATE INDEX idx_pit_product ON public.product_inventory_transactions(product_id, width);
CREATE INDEX idx_pit_created_at ON public.product_inventory_transactions(created_at DESC);