ALTER TYPE public.escrow_leg ADD VALUE IF NOT EXISTS 'usdt';
ALTER TYPE public.escrow_leg ADD VALUE IF NOT EXISTS 'ltc';
ALTER TYPE public.escrow_leg ADD VALUE IF NOT EXISTS 'isk';
ALTER TYPE public.escrow_leg ADD VALUE IF NOT EXISTS 'zcu';
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS ltc_address text;
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS isk_address text;