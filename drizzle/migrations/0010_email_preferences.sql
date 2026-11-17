ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_trade_confirmations boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_weekly_update boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.profiles.email_trade_confirmations IS 'Email: exchange trade and P2P order confirmations (server-written via updateMyProfile).';
COMMENT ON COLUMN public.profiles.email_weekly_update IS 'Email: weekly account update; also cleared by the signed one-click unsubscribe link.';