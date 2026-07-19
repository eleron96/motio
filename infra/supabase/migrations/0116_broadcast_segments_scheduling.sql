-- Broadcast targeting + scheduling. Adds:
--  * message_type: 'announcement' respects the marketing opt-in and carries an
--    unsubscribe link; 'service' is transactional (account/maintenance), goes to
--    the whole ACTIVE segment ignoring opt-in, and carries no unsubscribe.
--  * audience_kind / audience_value: who the send targets.
--  * scheduled_at: NULL = send now; a future time = the cron ticker fires it.
-- The status CHECK gains 'scheduled' and 'canceled'.

alter table public.email_broadcasts
  add column if not exists message_type text not null default 'announcement',
  add column if not exists audience_kind text not null default 'subscribers',
  add column if not exists audience_value text,
  add column if not exists scheduled_at timestamptz;

do $$
begin
  -- Rebuild the status CHECK to admit the two new states.
  if exists (
    select 1 from pg_constraint
    where conname = 'email_broadcasts_status_check'
      and conrelid = 'public.email_broadcasts'::regclass
  ) then
    alter table public.email_broadcasts drop constraint email_broadcasts_status_check;
  end if;

  alter table public.email_broadcasts
    add constraint email_broadcasts_status_check
    check (status in ('scheduled', 'sending', 'sent', 'failed', 'canceled'));

  if not exists (
    select 1 from pg_constraint
    where conname = 'email_broadcasts_message_type_check'
      and conrelid = 'public.email_broadcasts'::regclass
  ) then
    alter table public.email_broadcasts
      add constraint email_broadcasts_message_type_check
      check (message_type in ('announcement', 'service'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'email_broadcasts_audience_kind_check'
      and conrelid = 'public.email_broadcasts'::regclass
  ) then
    alter table public.email_broadcasts
      add constraint email_broadcasts_audience_kind_check
      check (audience_kind in ('subscribers', 'domain', 'workspace', 'all_active'));
  end if;
end $$;

-- The ticker scans for due scheduled broadcasts.
create index if not exists email_broadcasts_scheduled
  on public.email_broadcasts (scheduled_at) where status = 'scheduled';
