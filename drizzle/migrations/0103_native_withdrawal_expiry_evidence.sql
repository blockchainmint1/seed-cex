ALTER TABLE public.pocket_withdrawals ADD COLUMN IF NOT EXISTS send_meta jsonb CHECK (send_meta IS NULL OR jsonb_typeof(send_meta) = 'object');
COMMENT ON COLUMN public.pocket_withdrawals.send_meta IS 'Non-secret signed expiry/sequence evidence, recorded with txid before one submission; immutable once present.';
CREATE OR REPLACE FUNCTION public.guard_withdrawal_send_meta() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.send_meta IS NOT NULL AND NEW.send_meta IS DISTINCT FROM OLD.send_meta THEN
    RAISE EXCEPTION 'Recorded withdrawal expiry evidence cannot change';
  END IF;
  IF OLD.send_meta IS NULL AND NEW.send_meta IS NOT NULL AND (OLD.status <> 'signing' OR NEW.txid IS NULL OR NEW.send_meta->>'chain' IS DISTINCT FROM NEW.coin) THEN
    RAISE EXCEPTION 'Expiry evidence must accompany a signed withdrawal transaction';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_withdrawal_send_meta() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_withdrawal_send_meta() TO service_role;
CREATE TRIGGER pocket_withdrawals_send_meta_guard BEFORE UPDATE ON public.pocket_withdrawals FOR EACH ROW EXECUTE FUNCTION public.guard_withdrawal_send_meta();