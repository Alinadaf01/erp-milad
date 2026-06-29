CREATE POLICY "Allow production managers to read representatives"
ON public.representatives
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'production_manager'));