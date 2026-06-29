CREATE TABLE public.order_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_comments TO authenticated;
GRANT ALL ON public.order_comments TO service_role;

ALTER TABLE public.order_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read comments" ON public.order_comments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "users can insert their own comments" ON public.order_comments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can update their own comments" ON public.order_comments
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can delete their own comments" ON public.order_comments
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_order_comments_updated_at
  BEFORE UPDATE ON public.order_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_order_comments_order ON public.order_comments(order_id);