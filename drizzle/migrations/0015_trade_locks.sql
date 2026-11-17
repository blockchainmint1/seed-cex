CREATE TABLE public.trade_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  chain text NOT NULL CHECK (chain IN ('TXC','ISK')),
  wrapper text NOT NULL CHECK (wrapper IN ('p2sh','p2wsh')),
  generation integer NOT NULL DEFAULT 0 CHECK (generation >= 0),
  pocket_account integer NOT NULL,
  member_pub text NOT NULL CHECK (member_pub ~ '^0[23][0-9a-f]{64}$'),
  seeds_pub text NOT NULL CHECK (seeds_pub ~ '^0[23][0-9a-f]{64}$'),
  csv_blocks integer NOT NULL CHECK (csv_blocks BETWEEN 17 AND 65535),
  witness_script text NOT NULL,
  address text NOT NULL UNIQUE,
  custody_mode text NOT NULL CHECK (custody_mode IN ('approve','instant')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closing','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, chain, generation)
);
GRANT ALL ON public.trade_locks TO service_role;
ALTER TABLE public.trade_locks ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.trade_locks IS 'Locked trading balance descriptors (2-of-2 + CSV refund). Server-written only.';

CREATE TABLE public.lock_spends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lock_id uuid NOT NULL REFERENCES public.trade_locks(id),
  purpose text NOT NULL CHECK (purpose IN ('trade','unlock','refresh')),
  trade_id uuid,
  pair_id uuid,
  to_address text NOT NULL,
  property_id integer,
  amount text,
  unsigned_hex text NOT NULL,
  unsigned_sha256 text NOT NULL,
  inputs jsonb NOT NULL,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','signed','broadcast','confirmed','dropped','expired','refused')),
  signed_txid text,
  error text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lock_spends_lock_status_idx ON public.lock_spends (lock_id, status);
CREATE INDEX lock_spends_pair_idx ON public.lock_spends (pair_id) WHERE pair_id IS NOT NULL;
GRANT ALL ON public.lock_spends TO service_role;
ALTER TABLE public.lock_spends ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.lock_spends IS 'Seeds-built lock spends. Seeds only ever co-signs unsigned_hex it stored here. Server-written only.';

-- Permanent ledger: Seeds never co-signs the same coin twice (auditor condition).
CREATE TABLE public.lock_signed_outpoints (
  txid text NOT NULL CHECK (txid ~ '^[0-9a-f]{64}$'),
  vout integer NOT NULL CHECK (vout >= 0),
  spend_id uuid NOT NULL REFERENCES public.lock_spends(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (txid, vout)
);
GRANT SELECT, INSERT ON public.lock_signed_outpoints TO service_role;
ALTER TABLE public.lock_signed_outpoints ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.lock_signed_outpoints IS 'Every coin Seeds has co-signed. Insert-only; a duplicate key means Seeds must refuse to sign.';

-- Reserve every input of a set of spends in one statement: all or nothing.
CREATE OR REPLACE FUNCTION public.reserve_lock_outpoints(_spend_ids uuid[])
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.lock_signed_outpoints (txid, vout, spend_id)
  SELECT i->>'txid', (i->>'vout')::int, s.id
  FROM public.lock_spends s, jsonb_array_elements(s.inputs) i
  WHERE s.id = ANY(_spend_ids) AND s.status = 'proposed';
  UPDATE public.lock_spends SET status = 'signed', updated_at = now() WHERE id = ANY(_spend_ids) AND status = 'proposed';
  RETURN true;
EXCEPTION WHEN unique_violation THEN
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_lock_outpoints(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_lock_outpoints(uuid[]) TO service_role;