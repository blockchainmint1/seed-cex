-- ENUMS
CREATE TYPE public.app_role AS ENUM ('user', 'arbitrator', 'admin');
CREATE TYPE public.order_side AS ENUM ('buy', 'sell');
CREATE TYPE public.order_status AS ENUM ('open', 'partial', 'filled', 'cancelled');
CREATE TYPE public.trade_status AS ENUM ('matched', 'maker_funded', 'taker_funded', 'both_funded', 'released', 'settled', 'disputed', 'arbitrated', 'timed_out', 'refunded');
CREATE TYPE public.escrow_leg AS ENUM ('txc', 'usdc');
CREATE TYPE public.escrow_status AS ENUM ('awaiting_funding', 'funding_seen', 'confirmed', 'released', 'refunded');

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT 'anon',
  reputation integer NOT NULL DEFAULT 0,
  trades_completed integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_public_read" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- ROLES (separate table, never on profiles)
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_read_own" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- WALLETS: ciphertext only. No plaintext seed ever touches this table.
CREATE TABLE public.wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  vault_ciphertext text NOT NULL,
  kdf_salt text NOT NULL,
  kdf_iterations integer NOT NULL DEFAULT 600000,
  txc_address text NOT NULL,
  evm_address text,
  backed_up boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallets_own_all" ON public.wallets FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ORDERS
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  is_demo boolean NOT NULL DEFAULT false,
  pair text NOT NULL DEFAULT 'USDC_TXC',
  side public.order_side NOT NULL,
  price numeric(20,8) NOT NULL CHECK (price > 0),
  amount numeric(20,8) NOT NULL CHECK (amount > 0),
  filled numeric(20,8) NOT NULL DEFAULT 0 CHECK (filled >= 0),
  status public.order_status NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_book_idx ON public.orders (pair, side, price, created_at) WHERE status IN ('open','partial');
GRANT SELECT ON public.orders TO anon;
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_public_book_read" ON public.orders FOR SELECT USING (true);
CREATE POLICY "orders_insert_own" ON public.orders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND is_demo = false);
CREATE POLICY "orders_update_own" ON public.orders FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- TRADES
CREATE TABLE public.trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pair text NOT NULL DEFAULT 'USDC_TXC',
  maker_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  taker_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  maker_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  taker_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_demo boolean NOT NULL DEFAULT false,
  side public.order_side NOT NULL,
  price numeric(20,8) NOT NULL,
  amount numeric(20,8) NOT NULL,
  status public.trade_status NOT NULL DEFAULT 'matched',
  expires_at timestamptz NOT NULL DEFAULT now() + interval '2 hours',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trades_recent_idx ON public.trades (pair, created_at DESC);
GRANT SELECT ON public.trades TO anon;
GRANT SELECT, INSERT, UPDATE ON public.trades TO authenticated;
GRANT ALL ON public.trades TO service_role;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
-- Tape (price/amount/time) is public market data.
CREATE POLICY "trades_public_tape_read" ON public.trades FOR SELECT USING (true);
CREATE POLICY "trades_update_participant" ON public.trades FOR UPDATE TO authenticated
  USING (auth.uid() = maker_id OR auth.uid() = taker_id OR public.has_role(auth.uid(), 'arbitrator'))
  WITH CHECK (auth.uid() = maker_id OR auth.uid() = taker_id OR public.has_role(auth.uid(), 'arbitrator'));

CREATE OR REPLACE FUNCTION public.is_trade_participant(_trade_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trades t
    WHERE t.id = _trade_id AND (t.maker_id = _user_id OR t.taker_id = _user_id)
  ) OR public.has_role(_user_id, 'arbitrator')
$$;

-- ESCROWS
CREATE TABLE public.escrows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  leg public.escrow_leg NOT NULL,
  multisig_address text,
  expected_amount numeric(20,8) NOT NULL,
  funded_amount numeric(20,8) NOT NULL DEFAULT 0,
  confirmations integer NOT NULL DEFAULT 0,
  funding_txid text,
  release_txid text,
  status public.escrow_status NOT NULL DEFAULT 'awaiting_funding',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trade_id, leg)
);
GRANT SELECT, INSERT, UPDATE ON public.escrows TO authenticated;
GRANT ALL ON public.escrows TO service_role;
ALTER TABLE public.escrows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "escrows_participant_read" ON public.escrows FOR SELECT TO authenticated
  USING (public.is_trade_participant(trade_id, auth.uid()));
CREATE POLICY "escrows_participant_update" ON public.escrows FOR UPDATE TO authenticated
  USING (public.is_trade_participant(trade_id, auth.uid()))
  WITH CHECK (public.is_trade_participant(trade_id, auth.uid()));

-- TRADE EVENTS (append-only audit trail)
CREATE TABLE public.trade_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trade_events_trade_idx ON public.trade_events (trade_id, created_at);
GRANT SELECT, INSERT ON public.trade_events TO authenticated;
GRANT ALL ON public.trade_events TO service_role;
ALTER TABLE public.trade_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trade_events_participant_read" ON public.trade_events FOR SELECT TO authenticated
  USING (public.is_trade_participant(trade_id, auth.uid()));

-- updated_at helper
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER wallets_touch BEFORE UPDATE ON public.wallets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER orders_touch BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trades_touch BEFORE UPDATE ON public.trades FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER escrows_touch BEFORE UPDATE ON public.escrows FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- auto profile + default role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1), 'anon'))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- SEED demo market depth so the book is live on first load
INSERT INTO public.orders (is_demo, pair, side, price, amount, filled, status, created_at) VALUES
  (true,'USDC_TXC','buy' ,0.04120,  8400.00000000, 0,'open', now() - interval '31 minutes'),
  (true,'USDC_TXC','buy' ,0.04135, 12250.00000000, 0,'open', now() - interval '27 minutes'),
  (true,'USDC_TXC','buy' ,0.04148,  5100.00000000, 0,'open', now() - interval '22 minutes'),
  (true,'USDC_TXC','buy' ,0.04160, 19800.00000000, 0,'open', now() - interval '18 minutes'),
  (true,'USDC_TXC','buy' ,0.04172,  3400.00000000, 0,'open', now() - interval '14 minutes'),
  (true,'USDC_TXC','buy' ,0.04185, 27600.00000000, 0,'open', now() - interval '9 minutes'),
  (true,'USDC_TXC','buy' ,0.04196,  6250.00000000, 0,'open', now() - interval '6 minutes'),
  (true,'USDC_TXC','buy' ,0.04203, 14100.00000000, 0,'open', now() - interval '3 minutes'),
  (true,'USDC_TXC','sell',0.04218,  9700.00000000, 0,'open', now() - interval '2 minutes'),
  (true,'USDC_TXC','sell',0.04229,  4300.00000000, 0,'open', now() - interval '5 minutes'),
  (true,'USDC_TXC','sell',0.04241, 22400.00000000, 0,'open', now() - interval '8 minutes'),
  (true,'USDC_TXC','sell',0.04256,  7150.00000000, 0,'open', now() - interval '12 minutes'),
  (true,'USDC_TXC','sell',0.04270, 16900.00000000, 0,'open', now() - interval '16 minutes'),
  (true,'USDC_TXC','sell',0.04288,  5600.00000000, 0,'open', now() - interval '21 minutes'),
  (true,'USDC_TXC','sell',0.04305, 31200.00000000, 0,'open', now() - interval '26 minutes'),
  (true,'USDC_TXC','sell',0.04331, 11800.00000000, 0,'open', now() - interval '33 minutes');

INSERT INTO public.trades (is_demo, pair, side, price, amount, status, created_at) VALUES
  (true,'USDC_TXC','buy' ,0.04211,  2400.00000000,'settled', now() - interval '1 minutes'),
  (true,'USDC_TXC','sell',0.04206,  8100.00000000,'settled', now() - interval '4 minutes'),
  (true,'USDC_TXC','buy' ,0.04215, 13500.00000000,'settled', now() - interval '7 minutes'),
  (true,'USDC_TXC','sell',0.04199,  4750.00000000,'settled', now() - interval '11 minutes'),
  (true,'USDC_TXC','buy' ,0.04222, 21000.00000000,'settled', now() - interval '15 minutes'),
  (true,'USDC_TXC','sell',0.04190,  6300.00000000,'settled', now() - interval '19 minutes'),
  (true,'USDC_TXC','buy' ,0.04208,  9900.00000000,'settled', now() - interval '24 minutes'),
  (true,'USDC_TXC','sell',0.04183, 15600.00000000,'settled', now() - interval '29 minutes'),
  (true,'USDC_TXC','buy' ,0.04201,  3200.00000000,'settled', now() - interval '35 minutes'),
  (true,'USDC_TXC','sell',0.04177, 18400.00000000,'settled', now() - interval '42 minutes'),
  (true,'USDC_TXC','buy' ,0.04194,  7700.00000000,'settled', now() - interval '51 minutes'),
  (true,'USDC_TXC','sell',0.04165, 25300.00000000,'settled', now() - interval '58 minutes');