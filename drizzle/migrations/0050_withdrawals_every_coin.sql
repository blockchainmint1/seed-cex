-- Withdrawals for every coin Seeds signs, one rule set (Bobby, Nov 20 2026).
ALTER TABLE public.pocket_withdrawals DROP CONSTRAINT IF EXISTS pocket_withdrawals_chain_check;
ALTER TABLE public.pocket_withdrawals DROP CONSTRAINT IF EXISTS pocket_withdrawals_coin_check;
ALTER TABLE public.pocket_withdrawals DROP CONSTRAINT IF EXISTS pocket_withdrawals_from_address_check;
ALTER TABLE public.pocket_withdrawals DROP CONSTRAINT IF EXISTS pocket_withdrawals_to_address_check;
ALTER TABLE public.pocket_withdrawals DROP CONSTRAINT IF EXISTS pocket_withdrawals_status_check;
ALTER TABLE public.pocket_withdrawals ADD CONSTRAINT pocket_withdrawals_chain_check CHECK (chain ~ '^[a-z][a-z-]{1,15}$');
ALTER TABLE public.pocket_withdrawals ADD CONSTRAINT pocket_withdrawals_coin_check CHECK (coin ~ '^[A-Za-z]{2,6}$');
ALTER TABLE public.pocket_withdrawals ADD CONSTRAINT pocket_withdrawals_from_address_check CHECK (from_address ~ '^[A-Za-z0-9:]{20,128}$');
ALTER TABLE public.pocket_withdrawals ADD CONSTRAINT pocket_withdrawals_to_address_check CHECK (to_address ~ '^[A-Za-z0-9:]{20,128}$');
ALTER TABLE public.pocket_withdrawals ADD CONSTRAINT pocket_withdrawals_status_check
  CHECK (status IN ('approving', 'held', 'cancelled', 'signing', 'sent', 'confirmed', 'failed', 'unknown'));
ALTER TABLE public.pocket_withdrawals ADD COLUMN IF NOT EXISTS hold_hours integer NOT NULL DEFAULT 24 CHECK (hold_hours >= 0);
ALTER TABLE public.pocket_withdrawals ADD COLUMN IF NOT EXISTS approval_id uuid;
ALTER TABLE public.pocket_withdrawals ADD COLUMN IF NOT EXISTS approved_at timestamptz;
COMMENT ON FUNCTION public.reserve_pocket_withdrawal(uuid, uuid, text, numeric, text, numeric, text, text, integer, numeric, numeric, integer)
  IS 'DEPRECATED: replaced by reserve_withdrawal (every coin, Telegram approval before the hold)';

-- Reserve a withdrawal for any coin: caps and counts under a per-member lock. It waits for the
-- member's Telegram tap ('approving'); approve_pocket_withdrawal starts the hold.
CREATE OR REPLACE FUNCTION public.reserve_withdrawal(
  _user_id uuid, _link_id uuid, _chain text, _coin text, _amount numeric, _amount_units text, _amount_usd numeric,
  _from_address text, _to_address text, _hold_hours integer, _per_max_usd numeric, _daily_max_usd numeric, _max_held integer
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _used numeric; _held int; _id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('pocket_withdrawal:' || _user_id::text));
  IF _hold_hours < 0 THEN RAISE EXCEPTION 'Hold can''t be negative.'; END IF;
  IF _amount_usd > _per_max_usd THEN
    RAISE EXCEPTION 'This withdrawal is over the $% per-withdrawal limit.', _per_max_usd;
  END IF;
  SELECT count(*) INTO _held FROM public.pocket_withdrawals WHERE user_id = _user_id AND status IN ('approving', 'held', 'signing');
  IF _held >= _max_held THEN
    RAISE EXCEPTION 'You already have % withdrawals waiting. Let one finish or cancel one first.', _held;
  END IF;
  SELECT COALESCE(SUM(amount_usd), 0) INTO _used FROM public.pocket_withdrawals
   WHERE user_id = _user_id AND status NOT IN ('failed', 'cancelled') AND created_at > now() - interval '24 hours';
  IF _used + _amount_usd > _daily_max_usd THEN
    RAISE EXCEPTION 'This would pass the $% daily withdrawal limit ($% used in the last 24 hours).', _daily_max_usd, round(_used, 2);
  END IF;
  INSERT INTO public.pocket_withdrawals (user_id, link_id, chain, coin, amount, amount_units, amount_usd, from_address, to_address, status, hold_hours, release_at)
  VALUES (_user_id, _link_id, _chain, _coin, _amount, _amount_units, _amount_usd, _from_address, _to_address, 'approving', _hold_hours,
          now() + make_interval(hours => _hold_hours) + interval '1 day')
  RETURNING id INTO _id;
  RETURN _id;
END $$;

-- The member's Telegram tap was spent for this withdrawal: start its hold now.
CREATE OR REPLACE FUNCTION public.approve_pocket_withdrawal(_id uuid, _approval_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _n int;
BEGIN
  UPDATE public.pocket_withdrawals
     SET status = 'held', approval_id = _approval_id, approved_at = now(),
         release_at = now() + make_interval(hours => hold_hours), updated_at = now()
   WHERE id = _id AND status = 'approving';
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n = 1;
END $$;

-- The member cancels while it waits for their tap or during the hold.
CREATE OR REPLACE FUNCTION public.cancel_pocket_withdrawal(_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _n int;
BEGIN
  UPDATE public.pocket_withdrawals SET status = 'cancelled', cancelled_at = now(), updated_at = now()
   WHERE id = _id AND user_id = _user_id AND status IN ('approving', 'held');
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n = 1;
END $$;

REVOKE ALL ON FUNCTION public.reserve_withdrawal(uuid, uuid, text, text, numeric, text, numeric, text, text, integer, numeric, numeric, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_pocket_withdrawal(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_pocket_withdrawal(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_withdrawal(uuid, uuid, text, text, numeric, text, numeric, text, text, integer, numeric, numeric, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_pocket_withdrawal(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_pocket_withdrawal(uuid, uuid) TO service_role;

-- Email codes: one per withdrawal request, bound to its exact details. Server-only.
CREATE TABLE public.withdrawal_email_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  details text NOT NULL CHECK (details ~ '^[A-Za-z0-9_-]{20,100}$'),
  code_digest text NOT NULL CHECK (code_digest ~ '^[A-Za-z0-9_-]{20,100}$'),
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.withdrawal_email_codes TO service_role;
ALTER TABLE public.withdrawal_email_codes ENABLE ROW LEVEL SECURITY;
CREATE INDEX withdrawal_email_codes_user_idx ON public.withdrawal_email_codes (user_id, created_at DESC);

-- Use the newest live code for exactly these details. 'ok' marks it used; 5 wrong tries lock it.
CREATE OR REPLACE FUNCTION public.use_withdrawal_email_code(_user_id uuid, _details text, _code_digest text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _row public.withdrawal_email_codes%ROWTYPE;
BEGIN
  SELECT * INTO _row FROM public.withdrawal_email_codes
   WHERE user_id = _user_id AND details = _details AND used_at IS NULL
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN 'none'; END IF;
  IF _row.expires_at <= now() THEN RETURN 'expired'; END IF;
  IF _row.attempts >= 5 THEN RETURN 'locked'; END IF;
  IF _row.code_digest = _code_digest THEN
    UPDATE public.withdrawal_email_codes SET used_at = now() WHERE id = _row.id;
    RETURN 'ok';
  END IF;
  UPDATE public.withdrawal_email_codes SET attempts = attempts + 1 WHERE id = _row.id;
  RETURN CASE WHEN _row.attempts + 1 >= 5 THEN 'locked' ELSE 'wrong' END;
END $$;
REVOKE ALL ON FUNCTION public.use_withdrawal_email_code(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.use_withdrawal_email_code(uuid, text, text) TO service_role;

-- When the member's Telegram chat was connected (null = not connected, or connected before this was recorded).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telegram_verified_at timestamptz;
CREATE OR REPLACE FUNCTION public.profiles_telegram_verified_at()
RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.telegram_chat_id IS DISTINCT FROM OLD.telegram_chat_id OR NEW.telegram_verified IS DISTINCT FROM OLD.telegram_verified THEN
    NEW.telegram_verified_at := CASE WHEN NEW.telegram_verified AND NEW.telegram_chat_id IS NOT NULL THEN now() ELSE NULL END;
  ELSIF NEW.telegram_verified_at IS DISTINCT FROM OLD.telegram_verified_at THEN
    NEW.telegram_verified_at := OLD.telegram_verified_at; -- only the trigger sets it
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS profiles_telegram_verified_at ON public.profiles;
CREATE TRIGGER profiles_telegram_verified_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_telegram_verified_at();

ALTER TABLE public.send_approvals DROP CONSTRAINT IF EXISTS send_approvals_purpose_check;
ALTER TABLE public.send_approvals ADD CONSTRAINT send_approvals_purpose_check
  CHECK (purpose IN ('trade_leg', 'p2p_release', 'swap_out', 'dex_swap', 'withdrawal'));