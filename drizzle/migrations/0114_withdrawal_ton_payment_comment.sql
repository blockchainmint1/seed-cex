ALTER TABLE public.pocket_withdrawals ADD COLUMN payment_comment text NOT NULL DEFAULT '';
ALTER TABLE public.pocket_withdrawals ADD CONSTRAINT pocket_withdrawals_payment_comment_valid CHECK (payment_comment = '' OR (coin = 'USDT' AND chain = 'ton' AND octet_length(payment_comment) <= 120 AND payment_comment !~ '[[:cntrl:]]'));
COMMENT ON COLUMN public.pocket_withdrawals.payment_comment IS 'Plain USDt-on-TON TEP-74 comment, set before approval and then immutable; never an externally supplied binary payload.';
CREATE FUNCTION public.withdrawal_payment_comment_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.payment_comment IS DISTINCT FROM OLD.payment_comment AND NOT (OLD.payment_comment = '' AND OLD.status = 'approving' AND NEW.status = 'approving' AND OLD.approval_id IS NULL AND NEW.approval_id IS NULL) THEN
    RAISE EXCEPTION 'The withdrawal payment note cannot change after approval is attached';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.withdrawal_payment_comment_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.withdrawal_payment_comment_guard() TO service_role;
CREATE TRIGGER withdrawal_payment_comment_guard BEFORE UPDATE OF payment_comment ON public.pocket_withdrawals FOR EACH ROW EXECUTE FUNCTION public.withdrawal_payment_comment_guard();