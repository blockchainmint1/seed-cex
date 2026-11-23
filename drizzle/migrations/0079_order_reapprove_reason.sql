ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_cancel_reason_known;
ALTER TABLE public.orders ADD CONSTRAINT orders_cancel_reason_known
  CHECK (cancel_reason IS NULL OR cancel_reason = ANY (ARRAY['coins_left_pocket'::text, 'reapprove_needed'::text]));
COMMENT ON CONSTRAINT orders_cancel_reason_known ON public.orders IS 'coins_left_pocket = order-cover watcher; reapprove_needed = placed before one-tap order approval (Nov 23 2026), owner re-places it';