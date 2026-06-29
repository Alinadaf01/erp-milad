
DROP POLICY IF EXISTS "Allow production managers to read representatives" ON public.representatives;
DROP POLICY IF EXISTS "Allow warehouse keepers to read representatives" ON public.representatives;

CREATE POLICY "reps_select_production_warehouse"
ON public.representatives
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'production_manager'::app_role)
  OR has_role(auth.uid(), 'warehouse_keeper'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('production_manager'::app_role, 'warehouse_keeper'::app_role)
  )
);
