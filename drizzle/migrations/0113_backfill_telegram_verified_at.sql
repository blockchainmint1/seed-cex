ALTER TABLE public.profiles DISABLE TRIGGER USER;
UPDATE public.profiles p SET telegram_verified_at = t.added_at
FROM public.second_factor_trust t
WHERE t.user_id = p.id AND t.kind = 'telegram' AND t.ref = p.telegram_chat_id::text
  AND p.telegram_verified AND p.telegram_chat_id IS NOT NULL AND p.telegram_verified_at IS NULL;
ALTER TABLE public.profiles ENABLE TRIGGER USER;