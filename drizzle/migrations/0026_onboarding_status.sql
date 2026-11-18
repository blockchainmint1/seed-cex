ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_status text CHECK (onboarding_status IN ('done', 'skipped')),
  ADD COLUMN IF NOT EXISTS onboarding_at timestamptz;

-- Members who already linked an HME Wallet have clearly set up; don't send them through the guide.
UPDATE public.profiles p
   SET onboarding_status = 'done', onboarding_at = now()
 WHERE p.onboarding_status IS NULL
   AND EXISTS (SELECT 1 FROM public.hme_links l WHERE l.user_id = p.id AND l.revoked_at IS NULL);