GRANT SELECT, INSERT, UPDATE ON public.workspace TO anon;
GRANT SELECT, INSERT, UPDATE ON public.workspace TO authenticated;
GRANT ALL ON public.workspace TO service_role;

DROP POLICY IF EXISTS "Anyone can read the shared workspace" ON public.workspace;
CREATE POLICY "Anyone can read the shared workspace" ON public.workspace FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can create the shared workspace" ON public.workspace FOR INSERT TO anon, authenticated WITH CHECK (id = 'lepdo-main');
CREATE POLICY "Anyone can update the shared workspace" ON public.workspace FOR UPDATE TO anon, authenticated USING (id = 'lepdo-main') WITH CHECK (id = 'lepdo-main');