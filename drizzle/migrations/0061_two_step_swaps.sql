CREATE TABLE public.two_step_swaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  link_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('dex_then_x', 'x_then_dex')),
  network text NOT NULL CHECK (network IN ('ethereum', 'base', 'bsc')),
  token_address text NOT NULL,
  token_symbol text NOT NULL,
  token_decimals integer NOT NULL,
  coin_id text NOT NULL,
  mid_id text NOT NULL,
  symbol_in text NOT NULL,
  symbol_out text NOT NULL,
  protocol text NOT NULL CHECK (protocol IN ('thorchain', 'maya')),
  amount_in numeric NOT NULL CHECK (amount_in > 0),
  shown_mid numeric NOT NULL CHECK (shown_mid > 0),
  shown_out numeric NOT NULL CHECK (shown_out > 0),
  min_out numeric NOT NULL CHECK (min_out > 0),
  slippage_bps integer NOT NULL CHECK (slippage_bps BETWEEN 10 AND 1000),
  amount_usd numeric NOT NULL DEFAULT 0 CHECK (amount_usd >= 0),
  from_address text NOT NULL,
  to_address text NOT NULL,
  approval_id uuid,
  dex_swap_id uuid,
  swap_send_id uuid,
  leg2_dex_swap_id uuid,
  leg2_swap_send_id uuid,
  mid_amount numeric,
  amount_out numeric,
  status text NOT NULL DEFAULT 'awaiting_approval' CHECK (status IN (
    'awaiting_approval', 'approved', 'leg1', 'mid', 'leg2',
    'done', 'failed', 'refunded', 'kept_mid', 'declined', 'expired', 'cancelled')),
  error text,
  working_until timestamptz,
  step_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.two_step_swaps TO authenticated;
GRANT ALL ON public.two_step_swaps TO service_role;

ALTER TABLE public.two_step_swaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members see their own two-step swaps"
  ON public.two_step_swaps FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX two_step_swaps_user_created ON public.two_step_swaps (user_id, created_at DESC);
CREATE INDEX two_step_swaps_open ON public.two_step_swaps (status)
  WHERE status NOT IN ('done', 'failed', 'refunded', 'kept_mid', 'declined', 'expired', 'cancelled');
CREATE UNIQUE INDEX two_step_swaps_one_open ON public.two_step_swaps (user_id)
  WHERE status NOT IN ('done', 'failed', 'refunded', 'kept_mid', 'declined', 'expired', 'cancelled');

CREATE OR REPLACE FUNCTION public.two_step_swaps_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Two-step swaps are permanent records';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.link_id IS DISTINCT FROM OLD.link_id
     OR NEW.direction IS DISTINCT FROM OLD.direction OR NEW.network IS DISTINCT FROM OLD.network
     OR NEW.token_address IS DISTINCT FROM OLD.token_address OR NEW.token_decimals IS DISTINCT FROM OLD.token_decimals
     OR NEW.coin_id IS DISTINCT FROM OLD.coin_id OR NEW.mid_id IS DISTINCT FROM OLD.mid_id
     OR NEW.protocol IS DISTINCT FROM OLD.protocol
     OR NEW.amount_in IS DISTINCT FROM OLD.amount_in OR NEW.shown_mid IS DISTINCT FROM OLD.shown_mid
     OR NEW.shown_out IS DISTINCT FROM OLD.shown_out OR NEW.min_out IS DISTINCT FROM OLD.min_out
     OR NEW.slippage_bps IS DISTINCT FROM OLD.slippage_bps OR NEW.amount_usd IS DISTINCT FROM OLD.amount_usd
     OR NEW.from_address IS DISTINCT FROM OLD.from_address OR NEW.to_address IS DISTINCT FROM OLD.to_address
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'What was agreed for this swap can never change';
  END IF;
  IF (OLD.approval_id IS NOT NULL AND NEW.approval_id IS DISTINCT FROM OLD.approval_id)
     OR (OLD.dex_swap_id IS NOT NULL AND NEW.dex_swap_id IS DISTINCT FROM OLD.dex_swap_id)
     OR (OLD.swap_send_id IS NOT NULL AND NEW.swap_send_id IS DISTINCT FROM OLD.swap_send_id)
     OR (OLD.leg2_dex_swap_id IS NOT NULL AND NEW.leg2_dex_swap_id IS DISTINCT FROM OLD.leg2_dex_swap_id)
     OR (OLD.leg2_swap_send_id IS NOT NULL AND NEW.leg2_swap_send_id IS DISTINCT FROM OLD.leg2_swap_send_id)
     OR (OLD.mid_amount IS NOT NULL AND NEW.mid_amount IS DISTINCT FROM OLD.mid_amount) THEN
    RAISE EXCEPTION 'A recorded swap step can never change';
  END IF;
  IF OLD.status IN ('done', 'failed', 'refunded', 'kept_mid', 'declined', 'expired', 'cancelled') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'A finished swap stays finished';
  END IF;
  -- Nothing may start before the member's Telegram tap was recorded.
  IF OLD.status = 'awaiting_approval' AND NEW.status IN ('approved', 'leg1', 'mid', 'leg2', 'done') AND NEW.approval_id IS NULL THEN
    RAISE EXCEPTION 'A two-step swap needs an approval before it starts';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER two_step_swaps_guard
  BEFORE UPDATE OR DELETE ON public.two_step_swaps
  FOR EACH ROW EXECUTE FUNCTION public.two_step_swaps_guard();

CREATE OR REPLACE FUNCTION public.reserve_two_step_swap(_row jsonb, _per_swap_max_usd numeric, _daily_max_usd numeric)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user uuid := (_row->>'user_id')::uuid;
  _usd numeric := COALESCE((_row->>'amount_usd')::numeric, 0);
  _used numeric;
  _id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('two_step:' || _user::text));

  UPDATE public.two_step_swaps
     SET status = CASE WHEN created_at < now() - interval '15 minutes' THEN 'expired' ELSE 'cancelled' END,
         error = COALESCE(error, 'Replaced by a newer swap request'), updated_at = now()
   WHERE user_id = _user AND status = 'awaiting_approval';

  IF EXISTS (SELECT 1 FROM public.two_step_swaps WHERE user_id = _user
              AND status NOT IN ('done', 'failed', 'refunded', 'kept_mid', 'declined', 'expired', 'cancelled')) THEN
    RAISE EXCEPTION 'Another two-step swap is still running. Wait for it to finish.';
  END IF;
  IF _usd > _per_swap_max_usd THEN
    RAISE EXCEPTION 'This swap is over the $% per-swap limit.', _per_swap_max_usd;
  END IF;
  SELECT COALESCE(SUM(amount_usd), 0) INTO _used FROM public.two_step_swaps
   WHERE user_id = _user AND status NOT IN ('failed', 'declined', 'expired', 'cancelled') AND created_at > now() - interval '24 hours';
  IF _used + _usd > _daily_max_usd THEN
    RAISE EXCEPTION 'This swap would pass the $% daily limit ($% used in the last 24 hours).', _daily_max_usd, round(_used, 2);
  END IF;

  INSERT INTO public.two_step_swaps (user_id, link_id, direction, network, token_address, token_symbol, token_decimals,
    coin_id, mid_id, symbol_in, symbol_out, protocol, amount_in, shown_mid, shown_out, min_out, slippage_bps, amount_usd,
    from_address, to_address)
  VALUES (_user, (_row->>'link_id')::uuid, _row->>'direction', _row->>'network', _row->>'token_address', _row->>'token_symbol',
    (_row->>'token_decimals')::integer, _row->>'coin_id', _row->>'mid_id', _row->>'symbol_in', _row->>'symbol_out', _row->>'protocol',
    (_row->>'amount_in')::numeric, (_row->>'shown_mid')::numeric, (_row->>'shown_out')::numeric, (_row->>'min_out')::numeric,
    (_row->>'slippage_bps')::integer, _usd, _row->>'from_address', _row->>'to_address')
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_two_step_swap(jsonb, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_two_step_swap(jsonb, numeric, numeric) TO service_role;

-- Token swaps that are a hop of a two-step swap.
ALTER TABLE public.dex_swaps ADD COLUMN IF NOT EXISTS two_step_id uuid;
CREATE INDEX IF NOT EXISTS dex_swaps_two_step ON public.dex_swaps (two_step_id) WHERE two_step_id IS NOT NULL;

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
     OR (OLD.two_step_id IS NOT NULL AND NEW.two_step_id IS DISTINCT FROM OLD.two_step_id)
     OR (OLD.reset_txid IS NOT NULL AND NEW.reset_txid IS DISTINCT FROM OLD.reset_txid)
     OR (OLD.approve_txid IS NOT NULL AND NEW.approve_txid IS DISTINCT FROM OLD.approve_txid)
     OR (OLD.swap_txid IS NOT NULL AND NEW.swap_txid IS DISTINCT FROM OLD.swap_txid) THEN
    RAISE EXCEPTION 'A recorded swap step can never change';
  END IF;
  IF OLD.status IN ('done', 'failed', 'declined', 'expired', 'cancelled', 'kept_usdc') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'A finished swap stays finished';
  END IF;
  -- A swap moves past its Telegram step only with its own approval, or as a hop of an approved two-step swap.
  IF OLD.status = 'awaiting_approval' AND NEW.status NOT IN ('awaiting_approval', 'declined', 'expired', 'cancelled', 'failed') THEN
    IF NEW.approval_id IS NULL AND NOT EXISTS (
      SELECT 1 FROM public.two_step_swaps t
       WHERE t.id = NEW.two_step_id AND t.user_id = NEW.user_id AND t.approval_id IS NOT NULL
         AND t.status IN ('approved', 'leg1', 'mid', 'leg2')) THEN
      RAISE EXCEPTION 'This swap has not been approved';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE public.send_approvals DROP CONSTRAINT IF EXISTS send_approvals_purpose_check;
ALTER TABLE public.send_approvals ADD CONSTRAINT send_approvals_purpose_check
  CHECK (purpose IN ('trade_leg', 'p2p_release', 'swap_out', 'dex_swap', 'withdrawal', 'two_step'));