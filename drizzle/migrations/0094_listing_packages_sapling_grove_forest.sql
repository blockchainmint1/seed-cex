ALTER TABLE public.listing_applications DROP CONSTRAINT IF EXISTS listing_applications_package_check;
ALTER TABLE public.listing_prices DROP CONSTRAINT IF EXISTS listing_prices_package_check;
ALTER TABLE public.listing_promo_codes DROP CONSTRAINT IF EXISTS listing_promo_codes_packages_check;

-- Two steps so the package primary key never collides mid-rename.
UPDATE public.listing_prices SET package = 'tmp_' || package WHERE package IN ('seed', 'sapling', 'grove');
UPDATE public.listing_prices SET package = CASE package WHEN 'tmp_seed' THEN 'sapling' WHEN 'tmp_sapling' THEN 'grove' WHEN 'tmp_grove' THEN 'forest' END
 WHERE package IN ('tmp_seed', 'tmp_sapling', 'tmp_grove');
UPDATE public.listing_applications SET package = CASE package WHEN 'seed' THEN 'sapling' WHEN 'sapling' THEN 'grove' WHEN 'grove' THEN 'forest' ELSE package END;
UPDATE public.listing_promo_codes SET packages = ARRAY(
  SELECT CASE x WHEN 'seed' THEN 'sapling' WHEN 'sapling' THEN 'grove' WHEN 'grove' THEN 'forest' ELSE x END FROM unnest(packages) AS x
) WHERE packages IS NOT NULL;

ALTER TABLE public.listing_applications ADD CONSTRAINT listing_applications_package_check CHECK (package IN ('sapling', 'grove', 'forest'));
ALTER TABLE public.listing_prices ADD CONSTRAINT listing_prices_package_check CHECK (package IN ('sapling', 'grove', 'forest'));
ALTER TABLE public.listing_promo_codes ADD CONSTRAINT listing_promo_codes_packages_check CHECK (packages IS NULL OR packages <@ ARRAY['sapling', 'grove', 'forest']::text[]);