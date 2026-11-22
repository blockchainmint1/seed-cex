ALTER TABLE public.qa_settings ADD COLUMN telegram_chat_id text CHECK (telegram_chat_id IS NULL OR telegram_chat_id ~ '^-?[0-9]{5,20}$');
UPDATE public.qa_settings SET telegram_chat_id = '-1004268049198' WHERE id = 1;
COMMENT ON COLUMN public.qa_settings.telegram_chat_id IS 'Telegram group that receives QA report posts (Admin → Bugs). Null = DM verified admins instead.';