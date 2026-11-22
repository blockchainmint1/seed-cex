CREATE TABLE public.pocket_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  network text NOT NULL,
  coin text NOT NULL,
  token_address text,
  address text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  txid text NOT NULL,
  tx_url text,
  from_address text,
  from_seeds text,
  block_time timestamptz,
  source text NOT NULL CHECK (source IN ('chain', 'watch')),
  seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, network, txid, coin)
);
GRANT SELECT ON public.pocket_deposits TO authenticated;
GRANT ALL ON public.pocket_deposits TO service_role;
ALTER TABLE public.pocket_deposits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pocket_deposits_own_read" ON public.pocket_deposits FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE INDEX pocket_deposits_user_time ON public.pocket_deposits (user_id, block_time DESC);

-- Permanent history: no edits except the Seeds label, no deletes.
CREATE OR REPLACE FUNCTION public.pocket_deposits_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'deposit history is permanent';
  END IF;
  IF NEW.user_id <> OLD.user_id OR NEW.network <> OLD.network OR NEW.coin <> OLD.coin OR NEW.amount <> OLD.amount
     OR NEW.txid <> OLD.txid OR NEW.address <> OLD.address OR NEW.source <> OLD.source THEN
    RAISE EXCEPTION 'deposit terms are permanent';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pocket_deposits_guard BEFORE UPDATE OR DELETE ON public.pocket_deposits
  FOR EACH ROW EXECUTE FUNCTION public.pocket_deposits_guard();

CREATE TABLE public.pocket_deposit_watch (
  user_id uuid NOT NULL,
  coin_key text NOT NULL,
  address text NOT NULL,
  amount numeric NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, coin_key)
);
GRANT ALL ON public.pocket_deposit_watch TO service_role;
ALTER TABLE public.pocket_deposit_watch ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pocket_deposit_watch_service" ON public.pocket_deposit_watch FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.pocket_deposit_sync (
  user_id uuid PRIMARY KEY,
  synced_at timestamptz,
  working_until timestamptz,
  backfilled jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT ALL ON public.pocket_deposit_sync TO service_role;
ALTER TABLE public.pocket_deposit_sync ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pocket_deposit_sync_service" ON public.pocket_deposit_sync FOR ALL TO service_role USING (true) WITH CHECK (true);