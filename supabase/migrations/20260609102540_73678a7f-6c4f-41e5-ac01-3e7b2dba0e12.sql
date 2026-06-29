CREATE POLICY "Allow warehouse keepers to read representatives"
ON public.representatives
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'warehouse_keeper'));