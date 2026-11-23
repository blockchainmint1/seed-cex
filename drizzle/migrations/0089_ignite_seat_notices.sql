ALTER TABLE public.ignite_registrations ADD COLUMN IF NOT EXISTS notices_done_at timestamptz;
-- Seats confirmed before this change are treated as done (any missed email is handled by hand),
-- except one member's seat, whose Honest.Money purchase report is still owed.
UPDATE public.ignite_registrations SET notices_done_at = coalesce(confirmed_at, now())
 WHERE status = 'confirmed' AND id <> '930ba5f3-d805-4822-a2da-5b549e7694fe';
-- Their Telegram note went out at 18:01 before the cut-off; never repeat it.
INSERT INTO public.alert_log (user_id, kind, subject)
VALUES ('bb43d1d2-9b7a-48bc-92ff-8a90dcc9cd58', 'ignite:telegram-confirmed', '930ba5f3-d805-4822-a2da-5b549e7694fe')
ON CONFLICT DO NOTHING;
CREATE INDEX IF NOT EXISTS ignite_registrations_notices_due
  ON public.ignite_registrations (confirmed_at) WHERE status = 'confirmed' AND notices_done_at IS NULL;