CREATE OR REPLACE FUNCTION public.guard_withdrawal_send_meta() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.send_meta IS NOT NULL AND NEW.send_meta IS DISTINCT FROM OLD.send_meta THEN
    RAISE EXCEPTION 'Recorded withdrawal expiry evidence cannot change';
  END IF;
  IF OLD.send_meta IS NULL AND NEW.send_meta IS NOT NULL AND (OLD.status <> 'signing' OR NEW.txid IS NULL OR NEW.send_meta->>'chain' IS DISTINCT FROM NEW.coin) THEN
    RAISE EXCEPTION 'Expiry evidence must accompany a signed withdrawal transaction';
  END IF;
  IF OLD.coin IN ('XLM', 'TON', 'SUI') AND OLD.txid IS NOT NULL AND NEW.txid IS DISTINCT FROM OLD.txid THEN
    RAISE EXCEPTION 'A recorded withdrawal transaction id cannot change';
  END IF;
  RETURN NEW;
END;
$$;