CREATE TABLE public.wallet_delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  trading_path text NOT NULL,
  trading_txc_address text NOT NULL,
  key_ciphertext text NOT NULL,
  max_amount numeric NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.wallet_delegations TO service_role;
ALTER TABLE public.wallet_delegations ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER wallet_delegations_touch
BEFORE UPDATE ON public.wallet_delegations
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();