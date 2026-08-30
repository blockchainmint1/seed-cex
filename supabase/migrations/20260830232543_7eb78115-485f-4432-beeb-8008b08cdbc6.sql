create type public.wrap_direction as enum ('wrap', 'unwrap');

create type public.wrap_status as enum (
  'created','awaiting_deposit','deposit_detected','deposit_confirmed','processing','complete','failed','expired'
);

create table public.wrap_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  direction public.wrap_direction not null,
  base_symbol text not null,
  wrapped_symbol text not null,
  issuer_order_id text,
  issuer_status text,
  deposit_address text,
  payout_address text,
  amount_expected numeric,
  amount_received numeric,
  amount_delivered numeric,
  deposit_txid text,
  delivery_txid text,
  status public.wrap_status not null default 'created',
  error text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index wrap_orders_user_idx on public.wrap_orders (user_id, created_at desc);
create unique index wrap_orders_issuer_id_uidx on public.wrap_orders (issuer_order_id) where issuer_order_id is not null;

grant select on public.wrap_orders to authenticated;
grant all on public.wrap_orders to service_role;

alter table public.wrap_orders enable row level security;

create policy "Users read own wrap orders"
on public.wrap_orders for select to authenticated
using (auth.uid() = user_id);

create policy "Service role manages wrap orders"
on public.wrap_orders for all to service_role
using (true) with check (true);

create or replace function public.touch_wrap_orders_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.touch_wrap_orders_updated_at() from public, anon, authenticated;

create trigger wrap_orders_updated_at
before update on public.wrap_orders
for each row execute function public.touch_wrap_orders_updated_at();