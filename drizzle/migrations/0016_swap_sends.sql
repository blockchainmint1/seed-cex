CREATE TABLE public.swap_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  link_id uuid,
  protocol text NOT NULL,
  pocket text NOT NULL,
  from_asset text NOT NULL,
  to_asset text NOT NULL,
  amount_in numeric NOT NULL CHECK (amount_in > 0),
  amount_usd numeric NOT NULL CHECK (amount_usd >= 0),
  expected_out numeric,
  min_out numeric,
  from_address text NOT NULL,
  destination text NOT NULL,
  vault text NOT NULL,
  router text,
  memo text NOT NULL,
  txid text,
  approve_txid text,
  out_txid text,
  status text NOT NULL DEFAULT 'signing' CHECK (status IN ('signing','sent','done','refunded','failed','unknown')),
  error text,
  checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.swap_sends TO authenticated;
GRANT ALL ON public.swap_sends TO service_role;

ALTER TABLE public.swap_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members see their own swap sends"
  ON public.swap_sends FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX swap_sends_user_created ON public.swap_sends (user_id, created_at DESC);
CREATE UNIQUE INDEX swap_sends_txid_unique ON public.swap_sends (txid) WHERE txid IS NOT NULL;
-- One send in flight per pocket: two concurrent sends would fight over the same coins / nonce.
CREATE UNIQUE INDEX swap_sends_one_signing ON public.swap_sends (user_id, pocket) WHERE status = 'signing';

CREATE OR REPLACE FUNCTION public.reserve_swap_send(
  _user_id uuid, _link_id uuid, _protocol text, _pocket text, _from_asset text, _to_asset text,
  _amount_in numeric, _amount_usd numeric, _expected_out numeric, _min_out numeric,
  _from_address text, _destination text, _vault text, _router text, _memo text,
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
  PERFORM pg_advisory_xact_lock(hashtext('swap_send:' || _user_id::text));

  -- A send that never reached the network (crashed worker) is retired after 10 minutes.
  UPDATE public.swap_sends
     SET status = CASE WHEN txid IS NULL THEN 'failed' ELSE 'unknown' END,
         error = COALESCE(error, 'Send did not finish; checked by hand'),
         updated_at = now()
   WHERE user_id = _user_id AND status = 'signing' AND created_at < now() - interval '10 minutes';

  IF EXISTS (SELECT 1 FROM public.swap_sends WHERE user_id = _user_id AND pocket = _pocket AND status = 'signing') THEN
    RAISE EXCEPTION 'Another swap from this pocket is still being sent. Wait a minute and try again.';
  END IF;

  IF _amount_usd > _per_swap_max_usd THEN
    RAISE EXCEPTION 'This swap is over the $% per-swap limit.', _per_swap_max_usd;
  END IF;

  SELECT COALESCE(SUM(amount_usd), 0) INTO _used
    FROM public.swap_sends
   WHERE user_id = _user_id AND status <> 'failed' AND created_at > now() - interval '24 hours';
  IF _used + _amount_usd > _daily_max_usd THEN
    RAISE EXCEPTION 'This swap would pass the $% daily limit ($% used in the last 24 hours).', _daily_max_usd, round(_used, 2);
  END IF;

  INSERT INTO public.swap_sends (user_id, link_id, protocol, pocket, from_asset, to_asset, amount_in, amount_usd,
    expected_out, min_out, from_address, destination, vault, router, memo)
  VALUES (_user_id, _link_id, _protocol, _pocket, _from_asset, _to_asset, _amount_in, _amount_usd,
    _expected_out, _min_out, _from_address, _destination, _vault, _router, _memo)
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_swap_send(uuid, uuid, text, text, text, text, numeric, numeric, numeric, numeric, text, text, text, text, text, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_swap_send(uuid, uuid, text, text, text, text, numeric, numeric, numeric, numeric, text, text, text, text, text, numeric, numeric) TO service_role;