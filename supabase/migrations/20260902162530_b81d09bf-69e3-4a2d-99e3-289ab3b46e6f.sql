CREATE TABLE IF NOT EXISTS public.workspace (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.workspace TO service_role;
ALTER TABLE public.workspace ENABLE ROW LEVEL SECURITY;