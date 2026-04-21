-- Phase 1 of account deletion feature.
-- Adds lifecycle state to profiles: ACTIVE -> PENDING_DELETION -> PURGED.
-- See docs/specifications/account-deletion-plan.md.

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'account_status' and n.nspname = 'public'
  ) then
    create type public.account_status as enum ('ACTIVE', 'PENDING_DELETION', 'PURGED');
  end if;
end $$;

alter table public.profiles
  add column if not exists status public.account_status not null default 'ACTIVE';

alter table public.profiles
  add column if not exists status_changed_at timestamptz;

alter table public.profiles
  add column if not exists purge_after timestamptz;

-- Used by the purge cron to find ripe accounts. Partial index keeps it small.
create index if not exists profiles_purge_after_idx
  on public.profiles (purge_after)
  where status = 'PENDING_DELETION';

-- Index on status itself helps active-member filtering in joins.
create index if not exists profiles_status_idx
  on public.profiles (status)
  where status <> 'ACTIVE';
