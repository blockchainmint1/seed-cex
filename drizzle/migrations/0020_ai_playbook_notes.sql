create table public.ai_playbook_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  goal text not null check (goal in ('growth','balanced','smooth')),
  created_at timestamptz not null default now()
);
create index ai_playbook_notes_user_idx on public.ai_playbook_notes(user_id, created_at desc);
grant all on public.ai_playbook_notes to service_role;
alter table public.ai_playbook_notes enable row level security;