ALTER TYPE public.escrow_leg ADD VALUE IF NOT EXISTS 'pls';
ALTER TYPE public.escrow_leg ADD VALUE IF NOT EXISTS 'hex';
ALTER TYPE public.escrow_leg ADD VALUE IF NOT EXISTS 'phex';

CREATE TABLE public.pocket_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  link_id uuid NOT NULL,
  chain text NOT NULL DEFAULT 'pulsechain' CHECK (chain IN ('pulsechain')),
  coin text NOT NULL CHECK (coin IN ('PLS', 'pHEX')),
  amount numeric NOT NULL CHECK (amount > 0),
  amount_units text NOT NULL CHECK (amount_units ~ '^[1-9][0-9]{0,40}$'),
  amount_usd numeric NOT NULL CHECK (amount_usd >= 0),
  from_address text NOT NULL CHECK (from_address ~ '^0x[0-9a-fA-F]{40}$'),
  to_address text NOT NULL CHECK (to_address ~ '^0x[0-9a-fA-F]{40}$'),
  status text NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'cancelled', 'signing', 'sent', 'confirmed', 'failed', 'unknown')),
  release_at timestamptz NOT NULL,
  txid text,
  error text,
  confirmations integer,
  sent_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pocket_withdrawals TO authenticated;
GRANT ALL ON public.pocket_withdrawals TO service_role;

ALTER TABLE public.pocket_withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their own PulseChain withdrawals"
  ON public.pocket_withdrawals FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX pocket_withdrawals_user_idx ON public.pocket_withdrawals (user_id, created_at DESC);
CREATE INDEX pocket_withdrawals_due_idx ON public.pocket_withdrawals (release_at) WHERE status = 'held';
CREATE UNIQUE INDEX pocket_withdrawals_txid_idx ON public.pocket_withdrawals (txid) WHERE txid IS NOT NULL;

-- Reserve a withdrawal: caps and counts are enforced here, under a per-member lock.
CREATE OR REPLACE FUNCTION public.reserve_pocket_withdrawal(
  _user_id uuid, _link_id uuid, _coin text, _amount numeric, _amount_units text, _amount_usd numeric,
  _from_address text, _to_address text, _hold_hours integer, _per_max_usd numeric, _daily_max_usd numeric, _max_held integer
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _used numeric; _held int; _id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('pocket_withdrawal:' || _user_id::text));
  IF _hold_hours < 1 THEN RAISE EXCEPTION 'Hold must be at least one hour.'; END IF;
  IF _amount_usd > _per_max_usd THEN
    RAISE EXCEPTION 'This withdrawal is over the $% per-withdrawal limit.', _per_max_usd;
  END IF;
  SELECT count(*) INTO _held FROM public.pocket_withdrawals WHERE user_id = _user_id AND status IN ('held', 'signing');
  IF _held >= _max_held THEN
    RAISE EXCEPTION 'You already have % withdrawals waiting. Let one finish or cancel one first.', _held;
  END IF;
  SELECT COALESCE(SUM(amount_usd), 0) INTO _used FROM public.pocket_withdrawals
   WHERE user_id = _user_id AND status NOT IN ('failed', 'cancelled') AND created_at > now() - interval '24 hours';
  IF _used + _amount_usd > _daily_max_usd THEN
    RAISE EXCEPTION 'This would pass the $% daily withdrawal limit ($% used in the last 24 hours).', _daily_max_usd, round(_used, 2);
  END IF;
  INSERT INTO public.pocket_withdrawals (user_id, link_id, coin, amount, amount_units, amount_usd, from_address, to_address, release_at)
  VALUES (_user_id, _link_id, _coin, _amount, _amount_units, _amount_usd, _from_address, _to_address, now() + make_interval(hours => _hold_hours))
  RETURNING id INTO _id;
  RETURN _id;
END $$;

-- Claim one due withdrawal for sending: only a held row past its hold, and only one send per member at a time.
CREATE OR REPLACE FUNCTION public.claim_pocket_withdrawal(_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _user uuid; _n int;
BEGIN
  SELECT user_id INTO _user FROM public.pocket_withdrawals WHERE id = _id;
  IF _user IS NULL THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('pocket_withdrawal:' || _user::text));
  -- A send that crashed mid-way is retired after 10 minutes and checked by hand, never re-signed.
  UPDATE public.pocket_withdrawals
     SET status = CASE WHEN txid IS NULL THEN 'failed' ELSE 'unknown' END,
         error = COALESCE(error, 'Send did not finish; checked by hand'), updated_at = now()
   WHERE user_id = _user AND status = 'signing' AND updated_at < now() - interval '10 minutes';
  IF EXISTS (SELECT 1 FROM public.pocket_withdrawals WHERE user_id = _user AND status = 'signing') THEN RETURN false; END IF;
  UPDATE public.pocket_withdrawals SET status = 'signing', updated_at = now()
   WHERE id = _id AND status = 'held' AND release_at <= now();
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n = 1;
END $$;

-- The member cancels during the hold. Returns true only if it was still held.
CREATE OR REPLACE FUNCTION public.cancel_pocket_withdrawal(_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _n int;
BEGIN
  UPDATE public.pocket_withdrawals SET status = 'cancelled', cancelled_at = now(), updated_at = now()
   WHERE id = _id AND user_id = _user_id AND status = 'held';
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n = 1;
END $$;

REVOKE ALL ON FUNCTION public.reserve_pocket_withdrawal(uuid, uuid, text, numeric, text, numeric, text, text, integer, numeric, numeric, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_pocket_withdrawal(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_pocket_withdrawal(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_pocket_withdrawal(uuid, uuid, text, numeric, text, numeric, text, text, integer, numeric, numeric, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_pocket_withdrawal(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_pocket_withdrawal(uuid, uuid) TO service_role;