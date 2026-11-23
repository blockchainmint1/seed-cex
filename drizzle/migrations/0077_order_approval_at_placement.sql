ALTER TABLE public.send_approvals DROP CONSTRAINT send_approvals_purpose_check;
ALTER TABLE public.send_approvals ADD CONSTRAINT send_approvals_purpose_check CHECK (purpose = ANY (ARRAY['trade_leg','p2p_release','swap_out','dex_swap','withdrawal','two_step','loan_collateral','loan_funding','loan_repay','order']));

-- Fills paid under one order approval are found by this id (cumulative cap check).
CREATE INDEX IF NOT EXISTS send_approvals_order_approval_idx ON public.send_approvals ((meta->>'order_approval_id')) WHERE purpose = 'trade_leg';

-- An order waiting for its owner's Telegram tap. Its id becomes the order's id once approved.
CREATE TABLE public.order_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  pair text NOT NULL,
  side text NOT NULL CHECK (side IN ('buy','sell')),
  order_type text NOT NULL CHECK (order_type IN ('limit','market')),
  price numeric NOT NULL CHECK (price > 0),
  amount numeric NOT NULL CHECK (amount > 0),
  slippage_pct numeric,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','placing','placed','declined','expired','cancelled','failed')),
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
GRANT SELECT ON public.order_requests TO authenticated;
GRANT ALL ON public.order_requests TO service_role;
ALTER TABLE public.order_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read their own order requests" ON public.order_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX order_requests_user_idx ON public.order_requests (user_id, created_at DESC);