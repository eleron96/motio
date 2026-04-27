-- Audit trail for account lifecycle events.
-- Rows survive user purge: user_id has no FK so it remains after auth.users row
-- is anonymized. email_hash lets support match a user by email without storing
-- the plaintext.

create table if not exists public.account_deletion_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email_hash text,
  event_type text not null check (event_type in (
    'requested', 'cancelled', 'purge_started', 'purged', 'purge_failed'
  )),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists account_deletion_events_user_id_idx
  on public.account_deletion_events (user_id);
create index if not exists account_deletion_events_event_type_idx
  on public.account_deletion_events (event_type);
create index if not exists account_deletion_events_created_at_idx
  on public.account_deletion_events (created_at desc);

alter table public.account_deletion_events enable row level security;

-- Only super_admins can read. service_role bypasses RLS automatically.
drop policy if exists "super admins read deletion events"
  on public.account_deletion_events;
create policy "super admins read deletion events"
  on public.account_deletion_events
  for select
  using (
    exists (
      select 1 from public.super_admins
      where user_id = auth.uid()
    )
  );
