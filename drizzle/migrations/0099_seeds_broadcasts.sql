CREATE TABLE public.seeds_broadcasts (
  chain text NOT NULL,
  txid text NOT NULL CHECK (txid ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chain, txid)
);
GRANT ALL ON public.seeds_broadcasts TO service_role;
ALTER TABLE public.seeds_broadcasts ENABLE ROW LEVEL SECURITY;
CREATE INDEX seeds_broadcasts_created_idx ON public.seeds_broadcasts (created_at);
COMMENT ON TABLE public.seeds_broadcasts IS 'Transactions Seeds itself broadcast; only their unconfirmed change may be re-spent (audit X1). Server-only.';