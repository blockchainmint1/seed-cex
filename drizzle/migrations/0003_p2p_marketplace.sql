CREATE TABLE public.p2p_profiles (
  user_id uuid PRIMARY KEY,
  handle text NOT NULL UNIQUE,
  bio text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  languages text[] NOT NULL DEFAULT '{}',
  hours text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.p2p_profiles TO anon, authenticated;
GRANT ALL ON public.p2p_profiles TO service_role;
ALTER TABLE public.p2p_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "p2p profiles public read" ON public.p2p_profiles FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.p2p_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL,
  asset text NOT NULL,
  price numeric NOT NULL,
  fee_pct numeric NOT NULL DEFAULT 0,
  min_fiat numeric NOT NULL DEFAULT 10,
  max_fiat numeric NOT NULL DEFAULT 1000,
  payment_methods text[] NOT NULL DEFAULT '{}',
  terms text NOT NULL DEFAULT '',
  window_minutes integer NOT NULL DEFAULT 30,
  active boolean NOT NULL DEFAULT true,
  verified_balance numeric NOT NULL DEFAULT 0,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.p2p_offers TO anon, authenticated;
GRANT ALL ON public.p2p_offers TO service_role;
ALTER TABLE public.p2p_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "p2p offers public read" ON public.p2p_offers FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.p2p_offer_instructions (
  offer_id uuid PRIMARY KEY REFERENCES public.p2p_offers(id) ON DELETE CASCADE,
  instructions text NOT NULL DEFAULT ''
);
GRANT ALL ON public.p2p_offer_instructions TO service_role;
ALTER TABLE public.p2p_offer_instructions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.p2p_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.p2p_offers(id),
  seller_id uuid NOT NULL,
  buyer_id uuid NOT NULL,
  asset text NOT NULL,
  price numeric NOT NULL,
  fee_pct numeric NOT NULL DEFAULT 0,
  crypto_amount numeric NOT NULL,
  fiat_amount numeric NOT NULL,
  fee_fiat numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL,
  instructions text NOT NULL DEFAULT '',
  buyer_address text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  expires_at timestamptz NOT NULL,
  seller_seen_at timestamptz,
  paid_at timestamptz,
  released_at timestamptz,
  cancelled_at timestamptz,
  release_txid text,
  flagged_reason text,
  dispute_reason text,
  disputed_by uuid,
  resolution text,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX p2p_trades_seller_idx ON public.p2p_trades(seller_id, status);
CREATE INDEX p2p_trades_buyer_idx ON public.p2p_trades(buyer_id);
GRANT ALL ON public.p2p_trades TO service_role;
ALTER TABLE public.p2p_trades ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.p2p_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL REFERENCES public.p2p_trades(id) ON DELETE CASCADE,
  sender_id uuid,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.p2p_messages TO service_role;
ALTER TABLE public.p2p_messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.p2p_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL REFERENCES public.p2p_trades(id) ON DELETE CASCADE,
  from_id uuid NOT NULL,
  to_id uuid NOT NULL,
  positive boolean NOT NULL,
  comment text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trade_id, from_id)
);
GRANT ALL ON public.p2p_feedback TO service_role;
ALTER TABLE public.p2p_feedback ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.p2p_dispute_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL REFERENCES public.p2p_trades(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL,
  vote text NOT NULL CHECK (vote IN ('release','refund')),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trade_id, voter_id)
);
GRANT ALL ON public.p2p_dispute_votes TO service_role;
ALTER TABLE public.p2p_dispute_votes ENABLE ROW LEVEL SECURITY;