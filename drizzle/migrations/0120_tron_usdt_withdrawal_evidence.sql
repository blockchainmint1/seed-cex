CREATE OR REPLACE FUNCTION public.guard_withdrawal_send_meta() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE expected_chain text;
BEGIN
  expected_chain := CASE WHEN NEW.coin = 'USDT' AND NEW.chain = 'ton' THEN 'TON' WHEN NEW.coin = 'USDT' AND NEW.chain = 'trx' THEN 'TRON' ELSE NEW.coin END;
  IF OLD.send_meta IS NOT NULL AND NEW.send_meta IS DISTINCT FROM OLD.send_meta THEN
    RAISE EXCEPTION 'Recorded withdrawal expiry evidence cannot change';
  END IF;
  IF OLD.send_meta IS NULL AND NEW.send_meta IS NOT NULL AND (OLD.status <> 'signing' OR NEW.txid IS NULL OR NEW.send_meta->>'chain' IS DISTINCT FROM expected_chain) THEN
    RAISE EXCEPTION 'Expiry evidence must accompany a signed withdrawal transaction';
  END IF;
  IF NEW.coin = 'USDT' AND NEW.chain = 'trx' AND OLD.send_meta IS NULL AND NEW.send_meta IS NOT NULL THEN
    IF COALESCE(NEW.send_meta->>'rawDataHex', '') !~ '^[0-9a-f]{200,3000}$' OR length(NEW.send_meta->>'rawDataHex') % 2 <> 0 OR COALESCE(NEW.send_meta->>'expiresAt', '') !~ '^[0-9]{13}$' OR COALESCE(NEW.txid, '') !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'TRON USDT signed evidence is incomplete';
    END IF;
  END IF;
  IF (OLD.coin IN ('XLM', 'TON', 'SUI') OR OLD.chain IN ('xlm', 'ton', 'sui') OR (OLD.coin = 'USDT' AND OLD.chain = 'trx')) AND OLD.txid IS NOT NULL AND NEW.txid IS DISTINCT FROM OLD.txid THEN
    RAISE EXCEPTION 'A recorded withdrawal transaction id cannot change';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_withdrawal_send_meta() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_withdrawal_send_meta() TO service_role;