ALTER TABLE public.p2p_offers
  ADD COLUMN IF NOT EXISTS side text NOT NULL DEFAULT 'sell',
  ADD COLUMN IF NOT EXISTS auto_reply text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS new_buyer_max_fiat numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_counterparty_trades integer NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.p2p_offers.seller_id IS 'Ad owner. For side=buy this is the buyer who posted the ad.';

ALTER TABLE public.p2p_profiles
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS away boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quick_replies text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS payment_details jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.p2p_blocks (
  blocker_id uuid NOT NULL,
  blocked_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);
GRANT ALL ON public.p2p_blocks TO service_role;
ALTER TABLE public.p2p_blocks ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.p2p_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL,
  reported_id uuid NOT NULL,
  trade_id uuid,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.p2p_reports TO service_role;
ALTER TABLE public.p2p_reports ENABLE ROW LEVEL SECURITY;