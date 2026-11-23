CREATE TABLE public.ignite_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 40 AND slug NOT IN ('confirmed', 'classes', 'interest')),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 60),
  tagline text CHECK (tagline IS NULL OR length(tagline) <= 200),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed', 'done')),
  instructor_name text NOT NULL DEFAULT 'Bobby Gray' CHECK (length(instructor_name) BETWEEN 2 AND 80),
  instructor_bio text CHECK (instructor_bio IS NULL OR length(instructor_bio) <= 600),
  instructor_photo_url text CHECK (instructor_photo_url IS NULL OR instructor_photo_url ~ '^https://'),
  capacity integer NOT NULL DEFAULT 100 CHECK (capacity BETWEEN 1 AND 5000),
  fee_usd numeric NOT NULL DEFAULT 0 CHECK (fee_usd >= 0 AND fee_usd <= 100000),
  deposit_usd numeric NOT NULL DEFAULT 400 CHECK (deposit_usd >= 0 AND deposit_usd <= 100000),
  miners_free boolean NOT NULL DEFAULT true,
  timezone text NOT NULL DEFAULT 'America/Chicago',
  sessions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(sessions) = 'array'),
  location text NOT NULL DEFAULT 'Live online' CHECK (length(location) <= 120),
  requirements text CHECK (requirements IS NULL OR length(requirements) <= 2000),
  agenda jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(agenda) = 'array'),
  benefits jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(benefits) = 'array'),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ignite_classes TO anon, authenticated;
GRANT ALL ON public.ignite_classes TO service_role;
ALTER TABLE public.ignite_classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone sees published classes" ON public.ignite_classes FOR SELECT TO anon, authenticated USING (status <> 'draft');

INSERT INTO public.ignite_classes (slug, name, tagline, status, instructor_name, instructor_bio, capacity, fee_usd, deposit_usd, miners_free, sessions, requirements, agenda, benefits, starts_at, ends_at)
VALUES
('first-class', 'First Class', 'Five evening sessions, Monday to Friday.', 'open', 'Bobby Gray', 'Founder of the Honest Money Ecosystem.', 100, 0, 400, true,
 '[{"starts_at":"2026-11-30T23:00:00Z","ends_at":"2026-12-01T00:30:00Z"},{"starts_at":"2026-12-01T23:00:00Z","ends_at":"2026-12-02T00:30:00Z"},{"starts_at":"2026-12-02T23:00:00Z","ends_at":"2026-12-03T00:30:00Z"},{"starts_at":"2026-12-03T23:00:00Z","ends_at":"2026-12-04T00:30:00Z"},{"starts_at":"2026-12-04T23:00:00Z","ends_at":"2026-12-05T00:30:00Z"}]'::jsonb,
 'An Honest.Money account (free to create). A phone or computer that can join a live video session. $400 of your own money for trading during class.',
 '[]'::jsonb, '[]'::jsonb, '2026-11-30T23:00:00Z', '2026-12-05T00:30:00Z'),
('spark', 'Spark', 'One weekend, two afternoon sessions.', 'draft', 'Bobby Gray', 'Founder of the Honest Money Ecosystem.', 100, 99, 400, true,
 '[{"starts_at":"2026-12-05T19:00:00Z","ends_at":"2026-12-05T23:00:00Z"},{"starts_at":"2026-12-06T19:00:00Z","ends_at":"2026-12-06T23:00:00Z"}]'::jsonb,
 'An Honest.Money account (free to create). A phone or computer that can join a live video session. $400 of your own money for trading during class.',
 '[]'::jsonb, '[]'::jsonb, '2026-12-05T19:00:00Z', '2026-12-06T23:00:00Z');

ALTER TABLE public.ignite_registrations
  ADD COLUMN class_id uuid REFERENCES public.ignite_classes(id),
  ADD COLUMN fee_usd numeric,
  ADD COLUMN miner_discount_usd numeric,
  ADD COLUMN deposit_usd numeric;
UPDATE public.ignite_registrations SET class_id = (SELECT id FROM public.ignite_classes WHERE slug = 'first-class'),
  fee_usd = 0, miner_discount_usd = 0, deposit_usd = amount_usd WHERE class_id IS NULL;
CREATE INDEX ignite_registrations_class ON public.ignite_registrations (class_id, status);

CREATE TABLE public.ignite_interest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(email) AND length(email) <= 255),
  full_name text CHECK (full_name IS NULL OR length(full_name) <= 100),
  user_id uuid,
  source text NOT NULL CHECK (source IN ('unpaid_registration', 'signup', 'registration', 'admin')),
  registration_id uuid REFERENCES public.ignite_registrations(id) ON DELETE SET NULL,
  unsubscribed_at timestamptz,
  last_emailed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ignite_interest TO service_role;
ALTER TABLE public.ignite_interest ENABLE ROW LEVEL SECURITY;

INSERT INTO public.ignite_interest (email, full_name, user_id, source, registration_id, created_at)
SELECT lower(r.email), left(r.full_name, 100), r.user_id, 'unpaid_registration', r.id, r.created_at
FROM public.ignite_registrations r
WHERE r.status IN ('pending', 'expired', 'underpaid')
ON CONFLICT (email) DO NOTHING;

CREATE TABLE public.ignite_miner_marks (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_miner boolean NOT NULL,
  note text CHECK (note IS NULL OR length(note) <= 200),
  set_by uuid NOT NULL,
  set_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ignite_miner_marks TO service_role;
ALTER TABLE public.ignite_miner_marks ENABLE ROW LEVEL SECURITY;