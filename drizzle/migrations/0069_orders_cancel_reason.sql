ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancel_reason text;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_cancel_reason_known;
ALTER TABLE public.orders ADD CONSTRAINT orders_cancel_reason_known CHECK (cancel_reason IS NULL OR cancel_reason IN ('coins_left_pocket'));
CREATE INDEX IF NOT EXISTS orders_open_by_user_idx ON public.orders (user_id) WHERE status IN ('open', 'partial');