CREATE TABLE public.recruit_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key text NOT NULL UNIQUE CHECK (char_length(dedupe_key) BETWEEN 3 AND 300),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  symbol text NOT NULL CHECK (char_length(symbol) BETWEEN 1 AND 20),
  cmc_id integer UNIQUE,
  cmc_slug text CHECK (cmc_slug IS NULL OR char_length(cmc_slug) <= 120),
  chain text CHECK (chain IS NULL OR char_length(chain) <= 60),
  contract text CHECK (contract IS NULL OR char_length(contract) <= 120),
  website text CHECK (website IS NULL OR char_length(website) <= 300),
  twitter text CHECK (twitter IS NULL OR char_length(twitter) <= 300),
  telegram text CHECK (telegram IS NULL OR char_length(telegram) <= 300),
  discord text CHECK (discord IS NULL OR char_length(discord) <= 300),
  email text CHECK (email IS NULL OR char_length(email) <= 200),
  contact_name text CHECK (contact_name IS NULL OR char_length(contact_name) <= 120),
  source text NOT NULL CHECK (source IN ('cmc_new','cmc_midsize','exchange','paste','manual')),
  source_detail text CHECK (source_detail IS NULL OR char_length(source_detail) <= 60),
  market_cap_usd numeric,
  volume_24h_usd numeric,
  num_market_pairs integer,
  date_added timestamptz,
  tags text[] NOT NULL DEFAULT '{}',
  score integer NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  score_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  stage text NOT NULL DEFAULT 'found' CHECK (stage IN ('found','shortlisted','contacted','replied','applied','paid','live','passed','declined','dead')),
  finder text CHECK (finder IS NULL OR char_length(finder) <= 120),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 4000),
  facts_at timestamptz,
  last_contacted_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.recruit_leads TO service_role;
ALTER TABLE public.recruit_leads ENABLE ROW LEVEL SECURITY;
CREATE INDEX recruit_leads_stage_score ON public.recruit_leads (stage, score DESC);
CREATE INDEX recruit_leads_score ON public.recruit_leads (score DESC, created_at DESC);
CREATE INDEX recruit_leads_symbol ON public.recruit_leads (upper(symbol));
COMMENT ON TABLE public.recruit_leads IS 'Coin teams Seeds may invite to list. Server-only: written and read through admin-gated server functions; no browser access.';

CREATE TABLE public.recruit_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.recruit_leads(id) ON DELETE RESTRICT,
  channel text NOT NULL CHECK (channel IN ('email','telegram','x','other')),
  subject text CHECK (subject IS NULL OR char_length(subject) <= 200),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  ai_written boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','discarded')),
  created_by uuid NOT NULL,
  sent_by uuid,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'sent') = (sent_at IS NOT NULL))
);

GRANT ALL ON public.recruit_messages TO service_role;
ALTER TABLE public.recruit_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX recruit_messages_lead ON public.recruit_messages (lead_id, created_at DESC);
CREATE INDEX recruit_messages_ai_day ON public.recruit_messages (created_at) WHERE ai_written;
COMMENT ON TABLE public.recruit_messages IS 'Outreach drafts and sent messages for recruit_leads. Seeds never sends these itself; an admin copies and sends, then marks sent. Server-only.';

CREATE TABLE public.recruit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.recruit_leads(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('found','stage','edit','draft','sent','discarded','rescored')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.recruit_events TO service_role;
ALTER TABLE public.recruit_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX recruit_events_lead ON public.recruit_events (lead_id, created_at DESC);
COMMENT ON TABLE public.recruit_events IS 'Permanent history of recruiting changes (who moved a lead, drafted, sent). Server-only, append-only by convention.';