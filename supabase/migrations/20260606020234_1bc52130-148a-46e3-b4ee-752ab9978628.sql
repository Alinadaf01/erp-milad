
CREATE TABLE public.inventory_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES public.raw_materials(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('in','out')),
  quantity numeric NOT NULL CHECK (quantity > 0),
  note text,
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.inventory_transactions TO authenticated;
GRANT ALL ON public.inventory_transactions TO service_role;

ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view transactions"
  ON public.inventory_transactions FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Factory manager or warehouse keeper can insert transactions"
  ON public.inventory_transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND (
      public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE user_id = auth.uid()
          AND role IN ('factory_manager','warehouse_keeper')
      )
    )
  );

CREATE INDEX idx_inventory_transactions_material ON public.inventory_transactions(material_id, created_at DESC);
