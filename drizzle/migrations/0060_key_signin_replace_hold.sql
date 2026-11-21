ALTER TABLE public.key_signin_requests
  ADD COLUMN IF NOT EXISTS replace_link_id uuid,
  ADD COLUMN IF NOT EXISTS pending_link jsonb,
  ADD COLUMN IF NOT EXISTS replace_tries integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS replaced_at timestamptz;

CREATE TABLE IF NOT EXISTS public.key_signin_alarm (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  sent_at timestamptz NOT NULL DEFAULT 'epoch'
);
GRANT ALL ON public.key_signin_alarm TO service_role;
ALTER TABLE public.key_signin_alarm ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service only" ON public.key_signin_alarm AS RESTRICTIVE TO anon, authenticated USING (false) WITH CHECK (false);
INSERT INTO public.key_signin_alarm (id) VALUES (1) ON CONFLICT (id) DO NOTHING;