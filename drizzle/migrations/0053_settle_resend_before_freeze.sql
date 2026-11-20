ALTER TABLE public.escrows
  ADD COLUMN IF NOT EXISTS sent_raw text,
  ADD COLUMN IF NOT EXISTS sent_from text,
  ADD COLUMN IF NOT EXISTS sent_nonce bigint,
  ADD COLUMN IF NOT EXISTS rebroadcast_at timestamptz;
COMMENT ON COLUMN public.escrows.sent_raw IS 'Signed transaction hex as broadcast by Seeds; resent once if the network drops it (audit #3 follow-up).';
COMMENT ON COLUMN public.escrows.sent_nonce IS 'EVM nonce of the Seeds-sent transaction; a higher confirmed nonce without our hash means it was replaced.';
REVOKE SELECT (sent_raw) ON public.escrows FROM anon, authenticated;