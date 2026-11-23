CREATE TABLE public.referral_code_checks (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  checked_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.referral_code_checks TO service_role;
ALTER TABLE public.referral_code_checks ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.members_due_for_code_check(_limit integer)
RETURNS TABLE(user_id uuid, hm_member_id text)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT p.id, p.hm_member_id::text
  FROM public.profiles p
  LEFT JOIN public.referral_code_checks c ON c.user_id = p.id
  WHERE p.hm_member_id IS NOT NULL
    AND (c.checked_at IS NULL OR c.checked_at < now() - interval '1 day')
  ORDER BY c.checked_at NULLS FIRST, p.created_at
  LIMIT greatest(1, least(coalesce(_limit, 200), 1000));
$$;
REVOKE ALL ON FUNCTION public.members_due_for_code_check(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.members_due_for_code_check(integer) TO service_role;