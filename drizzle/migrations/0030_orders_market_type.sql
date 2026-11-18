ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'limit';

ALTER TABLE public.orders
  ADD CONSTRAINT orders_order_type_check CHECK (order_type IN ('limit', 'market'));

-- A market order fills what it can immediately and the rest is cancelled.
-- It must never become a resting (open/partial) order on the book.
ALTER TABLE public.orders
  ADD CONSTRAINT orders_market_never_rests CHECK (order_type = 'limit' OR status IN ('filled', 'cancelled'));