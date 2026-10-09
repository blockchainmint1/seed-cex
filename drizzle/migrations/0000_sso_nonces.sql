CREATE TABLE public.sso_nonces (
  nonce text PRIMARY KEY,
  used_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.sso_nonces TO service_role;
ALTER TABLE public.sso_nonces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service only" ON public.sso_nonces AS RESTRICTIVE FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);