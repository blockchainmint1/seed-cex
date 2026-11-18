CREATE TABLE public.tsd_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  link_id uuid,
  direction text NOT NULL CHECK (direction IN ('buy','sell')),
  coin text NOT NULL,
  coin_asset text NOT NULL,
  amount_in numeric NOT NULL CHECK (amount_in > 0),
  amount_usd numeric NOT NULL CHECK (amount_usd >= 0),
  shown_usdc numeric NOT NULL CHECK (shown_usdc >= 0),
  shown_out numeric NOT NULL CHECK (shown_out >= 0),
  bridge_fee_bps integer NOT NULL DEFAULT 0 CHECK (bridge_fee_bps >= 0 AND bridge_fee_bps <= 10000),
  txc_address text NOT NULL,
  evm_address text NOT NULL,
  coin_address text NOT NULL,
  stage text NOT NULL DEFAULT 'reserved' CHECK (stage IN ('reserved','sending_tsd','bridging','swapping','gas_pending','swap_sent','minting','needs_ok','done','refunded','kept_usdc','failed')),
  resume_stage text,
  bridge_order_id text,
  bridge_deposit text,
  tsd_txid text,
  usdc_txid text,
  bridge_out_txid text,
  swap_send_id uuid,
  usdc_amount numeric,
  amount_out numeric,
  gas_txid text,
  fresh_out numeric,
  error text,
  working_until timestamptz,
  step_at timestamptz NOT NULL DEFAULT now(),
  checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tsd_routes TO authenticated;
GRANT ALL ON public.tsd_routes TO service_role;

ALTER TABLE public.tsd_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members see their own TSD swaps"
  ON public.tsd_routes FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX tsd_routes_user_created ON public.tsd_routes (user_id, created_at DESC);
CREATE INDEX tsd_routes_open ON public.tsd_routes (stage, checked_at) WHERE stage NOT IN ('done','refunded','kept_usdc','failed');
CREATE UNIQUE INDEX tsd_routes_one_open ON public.tsd_routes (user_id) WHERE stage NOT IN ('done','refunded','kept_usdc','failed');
CREATE UNIQUE INDEX tsd_routes_tsd_txid ON public.tsd_routes (tsd_txid) WHERE tsd_txid IS NOT NULL;
CREATE UNIQUE INDEX tsd_routes_usdc_txid ON public.tsd_routes (usdc_txid) WHERE usdc_txid IS NOT NULL;
CREATE UNIQUE INDEX tsd_routes_bridge_order ON public.tsd_routes (bridge_order_id) WHERE bridge_order_id IS NOT NULL;

CREATE TABLE public.gas_topups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL,
  user_id uuid NOT NULL,
  to_address text NOT NULL,
  wei numeric NOT NULL CHECK (wei > 0),
  usd numeric NOT NULL CHECK (usd >= 0),
  txid text,
  status text NOT NULL DEFAULT 'signing' CHECK (status IN ('signing','sent','confirmed','failed')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.gas_topups TO service_role;
ALTER TABLE public.gas_topups ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX gas_topups_txid ON public.gas_topups (txid) WHERE txid IS NOT NULL;
CREATE UNIQUE INDEX gas_topups_one_open ON public.gas_topups (route_id) WHERE status IN ('signing','sent');

CREATE OR REPLACE FUNCTION public.reserve_tsd_route(
  _user_id uuid, _link_id uuid, _direction text, _coin text, _coin_asset text,
  _amount_in numeric, _amount_usd numeric, _shown_usdc numeric, _shown_out numeric, _bridge_fee_bps integer,
  _txc_address text, _evm_address text, _coin_address text,
  _per_swap_max_usd numeric, _daily_max_usd numeric
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _used numeric;
  _id uuid;
BEGIN
  -- Same lock as reserve_swap_send, so a direct swap and a TSD swap can't race past the caps.
  PERFORM pg_advisory_xact_lock(hashtext('swap_send:' || _user_id::text));

  -- A route that never moved anything (crashed worker before the first send) is retired after 15 minutes.
  UPDATE public.tsd_routes
     SET stage = 'failed', error = COALESCE(error, 'Did not start; nothing was sent'), updated_at = now()
   WHERE user_id = _user_id AND stage = 'reserved' AND tsd_txid IS NULL AND usdc_txid IS NULL AND swap_send_id IS NULL
     AND created_at < now() - interval '15 minutes';

  IF EXISTS (SELECT 1 FROM public.tsd_routes WHERE user_id = _user_id AND stage NOT IN ('done','refunded','kept_usdc','failed')) THEN
    RAISE EXCEPTION 'You already have a TSD swap in progress. It must finish first.';
  END IF;

  IF _amount_usd > _per_swap_max_usd THEN
    RAISE EXCEPTION 'This swap is over the $% per-swap limit.', _per_swap_max_usd;
  END IF;

  SELECT COALESCE(SUM(amount_usd), 0) INTO _used FROM (
    SELECT amount_usd FROM public.swap_sends
     WHERE user_id = _user_id AND status <> 'failed' AND created_at > now() - interval '24 hours'
    UNION ALL
    SELECT amount_usd FROM public.tsd_routes
     WHERE user_id = _user_id AND stage <> 'failed' AND swap_send_id IS NULL AND created_at > now() - interval '24 hours'
  ) u;
  IF _used + _amount_usd > _daily_max_usd THEN
    RAISE EXCEPTION 'This swap would pass the $% daily limit ($% used in the last 24 hours).', _daily_max_usd, round(_used, 2);
  END IF;

  INSERT INTO public.tsd_routes (user_id, link_id, direction, coin, coin_asset, amount_in, amount_usd, shown_usdc, shown_out,
    bridge_fee_bps, txc_address, evm_address, coin_address)
  VALUES (_user_id, _link_id, _direction, _coin, _coin_asset, _amount_in, _amount_usd, _shown_usdc, _shown_out,
    _bridge_fee_bps, _txc_address, _evm_address, _coin_address)
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_tsd_route(uuid, uuid, text, text, text, numeric, numeric, numeric, numeric, integer, text, text, text, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_tsd_route(uuid, uuid, text, text, text, numeric, numeric, numeric, numeric, integer, text, text, text, numeric, numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_gas_topup(
  _route_id uuid, _user_id uuid, _to_address text, _wei numeric, _usd numeric,
  _per_route_max_usd numeric, _daily_max_usd numeric
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _route numeric;
  _day numeric;
  _id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('gas_topup'));

  IF EXISTS (SELECT 1 FROM public.gas_topups WHERE route_id = _route_id AND status IN ('signing','sent')) THEN
    RAISE EXCEPTION 'A network-fee top-up for this swap is already on its way.';
  END IF;

  SELECT COALESCE(SUM(usd), 0) INTO _route FROM public.gas_topups WHERE route_id = _route_id AND status <> 'failed';
  IF _route + _usd > _per_route_max_usd THEN
    RAISE EXCEPTION 'The Ethereum network fee is above the $% Seeds covers per swap right now.', _per_route_max_usd;
  END IF;

  SELECT COALESCE(SUM(usd), 0) INTO _day FROM public.gas_topups WHERE status <> 'failed' AND created_at > now() - interval '24 hours';
  IF _day + _usd > _daily_max_usd THEN
    RAISE EXCEPTION 'Seeds has reached its $% daily network-fee budget. Try again later.', _daily_max_usd;
  END IF;

  INSERT INTO public.gas_topups (route_id, user_id, to_address, wei, usd)
  VALUES (_route_id, _user_id, _to_address, _wei, _usd)
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_gas_topup(uuid, uuid, text, numeric, numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_gas_topup(uuid, uuid, text, numeric, numeric, numeric, numeric) TO service_role;