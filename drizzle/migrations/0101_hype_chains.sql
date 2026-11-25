CREATE TABLE public.hype_chains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  link_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('to_hype', 'from_hype')),
  via text NOT NULL CHECK (via IN ('tsd', 'xchain')),
  coin_id text NOT NULL,
  protocol text CHECK (protocol IN ('thorchain', 'maya')),
  pocket text NOT NULL CHECK (pocket ~ '^0x[0-9a-fA-F]{40}$'),
  amount_in numeric NOT NULL CHECK (amount_in > 0),
  amount_usd numeric NOT NULL DEFAULT 0,
  shown_mid numeric NOT NULL CHECK (shown_mid > 0),
  shown_out numeric NOT NULL CHECK (shown_out > 0),
  min_out numeric NOT NULL CHECK (min_out > 0),
  slippage_bps integer NOT NULL CHECK (slippage_bps BETWEEN 10 AND 1000),
  status text NOT NULL DEFAULT 'awaiting_approval' CHECK (status IN ('awaiting_approval','approved','leg1','mid','leg2','done','failed','kept_mid','declined','expired','cancelled')),
  approval_id uuid,
  eth_baseline_wei text CHECK (eth_baseline_wei ~ '^[0-9]+$'),
  leg1_id uuid,
  leg2_id uuid,
  mid_amount numeric,
  mid_handed numeric,
  amount_out numeric,
  error text,
  step_at timestamptz NOT NULL DEFAULT now(),
  working_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.hype_chains TO service_role;
ALTER TABLE public.hype_chains ENABLE ROW LEVEL SECURITY;
CREATE INDEX hype_chains_user_idx ON public.hype_chains (user_id, created_at DESC);
CREATE INDEX hype_chains_open_idx ON public.hype_chains (created_at) WHERE status NOT IN ('done','failed','kept_mid','declined','expired','cancelled');
COMMENT ON TABLE public.hype_chains IS 'One-tap two-step swaps any coin <-> ETH <-> HYPE (THORChain/Maya or TSD route, plus Relay). Server-only.';

CREATE OR REPLACE FUNCTION public.hype_chains_write_once() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.eth_baseline_wei IS NOT NULL AND NEW.eth_baseline_wei IS DISTINCT FROM OLD.eth_baseline_wei THEN RAISE EXCEPTION 'eth_baseline_wei is write-once'; END IF;
  IF NEW.eth_baseline_wei IS NOT NULL AND OLD.eth_baseline_wei IS NULL AND OLD.status <> 'approved' THEN RAISE EXCEPTION 'baseline only while approved'; END IF;
  IF OLD.leg1_id IS NOT NULL AND NEW.leg1_id IS DISTINCT FROM OLD.leg1_id THEN RAISE EXCEPTION 'leg1_id is write-once'; END IF;
  IF OLD.leg2_id IS NOT NULL AND NEW.leg2_id IS DISTINCT FROM OLD.leg2_id THEN RAISE EXCEPTION 'leg2_id is write-once'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER hype_chains_write_once BEFORE UPDATE ON public.hype_chains FOR EACH ROW EXECUTE FUNCTION public.hype_chains_write_once();

CREATE OR REPLACE FUNCTION public.reserve_hype_chain(_row jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _user uuid := (_row->>'user_id')::uuid; _id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('hype_chain:' || _user::text));
  UPDATE public.hype_chains SET status = 'cancelled', error = COALESCE(error, 'Replaced by a newer swap request'), updated_at = now()
   WHERE user_id = _user AND status = 'awaiting_approval';
  IF EXISTS (SELECT 1 FROM public.hype_chains WHERE user_id = _user AND status NOT IN ('done','failed','kept_mid','declined','expired','cancelled')) THEN
    RAISE EXCEPTION 'Another HYPE swap is still running. Wait for it to finish.';
  END IF;
  INSERT INTO public.hype_chains (user_id, link_id, direction, via, coin_id, protocol, pocket, amount_in, amount_usd, shown_mid, shown_out, min_out, slippage_bps)
  VALUES (_user, (_row->>'link_id')::uuid, _row->>'direction', _row->>'via', _row->>'coin_id', NULLIF(_row->>'protocol',''), lower(_row->>'pocket'),
    (_row->>'amount_in')::numeric, COALESCE((_row->>'amount_usd')::numeric,0), (_row->>'shown_mid')::numeric, (_row->>'shown_out')::numeric,
    (_row->>'min_out')::numeric, (_row->>'slippage_bps')::integer)
  RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.reserve_hype_chain(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_hype_chain(jsonb) TO service_role;

-- Relay step of a chained swap: inserted already approved by the chain's one tap, tagged with the chain.
ALTER TABLE public.relay_swaps ADD COLUMN IF NOT EXISTS parent_id uuid;
CREATE INDEX IF NOT EXISTS relay_swaps_parent_idx ON public.relay_swaps (parent_id) WHERE parent_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.reserve_relay_leg(_chain_id uuid, _row jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.hype_chains; _id uuid;
BEGIN
  SELECT * INTO _c FROM public.hype_chains WHERE id = _chain_id FOR UPDATE;
  IF _c.id IS NULL OR _c.approval_id IS NULL OR _c.status NOT IN ('approved','mid') THEN RAISE EXCEPTION 'This swap is not approved for a Relay step.'; END IF;
  IF _c.pocket <> lower(_row->>'pocket') THEN RAISE EXCEPTION 'Pocket mismatch.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('relay_swap:' || _c.user_id::text));
  IF EXISTS (SELECT 1 FROM public.relay_swaps WHERE user_id = _c.user_id AND status NOT IN ('done','refunded','failed','declined','expired','cancelled')) THEN
    RAISE EXCEPTION 'Another Relay swap is still running. Wait for it to finish.';
  END IF;
  INSERT INTO public.relay_swaps (user_id, link_id, direction, pocket, amount_in, amount_in_wei, shown_out, min_out_wei, slippage_bps, amount_usd, status, approval_id, parent_id)
  VALUES (_c.user_id, _c.link_id, _row->>'direction', _c.pocket, (_row->>'amount_in')::numeric, _row->>'amount_in_wei',
    (_row->>'shown_out')::numeric, _row->>'min_out_wei', _c.slippage_bps, COALESCE((_row->>'amount_usd')::numeric,0), 'approved', _c.approval_id, _c.id)
  RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.reserve_relay_leg(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_relay_leg(uuid, jsonb) TO service_role;

-- TSD route step of a chained swap.
ALTER TABLE public.tsd_routes ADD COLUMN IF NOT EXISTS parent_id uuid;
CREATE INDEX IF NOT EXISTS tsd_routes_parent_idx ON public.tsd_routes (parent_id) WHERE parent_id IS NOT NULL;
DROP FUNCTION public.reserve_tsd_route(uuid, uuid, text, text, text, numeric, numeric, numeric, numeric, integer, text, text, text, numeric, numeric, text);
CREATE FUNCTION public.reserve_tsd_route(_user_id uuid, _link_id uuid, _direction text, _coin text, _coin_asset text, _amount_in numeric, _amount_usd numeric, _shown_usdc numeric, _shown_out numeric, _bridge_fee_bps integer, _txc_address text, _evm_address text, _coin_address text, _per_swap_max_usd numeric, _daily_max_usd numeric, _protocol text, _parent_id uuid DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _used numeric; _id uuid;
BEGIN
  IF _protocol NOT IN ('thorchain', 'maya') THEN RAISE EXCEPTION 'Unknown swap network.'; END IF;
  IF _parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.hype_chains WHERE id = _parent_id AND user_id = _user_id AND approval_id IS NOT NULL AND status IN ('approved','mid')) THEN
    RAISE EXCEPTION 'This swap is not approved for a TSD step.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('swap_send:' || _user_id::text));
  UPDATE public.tsd_routes SET stage = 'failed', error = COALESCE(error, 'Did not start; nothing was sent'), updated_at = now()
   WHERE user_id = _user_id AND stage = 'reserved' AND tsd_txid IS NULL AND usdc_txid IS NULL AND swap_send_id IS NULL AND created_at < now() - interval '15 minutes';
  IF EXISTS (SELECT 1 FROM public.tsd_routes WHERE user_id = _user_id AND stage NOT IN ('done','refunded','kept_usdc','failed')) THEN
    RAISE EXCEPTION 'You already have a TSD swap in progress. It must finish first.';
  END IF;
  IF _amount_usd > _per_swap_max_usd THEN RAISE EXCEPTION 'This swap is over the $% per-swap limit.', _per_swap_max_usd; END IF;
  SELECT COALESCE(SUM(amount_usd), 0) INTO _used FROM (
    SELECT amount_usd FROM public.swap_sends WHERE user_id = _user_id AND status <> 'failed' AND created_at > now() - interval '24 hours'
    UNION ALL
    SELECT amount_usd FROM public.tsd_routes WHERE user_id = _user_id AND stage <> 'failed' AND swap_send_id IS NULL AND created_at > now() - interval '24 hours'
  ) u;
  IF _used + _amount_usd > _daily_max_usd THEN
    RAISE EXCEPTION 'This swap would pass the $% daily limit ($% used in the last 24 hours).', _daily_max_usd, round(_used, 2);
  END IF;
  INSERT INTO public.tsd_routes (user_id, link_id, direction, coin, coin_asset, amount_in, amount_usd, shown_usdc, shown_out, bridge_fee_bps, txc_address, evm_address, coin_address, protocol, parent_id)
  VALUES (_user_id, _link_id, _direction, _coin, _coin_asset, _amount_in, _amount_usd, _shown_usdc, _shown_out, _bridge_fee_bps, _txc_address, _evm_address, _coin_address, _protocol, _parent_id)
  RETURNING id INTO _id;
  RETURN _id;
END;
$function$;
REVOKE ALL ON FUNCTION public.reserve_tsd_route(uuid, uuid, text, text, text, numeric, numeric, numeric, numeric, integer, text, text, text, numeric, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_tsd_route(uuid, uuid, text, text, text, numeric, numeric, numeric, numeric, integer, text, text, text, numeric, numeric, text, uuid) TO service_role;

ALTER TABLE public.send_approvals DROP CONSTRAINT send_approvals_purpose_check;
ALTER TABLE public.send_approvals ADD CONSTRAINT send_approvals_purpose_check CHECK (purpose IN ('trade_leg', 'p2p_release', 'swap_out', 'dex_swap', 'withdrawal', 'two_step', 'loan_collateral', 'loan_funding', 'loan_repay', 'order', 'relay_swap', 'hype_chain'));