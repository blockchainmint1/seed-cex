ALTER TABLE public.p2p_profiles ADD COLUMN country text;
ALTER TABLE public.p2p_profiles ADD COLUMN tz text;
COMMENT ON COLUMN public.p2p_profiles.location IS 'DEPRECATED: replaced by country';
COMMENT ON COLUMN public.p2p_profiles.hours IS 'DEPRECATED: replaced by hours_from, hours_to, tz';
ALTER TABLE public.p2p_profiles ADD COLUMN hours_from smallint;
ALTER TABLE public.p2p_profiles ADD COLUMN hours_to smallint;