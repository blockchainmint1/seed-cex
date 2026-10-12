create table public.hme_link_requests (
  challenge_id text primary key,
  challenge text not null,
  user_id uuid not null,
  recipient_priv_ciphertext text not null,
  recipient_pubkey text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
grant all on public.hme_link_requests to service_role;
alter table public.hme_link_requests enable row level security;
create policy "service only" on public.hme_link_requests as restrictive for all to anon, authenticated using (false) with check (false);

create table public.hme_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  mode text not null check (mode in ('access','approve')),
  account integer not null,
  paths jsonb not null,
  identity_address text not null,
  xpubs jsonb not null,
  key_ciphertext text,
  status text not null default 'active' check (status in ('active','revoked')),
  revoked_at timestamptz,
  revoked_by text,
  created_at timestamptz not null default now()
);
grant all on public.hme_links to service_role;
alter table public.hme_links enable row level security;
create policy "service only" on public.hme_links as restrictive for all to anon, authenticated using (false) with check (false);
create index hme_links_user_idx on public.hme_links(user_id) where status = 'active';

create table public.hme_trade_proposals (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.hme_links(id) on delete cascade,
  user_id uuid not null,
  trade_id uuid,
  chain text not null,
  psbt text not null,
  summary text not null,
  status text not null default 'pending' check (status in ('pending','approved','declined','expired','broadcast')),
  signed_psbt text,
  expires_at timestamptz not null,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);
grant all on public.hme_trade_proposals to service_role;
alter table public.hme_trade_proposals enable row level security;
create policy "service only" on public.hme_trade_proposals as restrictive for all to anon, authenticated using (false) with check (false);
create index hme_trade_proposals_link_idx on public.hme_trade_proposals(link_id, status);