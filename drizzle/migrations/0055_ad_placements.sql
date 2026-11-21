CREATE TABLE public.ad_placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spot text NOT NULL CHECK (spot IN ('home_spotlight', 'markets_row', 'coin_side', 'coin_story', 'coin_banner')),
  advertiser text NOT NULL CHECK (char_length(advertiser) BETWEEN 1 AND 80),
  advertiser_kind text NOT NULL CHECK (advertiser_kind IN ('ecosystem', 'listed_coin')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 90),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 200),
  cta_label text NOT NULL CHECK (char_length(cta_label) BETWEEN 1 AND 30),
  link text NOT NULL CHECK (char_length(link) <= 500 AND (link ~ '^/[A-Za-z0-9_-]' OR link = '/' OR link ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?(/|$)')),
  coin_slug text CHECK (coin_slug IS NULL OR coin_slug ~ '^[a-z0-9]+-tsd$'),
  accent text NOT NULL DEFAULT 'green' CHECK (accent IN ('green', 'amber', 'ivory', 'forest')),
  image_path text CHECK (image_path IS NULL OR image_path ~ '^ads/[0-9a-f-]{36}\.(png|jpg|webp)$'),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  paused boolean NOT NULL DEFAULT false,
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

-- Visitors may read only what a running ad shows; the internal note and who made it stay server-side.
GRANT SELECT (id, spot, advertiser, advertiser_kind, title, body, cta_label, link, coin_slug, accent, image_path, starts_at, ends_at) ON public.ad_placements TO anon, authenticated;
GRANT ALL ON public.ad_placements TO service_role;

ALTER TABLE public.ad_placements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can see running ads" ON public.ad_placements
  FOR SELECT TO anon, authenticated
  USING (NOT paused AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now()));

CREATE INDEX ad_placements_spot_live ON public.ad_placements (spot, starts_at) WHERE NOT paused;

CREATE TABLE public.ad_daily_stats (
  ad_id uuid NOT NULL REFERENCES public.ad_placements(id) ON DELETE CASCADE,
  day date NOT NULL,
  views integer NOT NULL DEFAULT 0 CHECK (views >= 0),
  clicks integer NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  PRIMARY KEY (ad_id, day)
);

GRANT ALL ON public.ad_daily_stats TO service_role;
ALTER TABLE public.ad_daily_stats ENABLE ROW LEVEL SECURITY;
-- No policies: server role only.

CREATE OR REPLACE FUNCTION public.ad_stat_bump(_ad uuid, _kind text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _kind NOT IN ('view', 'click') THEN
    RAISE EXCEPTION 'bad kind';
  END IF;
  -- Only ads that are running right now can be counted.
  IF NOT EXISTS (
    SELECT 1 FROM public.ad_placements a
    WHERE a.id = _ad AND NOT a.paused AND a.starts_at <= now() AND (a.ends_at IS NULL OR a.ends_at > now())
  ) THEN
    RETURN;
  END IF;
  INSERT INTO public.ad_daily_stats (ad_id, day, views, clicks)
  VALUES (_ad, (now() AT TIME ZONE 'UTC')::date, CASE WHEN _kind = 'view' THEN 1 ELSE 0 END, CASE WHEN _kind = 'click' THEN 1 ELSE 0 END)
  ON CONFLICT (ad_id, day) DO UPDATE
    SET views = ad_daily_stats.views + EXCLUDED.views,
        clicks = ad_daily_stats.clicks + EXCLUDED.clicks;
END;
$$;

REVOKE ALL ON FUNCTION public.ad_stat_bump(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ad_stat_bump(uuid, text) TO service_role;