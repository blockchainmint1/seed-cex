-- Alert bookkeeping for Telegram notifications.
--
-- deposit_sightings: the last confirmed balance we saw for each user/asset, so
--   a rise can be reported as a deposit exactly once instead of on every refresh.
-- alert_log: one row per (user, kind, subject) so the same alert never repeats
--   (e.g. an authorization that stays inside the expiry window).
--
-- Both tables are written only by server code running with the service role.

CREATE TABLE public.deposit_sightings (
  user_id uuid NOT NULL,
  asset text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, asset)
);
GRANT ALL ON public.deposit_sightings TO service_role;
ALTER TABLE public.deposit_sightings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deposit_sightings_service" ON public.deposit_sightings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.alert_log (
  user_id uuid NOT NULL,
  kind text NOT NULL,
  subject text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, subject)
);
GRANT ALL ON public.alert_log TO service_role;
ALTER TABLE public.alert_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alert_log_service" ON public.alert_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);