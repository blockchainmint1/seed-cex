ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notify_p2p boolean NOT NULL DEFAULT true;
ALTER TABLE public.p2p_offers ADD COLUMN IF NOT EXISTS price_mode text NOT NULL DEFAULT 'fixed';
ALTER TABLE public.p2p_offers ADD COLUMN IF NOT EXISTS margin_pct numeric NOT NULL DEFAULT 0;
ALTER TABLE public.p2p_messages ADD COLUMN IF NOT EXISTS attachment_path text;
ALTER TABLE public.p2p_messages ADD COLUMN IF NOT EXISTS attachment_name text;