CREATE TABLE public.monero_wallets (
  link_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  address text NOT NULL CHECK (address ~ '^4[1-9A-HJ-NP-Za-km-z]{94}$'),
  wallet_name text NOT NULL UNIQUE,
  restore_height integer CHECK (restore_height >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed')),
  balance_units numeric CHECK (balance_units >= 0),
  unlocked_units numeric CHECK (unlocked_units >= 0),
  scanned_height integer,
  scanned_at timestamptz,
  tries integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.monero_wallets TO service_role;
ALTER TABLE public.monero_wallets ENABLE ROW LEVEL SECURITY;
CREATE INDEX monero_wallets_scan_idx ON public.monero_wallets (status, scanned_at NULLS FIRST);
CREATE INDEX monero_wallets_user_idx ON public.monero_wallets (user_id);

CREATE TABLE public.monero_rpc_lease (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  holder text,
  until timestamptz NOT NULL DEFAULT 'epoch'
);
GRANT ALL ON public.monero_rpc_lease TO service_role;
ALTER TABLE public.monero_rpc_lease ENABLE ROW LEVEL SECURITY;
INSERT INTO public.monero_rpc_lease (id) VALUES (1) ON CONFLICT DO NOTHING;

-- monero-wallet-rpc opens one wallet at a time: callers take this short lease first.
CREATE OR REPLACE FUNCTION public.monero_take_lease(_holder text, _seconds integer)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.monero_rpc_lease SET holder = _holder, until = now() + make_interval(secs => LEAST(GREATEST(_seconds, 5), 300))
   WHERE id = 1 AND (until < now() OR holder = _holder)
  RETURNING true;
$$;
CREATE OR REPLACE FUNCTION public.monero_release_lease(_holder text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.monero_rpc_lease SET holder = NULL, until = 'epoch' WHERE id = 1 AND holder = _holder;
$$;
REVOKE ALL ON FUNCTION public.monero_take_lease(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.monero_release_lease(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.monero_take_lease(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.monero_release_lease(text) TO service_role;