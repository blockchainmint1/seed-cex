-- 1) Multi-chain shared access -------------------------------------------------
ALTER TABLE public.wallet_delegations RENAME COLUMN trading_txc_address TO trading_address;
ALTER TABLE public.wallet_delegations ADD COLUMN IF NOT EXISTS chain text NOT NULL DEFAULT 'txc';
ALTER TABLE public.wallet_delegations ADD COLUMN IF NOT EXISTS asset text NOT NULL DEFAULT 'native';
ALTER TABLE public.wallet_delegations ADD COLUMN IF NOT EXISTS label text;

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'public' AND rel.relname = 'wallet_delegations' AND con.contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.wallet_delegations DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_delegations_user_chain_uidx
  ON public.wallet_delegations (user_id, chain);

CREATE INDEX IF NOT EXISTS wallet_delegations_expiry_idx
  ON public.wallet_delegations (expires_at);

-- 2) Wallet sign-in challenges --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wallet_auth_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address text NOT NULL,
  nonce text NOT NULL,
  statement text NOT NULL,
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.wallet_auth_challenges TO service_role;
ALTER TABLE public.wallet_auth_challenges ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated grants and no policies: server-only by design.

CREATE INDEX IF NOT EXISTS wallet_auth_challenges_lookup_idx
  ON public.wallet_auth_challenges (address, nonce);
