CREATE TABLE public.relay_swaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  link_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('to_hype', 'from_hype')),
  pocket text NOT NULL CHECK (pocket ~ '^0x[0-9a-fA-F]{40}$'),
  amount_in numeric NOT NULL CHECK (amount_in > 0),
  amount_in_wei text NOT NULL CHECK (amount_in_wei ~ '^[0-9]+$'),
  shown_out numeric NOT NULL CHECK (shown_out > 0),
  min_out_wei text NOT NULL CHECK (min_out_wei ~ '^[0-9]+$'),
  slippage_bps integer NOT NULL CHECK (slippage_bps BETWEEN 10 AND 1000),
  amount_usd numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'awaiting_approval' CHECK (status IN ('awaiting_approval', 'approved', 'sending', 'bridging', 'done', 'refunded', 'failed', 'declined', 'expired', 'cancelled')),
  approval_id uuid,
  request_id text CHECK (request_id ~ '^0x[0-9a-f]{64}$'),
  quoted_out_wei text,
  deposit_txid text,
  out_txid text,
  amount_out numeric,
  error text,
  step_at timestamptz NOT NULL DEFAULT now(),
  working_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.relay_swaps TO service_role;
ALTER TABLE public.relay_swaps ENABLE ROW LEVEL SECURITY;
CREATE INDEX relay_swaps_user_idx ON public.relay_swaps (user_id, created_at DESC);
CREATE INDEX relay_swaps_open_idx ON public.relay_swaps (created_at) WHERE status NOT IN ('done', 'refunded', 'failed', 'declined', 'expired', 'cancelled');
-- A deposit is signed once: its hash, once stored, never changes.
CREATE OR REPLACE FUNCTION public.relay_swaps_txid_once() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.deposit_txid IS NOT NULL AND NEW.deposit_txid IS DISTINCT FROM OLD.deposit_txid THEN
    RAISE EXCEPTION 'deposit_txid is write-once';
  END IF;
  IF OLD.request_id IS NOT NULL AND NEW.request_id IS DISTINCT FROM OLD.request_id AND OLD.deposit_txid IS NOT NULL THEN
    RAISE EXCEPTION 'request_id is fixed once the deposit is signed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER relay_swaps_txid_once BEFORE UPDATE ON public.relay_swaps FOR EACH ROW EXECUTE FUNCTION public.relay_swaps_txid_once();
COMMENT ON TABLE public.relay_swaps IS 'Relay swaps ETH (Ethereum) <-> HYPE (HyperEVM) from and back to the member''s own EVM pocket. Server-only.';

CREATE OR REPLACE FUNCTION public.reserve_relay_swap(_row jsonb, _per_swap_max_usd numeric, _daily_max_usd numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _user uuid := (_row->>'user_id')::uuid;
  _usd numeric := COALESCE((_row->>'amount_usd')::numeric, 0);
  _used numeric;
  _id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('relay_swap:' || _user::text));
  UPDATE public.relay_swaps SET status = 'cancelled', error = COALESCE(error, 'Replaced by a newer swap request'), updated_at = now()
   WHERE user_id = _user AND status = 'awaiting_approval';
  IF EXISTS (SELECT 1 FROM public.relay_swaps WHERE user_id = _user
              AND status NOT IN ('done', 'refunded', 'failed', 'declined', 'expired', 'cancelled')) THEN
    RAISE EXCEPTION 'Another Relay swap is still running. Wait for it to finish.';
  END IF;
  IF _usd > _per_swap_max_usd THEN
    RAISE EXCEPTION 'This swap is over the $% per-swap limit.', _per_swap_max_usd;
  END IF;
  SELECT COALESCE(SUM(amount_usd), 0) INTO _used FROM public.relay_swaps
   WHERE user_id = _user AND status NOT IN ('failed', 'declined', 'expired', 'cancelled') AND created_at > now() - interval '24 hours';
  IF _used + _usd > _daily_max_usd THEN
    RAISE EXCEPTION 'This swap would pass the $% daily limit ($% used in the last 24 hours).', _daily_max_usd, round(_used, 2);
  END IF;
  INSERT INTO public.relay_swaps (user_id, link_id, direction, pocket, amount_in, amount_in_wei, shown_out, min_out_wei, slippage_bps, amount_usd)
  VALUES (_user, (_row->>'link_id')::uuid, _row->>'direction', _row->>'pocket', (_row->>'amount_in')::numeric, _row->>'amount_in_wei',
    (_row->>'shown_out')::numeric, _row->>'min_out_wei', (_row->>'slippage_bps')::integer, _usd)
  RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.reserve_relay_swap(jsonb, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_relay_swap(jsonb, numeric, numeric) TO service_role;

ALTER TABLE public.send_approvals DROP CONSTRAINT send_approvals_purpose_check;
ALTER TABLE public.send_approvals ADD CONSTRAINT send_approvals_purpose_check CHECK (purpose IN ('trade_leg', 'p2p_release', 'swap_out', 'dex_swap', 'withdrawal', 'two_step', 'loan_collateral', 'loan_funding', 'loan_repay', 'order', 'relay_swap'));