CREATE TABLE public.coin_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+-tsd$'),
  video_id text NOT NULL CHECK (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  channel text CHECK (channel IS NULL OR char_length(channel) <= 120),
  note text CHECK (note IS NULL OR char_length(note) <= 280),
  added_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slug, video_id)
);

GRANT SELECT (id, slug, video_id, title, channel, note, created_at) ON public.coin_videos TO anon, authenticated;
GRANT ALL ON public.coin_videos TO service_role;

ALTER TABLE public.coin_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can see coin videos" ON public.coin_videos
  FOR SELECT TO anon, authenticated USING (true);

CREATE INDEX coin_videos_slug_created ON public.coin_videos (slug, created_at DESC);