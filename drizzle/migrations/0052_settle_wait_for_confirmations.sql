ALTER TABLE public.escrows ADD COLUMN IF NOT EXISTS sent_at timestamptz;
ALTER TABLE public.escrows ADD COLUMN IF NOT EXISTS sent_network text;
ALTER TABLE public.escrows ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
COMMENT ON COLUMN public.escrows.confirmed_at IS 'Set by the settlement watcher once the leg is deep enough for its network (settle/confirm-rules.ts). A trade reads settled only when every leg has it.';

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trading_frozen_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trading_frozen_reason text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trading_frozen_trade uuid;
COMMENT ON COLUMN public.profiles.trading_frozen_at IS 'Set when a trade payment this member sent vanished or was rejected; blocks new exchange orders until an admin clears it.';

CREATE INDEX IF NOT EXISTS trades_settling_idx ON public.trades (settle_started_at)
  WHERE settle_started_at IS NOT NULL AND status IN ('matched', 'both_funded');