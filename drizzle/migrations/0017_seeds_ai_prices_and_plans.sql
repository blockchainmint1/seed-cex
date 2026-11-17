create extension if not exists pg_net;

create table public.ai_coins (
  id text primary key,
  symbol text not null,
  name text not null,
  rank int,
  market_cap numeric,
  image text,
  active boolean not null default true,
  swap_coin text,
  binance_symbol text,
  binance_ok boolean,
  updated_at timestamptz not null default now()
);
grant select on public.ai_coins to anon, authenticated;
grant all on public.ai_coins to service_role;
alter table public.ai_coins enable row level security;
create policy "AI coins are public" on public.ai_coins for select to anon, authenticated using (true);

create table public.ai_daily_prices (
  coin_id text not null references public.ai_coins(id) on delete cascade,
  day date not null,
  open numeric, high numeric, low numeric,
  close numeric not null,
  volume numeric,
  source text not null,
  primary key (coin_id, day)
);
grant select on public.ai_daily_prices to anon, authenticated;
grant all on public.ai_daily_prices to service_role;
alter table public.ai_daily_prices enable row level security;
create policy "AI prices are public" on public.ai_daily_prices for select to anon, authenticated using (true);

create table public.ai_sync_requests (
  id bigint primary key,
  kind text not null,
  coin_id text,
  created_at timestamptz not null default now()
);
grant all on public.ai_sync_requests to service_role;
alter table public.ai_sync_requests enable row level security;

create table public.ai_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  settings jsonb not null,
  commit_tsd numeric not null check (commit_tsd > 0),
  status text not null default 'locked' check (status in ('locked','paused','ended')),
  telegram_daily boolean not null default true,
  locked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_plans_user_idx on public.ai_plans(user_id);
grant select on public.ai_plans to authenticated;
grant all on public.ai_plans to service_role;
alter table public.ai_plans enable row level security;
create policy "Members read their own AI plans" on public.ai_plans for select to authenticated using (auth.uid() = user_id);

create table public.ai_plan_checks (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.ai_plans(id) on delete cascade,
  user_id uuid not null,
  day date not null,
  suggestion jsonb not null,
  message text not null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (plan_id, day)
);
create index ai_plan_checks_user_idx on public.ai_plan_checks(user_id, day desc);
grant select on public.ai_plan_checks to authenticated;
grant all on public.ai_plan_checks to service_role;
alter table public.ai_plan_checks enable row level security;
create policy "Members read their own plan checks" on public.ai_plan_checks for select to authenticated using (auth.uid() = user_id);

create table public.ai_settings (
  id int primary key default 1 check (id = 1),
  one_tap_limit_usd numeric not null default 50 check (one_tap_limit_usd >= 0),
  max_commit_tsd numeric not null default 1000 check (max_commit_tsd > 0),
  execution_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
grant all on public.ai_settings to service_role;
alter table public.ai_settings enable row level security;
insert into public.ai_settings(id) values (1) on conflict do nothing;

insert into public.ai_coins(id, symbol, name, rank, swap_coin, binance_symbol) values
('bitcoin','btc','Bitcoin',1,'BTC','BTCUSDT'),
('ethereum','eth','Ethereum',2,'ETH','ETHUSDT'),
('ripple','xrp','XRP',3,'XRP','XRPUSDT'),
('solana','sol','Solana',4,'SOL','SOLUSDT'),
('tron','trx','TRON',5,'TRX','TRXUSDT'),
('dogecoin','doge','Dogecoin',6,'DOGE','DOGEUSDT'),
('bitcoin-cash','bch','Bitcoin Cash',7,'BCH','BCHUSDT'),
('litecoin','ltc','Litecoin',8,'LTC','LTCUSDT'),
('aave','aave','Aave',9,'AAVE','AAVEUSDT')
on conflict (id) do nothing;

create or replace function public.ai_sync_request(_with_markets boolean default false) returns integer
language plpgsql security definer set search_path = public as $$
declare c record; start_day date; last_day date; n int := 0; rid bigint; ids text;
begin
  if _with_markets then
    select string_agg(id, ',') into ids from ai_coins where active;
    if ids is not null then
      rid := net.http_get('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&per_page=250&ids=' || ids);
      insert into ai_sync_requests(id, kind) values (rid, 'markets'); n := n + 1;
    end if;
  end if;
  for c in select * from ai_coins where active loop
    select max(day) into last_day from ai_daily_prices where coin_id = c.id;
    if c.binance_ok is distinct from false then
      start_day := coalesce(last_day + 1, date '2010-01-01');
      continue when start_day >= current_date;
      rid := net.http_get('https://data-api.binance.vision/api/v3/klines?interval=1d&limit=1000&symbol='
        || coalesce(c.binance_symbol, upper(c.symbol) || 'USDT')
        || '&startTime=' || (extract(epoch from start_day)::bigint * 1000));
      insert into ai_sync_requests(id, kind, coin_id) values (rid, 'binance', c.id);
    else
      continue when last_day >= current_date - 1;
      rid := net.http_get('https://api.coingecko.com/api/v3/coins/' || c.id || '/market_chart?vs_currency=usd&interval=daily&days='
        || case when last_day is null then '365' else '30' end);
      insert into ai_sync_requests(id, kind, coin_id) values (rid, 'gecko', c.id);
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.ai_sync_ingest() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; j jsonb; n int := 0;
begin
  for r in select s.*, h.status_code, h.content from ai_sync_requests s join net._http_response h on h.id = s.id loop
    if r.kind = 'markets' and r.status_code = 200 then
      j := r.content::jsonb;
      update ai_coins c set name = x->>'name', image = x->>'image', market_cap = (x->>'market_cap')::numeric, updated_at = now()
      from jsonb_array_elements(j) x where c.id = x->>'id';
      update ai_coins c set rank = q.rn from (
        select id, row_number() over (order by market_cap desc nulls last) rn from ai_coins where active) q
      where c.id = q.id;
    elsif r.kind = 'binance' then
      if r.status_code = 200 then
        update ai_coins set binance_ok = true where id = r.coin_id;
        insert into ai_daily_prices(coin_id, day, open, high, low, close, volume, source)
        select r.coin_id, to_timestamp((k->>0)::bigint / 1000)::date, (k->>1)::numeric, (k->>2)::numeric, (k->>3)::numeric, (k->>4)::numeric, (k->>5)::numeric, 'binance'
        from jsonb_array_elements(r.content::jsonb) k
        where to_timestamp((k->>0)::bigint / 1000)::date < current_date
        on conflict (coin_id, day) do update set open = excluded.open, high = excluded.high, low = excluded.low, close = excluded.close, volume = excluded.volume, source = excluded.source;
      elsif r.status_code = 400 then
        update ai_coins set binance_ok = false where id = r.coin_id;
      end if;
    elsif r.kind = 'gecko' and r.status_code = 200 then
      j := r.content::jsonb;
      insert into ai_daily_prices(coin_id, day, close, volume, source)
      select distinct on (d) r.coin_id, d, p, v, 'coingecko' from (
        select to_timestamp((pp->>0)::bigint / 1000)::date d, (pp->>1)::numeric p, (vv->>1)::numeric v, (pp->>0)::bigint t
        from jsonb_array_elements(j->'prices') with ordinality a(pp, i)
        left join jsonb_array_elements(j->'total_volumes') with ordinality b(vv, i2) on i = i2
      ) q where d < current_date order by d, t desc
      on conflict (coin_id, day) do nothing;
    end if;
    delete from ai_sync_requests where id = r.id; n := n + 1;
  end loop;
  delete from ai_sync_requests where created_at < now() - interval '1 day';
  return n;
end $$;

revoke execute on function public.ai_sync_request(boolean) from public, anon, authenticated;
revoke execute on function public.ai_sync_ingest() from public, anon, authenticated;
grant execute on function public.ai_sync_request(boolean) to service_role;
grant execute on function public.ai_sync_ingest() to service_role;