ALTER TABLE public.order_requests ADD COLUMN IF NOT EXISTS working_until timestamptz;
COMMENT ON COLUMN public.order_requests.working_until IS 'Lease for placing an approved order; a placing row past this time is picked up again by the minute job';
CREATE INDEX IF NOT EXISTS order_requests_unfinished_idx ON public.order_requests (created_at) WHERE status IN ('pending', 'placing');
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_cancel_reason_known;
ALTER TABLE public.orders ADD CONSTRAINT orders_cancel_reason_known
  CHECK (cancel_reason IS NULL OR cancel_reason = ANY (ARRAY['coins_left_pocket'::text, 'reapprove_needed'::text, 'approval_ended'::text]));