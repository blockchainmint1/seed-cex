-- New public tables get table-wide default grants; a column grant alone doesn't narrow them.
REVOKE ALL ON public.ad_placements FROM anon, authenticated;
GRANT SELECT (id, spot, advertiser, advertiser_kind, title, body, cta_label, link, coin_slug, accent, starts_at, ends_at) ON public.ad_placements TO anon, authenticated;

REVOKE ALL ON public.ad_daily_stats FROM anon, authenticated;

-- Same fix for coin videos: visitors never see which admin added a video.
REVOKE ALL ON public.coin_videos FROM anon, authenticated;
GRANT SELECT (id, slug, video_id, title, channel, note, created_at) ON public.coin_videos TO anon, authenticated;