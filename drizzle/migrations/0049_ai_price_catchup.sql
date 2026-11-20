CREATE OR REPLACE FUNCTION public.ai_sync_request(_with_markets boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- Stand-in closes from Seeds' own 5-minute record ('seeds') don't count: the official close still gets fetched and replaces them.
    select max(day) into last_day from ai_daily_prices where coin_id = c.id and source is distinct from 'seeds';
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
end $function$;

CREATE OR REPLACE FUNCTION public.ai_sync_ingest()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      on conflict (coin_id, day) do update set close = excluded.close, volume = excluded.volume, source = excluded.source
        where ai_daily_prices.source = 'seeds';
    end if;
    delete from ai_sync_requests where id = r.id; n := n + 1;
  end loop;
  delete from ai_sync_requests where created_at < now() - interval '1 day';
  return n;
end $function$;