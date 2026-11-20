CREATE TABLE public.dex_swaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  link_id uuid NOT NULL,
  network text NOT NULL CHECK (network IN ('ethereum', 'base', 'bsc', 'pulsechain')),
  from_address text NOT NULL,
  tsd_side text CHECK (tsd_side IN ('buy', 'sell')),
  tsd_address text,
  bridge_fee_bps integer,
  token_in text NOT NULL,
  token_out text NOT NULL,
  symbol_in text NOT NULL,
  symbol_out text NOT NULL,
  decimals_in integer NOT NULL,
  decimals_out integer NOT NULL,
  amount_in numeric NOT NULL CHECK (amount_in > 0),
  shown_out numeric NOT NULL CHECK (shown_out > 0),
  shown_leg_in_units text,
  shown_leg_out_units text,
  amount_in_units text,
  venue_id text,
  venue_name text,
  router text,
  kind text CHECK (kind IN ('v2', 'v3')),
  path text[],
  fees integer[],
  quoted_out_units text,
  min_out_units text,
  slippage_bps integer NOT NULL CHECK (slippage_bps BETWEEN 10 AND 1000),
  amount_usd numeric NOT NULL DEFAULT 0 CHECK (amount_usd >= 0),
  approval_id uuid,
  reset_txid text,
  approve_txid text,
  swap_txid text,
  received_units text,
  amount_out numeric,
  tsd_route_id uuid,
  status text NOT NULL DEFAULT 'awaiting_approval' CHECK (status IN (
    'awaiting_approval', 'approved', 'bridging', 'ready', 'approving', 'swapping', 'minting',
    'done', 'failed', 'declined', 'expired', 'cancelled', 'kept_usdc')),
  error text,
  working_until timestamptz,
  step_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.dex_swaps TO authenticated;
GRANT ALL ON public.dex_swaps TO service_role;

ALTER TABLE public.dex_swaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members see their own token swaps"
  ON public.dex_swaps FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX dex_swaps_user_created ON public.dex_swaps (user_id, created_at DESC);
CREATE INDEX dex_swaps_open ON public.dex_swaps (status) WHERE status NOT IN ('done', 'failed', 'declined', 'expired', 'cancelled', 'kept_usdc');
CREATE UNIQUE INDEX dex_swaps_swap_txid ON public.dex_swaps (swap_txid) WHERE swap_txid IS NOT NULL;
-- One open swap per member per network: two at once would fight over the same coins and transaction numbers.
CREATE UNIQUE INDEX dex_swaps_one_open ON public.dex_swaps (user_id, network)
  WHERE status NOT IN ('done', 'failed', 'declined', 'expired', 'cancelled', 'kept_usdc');

-- What was agreed never changes, set-once fields are set once, recorded transactions are permanent,
-- rows are never deleted, and a finished swap stays finished.
CREATE OR REPLACE FUNCTION public.dex_swaps_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Token swaps are permanent records';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.link_id IS DISTINCT FROM OLD.link_id
     OR NEW.network IS DISTINCT FROM OLD.network OR NEW.from_address IS DISTINCT FROM OLD.from_address
     OR NEW.tsd_side IS DISTINCT FROM OLD.tsd_side OR NEW.tsd_address IS DISTINCT FROM OLD.tsd_address
     OR NEW.bridge_fee_bps IS DISTINCT FROM OLD.bridge_fee_bps
     OR NEW.token_in IS DISTINCT FROM OLD.token_in OR NEW.token_out IS DISTINCT FROM OLD.token_out
     OR NEW.decimals_in IS DISTINCT FROM OLD.decimals_in OR NEW.decimals_out IS DISTINCT FROM OLD.decimals_out
     OR NEW.amount_in IS DISTINCT FROM OLD.amount_in OR NEW.shown_out IS DISTINCT FROM OLD.shown_out
     OR NEW.slippage_bps IS DISTINCT FROM OLD.slippage_bps OR NEW.amount_usd IS DISTINCT FROM OLD.amount_usd
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'What was agreed for this swap can never change';
  END IF;
  IF (OLD.amount_in_units IS NOT NULL AND NEW.amount_in_units IS DISTINCT FROM OLD.amount_in_units)
     OR (OLD.venue_id IS NOT NULL AND NEW.venue_id IS DISTINCT FROM OLD.venue_id)
     OR (OLD.router IS NOT NULL AND NEW.router IS DISTINCT FROM OLD.router)
     OR (OLD.path IS NOT NULL AND NEW.path IS DISTINCT FROM OLD.path)
     OR (OLD.fees IS NOT NULL AND NEW.fees IS DISTINCT FROM OLD.fees)
     OR (OLD.min_out_units IS NOT NULL AND NEW.min_out_units IS DISTINCT FROM OLD.min_out_units)
     OR (OLD.quoted_out_units IS NOT NULL AND NEW.quoted_out_units IS DISTINCT FROM OLD.quoted_out_units)
     OR (OLD.approval_id IS NOT NULL AND NEW.approval_id IS DISTINCT FROM OLD.approval_id)
     OR (OLD.tsd_route_id IS NOT NULL AND NEW.tsd_route_id IS DISTINCT FROM OLD.tsd_route_id)
     OR (OLD.reset_txid IS NOT NULL AND NEW.reset_txid IS DISTINCT FROM OLD.reset_txid)
     OR (OLD.approve_txid IS NOT NULL AND NEW.approve_txid IS DISTINCT FROM OLD.approve_txid)
     OR (OLD.swap_txid IS NOT NULL AND NEW.swap_txid IS DISTINCT FROM OLD.swap_txid) THEN
    RAISE EXCEPTION 'A recorded swap step can never change';
  END IF;
  IF OLD.status IN ('done', 'failed', 'declined', 'expired', 'cancelled', 'kept_usdc') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'A finished swap stays finished';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER dex_swaps_guard
  BEFORE UPDATE OR DELETE ON public.dex_swaps
  FOR EACH ROW EXECUTE FUNCTION public.dex_swaps_guard();

-- Create a swap only inside the member's limits, one open per network.
CREATE OR REPLACE FUNCTION public.reserve_dex_swap(_row jsonb, _per_swap_max_usd numeric, _daily_max_usd numeric)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user uuid := (_row->>'user_id')::uuid;
  _net text := _row->>'network';
  _usd numeric := COALESCE((_row->>'amount_usd')::numeric, 0);
  _used numeric;
  _id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('dex_swap:' || _user::text));

  -- A request nobody tapped yet is replaced by the new one.
  UPDATE public.dex_swaps
     SET status = CASE WHEN created_at < now() - interval '15 minutes' THEN 'expired' ELSE 'cancelled' END,
         error = COALESCE(error, 'Replaced by a newer swap request'), updated_at = now()
   WHERE user_id = _user AND network = _net AND status = 'awaiting_approval';

  IF EXISTS (SELECT 1 FROM public.dex_swaps WHERE user_id = _user AND network = _net
              AND status NOT IN ('done', 'failed', 'declined', 'expired', 'cancelled', 'kept_usdc')) THEN
    RAISE EXCEPTION 'Another token swap on this network is still running. Wait for it to finish.';
  END IF;

  IF _usd > _per_swap_max_usd THEN
    RAISE EXCEPTION 'This swap is over the $% per-swap limit.', _per_swap_max_usd;
  END IF;
  SELECT COALESCE(SUM(amount_usd), 0) INTO _used FROM public.dex_swaps
   WHERE user_id = _user AND status NOT IN ('failed', 'declined', 'expired', 'cancelled') AND created_at > now() - interval '24 hours';
  IF _used + _usd > _daily_max_usd THEN
    RAISE EXCEPTION 'This swap would pass the $% daily limit ($% used in the last 24 hours).', _daily_max_usd, round(_used, 2);
  END IF;

  INSERT INTO public.dex_swaps (user_id, link_id, network, from_address, tsd_side, tsd_address, bridge_fee_bps,
    token_in, token_out, symbol_in, symbol_out, decimals_in, decimals_out, amount_in, shown_out,
    shown_leg_in_units, shown_leg_out_units, amount_in_units, venue_id, venue_name, router, kind, path, fees,
    quoted_out_units, min_out_units, slippage_bps, amount_usd)
  VALUES (_user, (_row->>'link_id')::uuid, _net, _row->>'from_address', NULLIF(_row->>'tsd_side', ''), NULLIF(_row->>'tsd_address', ''),
    NULLIF(_row->>'bridge_fee_bps', '')::integer,
    _row->>'token_in', _row->>'token_out', _row->>'symbol_in', _row->>'symbol_out', (_row->>'decimals_in')::integer, (_row->>'decimals_out')::integer,
    (_row->>'amount_in')::numeric, (_row->>'shown_out')::numeric,
    NULLIF(_row->>'shown_leg_in_units', ''), NULLIF(_row->>'shown_leg_out_units', ''), NULLIF(_row->>'amount_in_units', ''),
    NULLIF(_row->>'venue_id', ''), NULLIF(_row->>'venue_name', ''), NULLIF(_row->>'router', ''), NULLIF(_row->>'kind', ''),
    CASE WHEN _row ? 'path' AND jsonb_typeof(_row->'path') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(_row->'path')) END,
    CASE WHEN _row ? 'fees' AND jsonb_typeof(_row->'fees') = 'array' THEN ARRAY(SELECT (jsonb_array_elements_text(_row->'fees'))::integer) END,
    NULLIF(_row->>'quoted_out_units', ''), NULLIF(_row->>'min_out_units', ''), (_row->>'slippage_bps')::integer, _usd)
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_dex_swap(jsonb, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_dex_swap(jsonb, numeric, numeric) TO service_role;

ALTER TABLE public.send_approvals DROP CONSTRAINT send_approvals_purpose_check;
ALTER TABLE public.send_approvals ADD CONSTRAINT send_approvals_purpose_check CHECK (purpose IN ('trade_leg', 'p2p_release', 'swap_out', 'dex_swap'));