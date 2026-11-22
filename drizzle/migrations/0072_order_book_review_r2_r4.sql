-- R4: a trade prints on the public price list only once its first payment is on the way.
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS first_sent_at timestamptz;
COMMENT ON COLUMN public.trades.first_sent_at IS 'When the first side of this trade was sent (or funded). Set by triggers; the public tape shows only trades with this set.';

CREATE OR REPLACE FUNCTION public.trades_mark_first_sent_from_escrow()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.release_txid IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.release_txid IS DISTINCT FROM NEW.release_txid) THEN
    UPDATE public.trades SET first_sent_at = now() WHERE id = NEW.trade_id AND first_sent_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.trades_mark_first_sent_from_escrow() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS escrows_mark_trade_first_sent ON public.escrows;
CREATE TRIGGER escrows_mark_trade_first_sent
AFTER INSERT OR UPDATE OF release_txid ON public.escrows
FOR EACH ROW EXECUTE FUNCTION public.trades_mark_first_sent_from_escrow();

CREATE OR REPLACE FUNCTION public.trades_mark_first_sent_on_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.first_sent_at IS NULL
     AND NEW.status::text IN ('maker_funded', 'taker_funded', 'both_funded', 'released', 'settled', 'arbitrated') THEN
    NEW.first_sent_at := now();
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.trades_mark_first_sent_on_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trades_first_sent_on_status ON public.trades;
CREATE TRIGGER trades_first_sent_on_status
BEFORE INSERT OR UPDATE OF status ON public.trades
FOR EACH ROW EXECUTE FUNCTION public.trades_mark_first_sent_on_status();

-- Backfill: trades that already had a side sent or funded keep printing.
UPDATE public.trades t
SET first_sent_at = COALESCE(
  (SELECT min(COALESCE(e.sent_at, t.created_at)) FROM public.escrows e WHERE e.trade_id = t.id AND e.release_txid IS NOT NULL),
  t.created_at)
WHERE t.first_sent_at IS NULL
  AND (t.status::text IN ('maker_funded', 'taker_funded', 'both_funded', 'released', 'settled', 'arbitrated')
       OR EXISTS (SELECT 1 FROM public.escrows e WHERE e.trade_id = t.id AND e.release_txid IS NOT NULL));

CREATE INDEX IF NOT EXISTS trades_pair_printed_idx ON public.trades (pair, created_at DESC) WHERE first_sent_at IS NOT NULL;

-- R2: admins can clear a member's repeat-failure order pause; only failures after this time count.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS order_pause_cleared_at timestamptz;
COMMENT ON COLUMN public.profiles.order_pause_cleared_at IS 'Admin cleared the repeat failed-match pause at this time; earlier failures no longer count.';

CREATE INDEX IF NOT EXISTS trade_events_event_created_idx ON public.trade_events (event, created_at DESC);