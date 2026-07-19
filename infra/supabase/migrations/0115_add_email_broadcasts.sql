-- Product broadcast emails: one row per announcement plus a per-recipient
-- queue snapshotted at send time. Only the service role touches these tables
-- (the admin edge function is the sole writer/reader) — RLS on, no policies.

create table if not exists public.email_broadcasts (
  id               uuid primary key default gen_random_uuid(),
  subject          text not null,
  body             text not null,
  status           text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  created_by       uuid references auth.users(id) on delete set null,
  total_recipients integer not null default 0,
  sent_count       integer not null default 0,
  failed_count     integer not null default 0,
  created_at       timestamptz not null default now(),
  finished_at      timestamptz
);

alter table public.email_broadcasts enable row level security;

create table if not exists public.email_broadcast_recipients (
  id           uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references public.email_broadcasts(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  email        text not null,
  status       text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error        text,
  sent_at      timestamptz
);

create index if not exists email_broadcast_recipients_pending
  on public.email_broadcast_recipients (broadcast_id) where status = 'pending';

alter table public.email_broadcast_recipients enable row level security;
