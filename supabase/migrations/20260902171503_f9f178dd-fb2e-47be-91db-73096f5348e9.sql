ALTER TABLE public.workspace ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.workspace TO anon;
GRANT SELECT ON public.workspace TO authenticated;
GRANT ALL ON public.workspace TO service_role;

DROP POLICY IF EXISTS "Anyone can read the shared workspace" ON public.workspace;
CREATE POLICY "Anyone can read the shared workspace"
ON public.workspace FOR SELECT
TO anon, authenticated
USING (true);

ALTER TABLE public.workspace REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'workspace'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace';
  END IF;
END $$;