ALTER TABLE public.ignite_registrations
  ADD COLUMN IF NOT EXISTS ref_code text
  CHECK (ref_code IS NULL OR ref_code ~ '^[A-Za-z0-9_.-]{1,64}$');