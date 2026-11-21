ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS identity_kind text NOT NULL DEFAULT 'hme';
ALTER TABLE public.profiles ADD CONSTRAINT profiles_identity_kind_check CHECK (identity_kind IN ('hme','coin','evm','sol'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS identity_address text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_identity_unique ON public.profiles (identity_kind, identity_address) WHERE identity_address IS NOT NULL;
COMMENT ON COLUMN public.profiles.identity_kind IS 'How the account signs in: hme (Honest.Money), coin (recovery phrase via Seeds Key), evm / sol (outside wallet signature via Seeds Key). Server-written only.';

ALTER TABLE public.hme_links ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'hme_wallet';
ALTER TABLE public.hme_links ADD CONSTRAINT hme_links_source_check CHECK (source IN ('hme_wallet','seeds_key'));

CREATE TABLE public.key_signin_requests (
  challenge_id text PRIMARY KEY,
  challenge text NOT NULL,
  browser_secret_hash text NOT NULL,
  recipient_priv_ciphertext text NOT NULL,
  recipient_pubkey text NOT NULL,
  ip_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  user_id uuid,
  identity_kind text,
  created_account boolean NOT NULL DEFAULT false,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.key_signin_requests TO service_role;
ALTER TABLE public.key_signin_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service only" ON public.key_signin_requests AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE INDEX key_signin_requests_ip_idx ON public.key_signin_requests (ip_hash, created_at);

CREATE TABLE public.account_email_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  code_hash text NOT NULL,
  tries integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.account_email_codes TO service_role;
ALTER TABLE public.account_email_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service only" ON public.account_email_codes AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE INDEX account_email_codes_user_idx ON public.account_email_codes (user_id, created_at);