CREATE OR REPLACE FUNCTION public.guard_withdrawal_send_meta() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.send_meta IS NOT NULL AND NEW.send_meta IS DISTINCT FROM OLD.send_meta THEN
    RAISE EXCEPTION 'Recorded withdrawal expiry evidence cannot change';
  END IF;
  IF OLD.send_meta IS NULL AND NEW.send_meta IS NOT NULL AND (OLD.status <> 'signing' OR NEW.txid IS NULL OR
     NOT (NEW.send_meta->>'chain' = NEW.coin OR (NEW.coin = 'USDT' AND NEW.chain = 'ton' AND NEW.send_meta->>'chain' = 'TON'))) THEN
    RAISE EXCEPTION 'Expiry evidence must accompany a signed withdrawal transaction';
  END IF;
  IF (OLD.coin IN ('XLM', 'TON', 'SUI') OR OLD.chain IN ('xlm', 'ton', 'sui')) AND OLD.txid IS NOT NULL AND NEW.txid IS DISTINCT FROM OLD.txid THEN
    RAISE EXCEPTION 'A recorded withdrawal transaction id cannot change';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE public.ton_swaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  link_id uuid NOT NULL,
  pocket text NOT NULL,
  offer_units numeric NOT NULL CHECK (offer_units > 0),
  shown_units numeric NOT NULL CHECK (shown_units > 0),
  min_out_units numeric NOT NULL CHECK (min_out_units > 0 AND min_out_units <= shown_units),
  usdt_baseline numeric NOT NULL CHECK (usdt_baseline >= 0),
  status text NOT NULL DEFAULT 'signing' CHECK (status IN ('signing', 'sent', 'unknown', 'done', 'refunded', 'failed')),
  txid text,
  send_meta jsonb,
  received_units numeric,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ton_swaps TO service_role;
ALTER TABLE public.ton_swaps ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX ton_swaps_one_open ON public.ton_swaps (user_id) WHERE status IN ('signing', 'sent', 'unknown');
CREATE INDEX ton_swaps_user ON public.ton_swaps (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.guard_ton_swap() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Swap records cannot be deleted'; END IF;
  IF OLD.txid IS NOT NULL AND NEW.txid IS DISTINCT FROM OLD.txid THEN RAISE EXCEPTION 'A recorded swap transaction id cannot change'; END IF;
  IF OLD.send_meta IS NOT NULL AND NEW.send_meta IS DISTINCT FROM OLD.send_meta THEN RAISE EXCEPTION 'Recorded swap evidence cannot change'; END IF;
  IF NEW.user_id <> OLD.user_id OR NEW.link_id <> OLD.link_id OR NEW.pocket <> OLD.pocket OR NEW.offer_units <> OLD.offer_units
     OR NEW.min_out_units <> OLD.min_out_units OR NEW.usdt_baseline <> OLD.usdt_baseline OR NEW.shown_units <> OLD.shown_units THEN
    RAISE EXCEPTION 'Swap terms cannot change';
  END IF;
  IF OLD.status IN ('done', 'refunded', 'failed') AND NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'A finished swap cannot reopen'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER ton_swaps_guard BEFORE UPDATE OR DELETE ON public.ton_swaps FOR EACH ROW EXECUTE FUNCTION public.guard_ton_swap();