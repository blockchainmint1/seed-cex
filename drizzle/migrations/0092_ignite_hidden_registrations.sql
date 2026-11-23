ALTER TABLE public.ignite_registrations ADD COLUMN IF NOT EXISTS hidden_at timestamptz;

ALTER TABLE public.ignite_registrations
  ADD CONSTRAINT ignite_registrations_hidden_unpaid_only
  CHECK (hidden_at IS NULL OR status IN ('pending', 'canceled'));

-- Tidy Ignite: hide old unpaid / cancelled sign-ups, keeping the one checkout in progress.
UPDATE public.ignite_registrations
   SET hidden_at = now()
 WHERE class_id = '5a1ab827-0f05-4d9f-a043-50808718471a'
   AND status IN ('pending', 'canceled')
   AND id <> '9cd2a6f5-5d3f-4f81-9b66-58c8a406b2d5'
   AND (invoice_expires_at IS NULL OR invoice_expires_at < now());