-- Per-user data export requests. Rate-limited to one per hour (enforced in RPC).
-- Files live in the `user-exports` Storage bucket (created in Phase 3).

create table if not exists public.data_export_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('pending', 'processing', 'ready', 'failed', 'expired')),
  file_path text,
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ready_at timestamptz,
  expires_at timestamptz
);

create index if not exists data_export_requests_user_id_created_at_idx
  on public.data_export_requests (user_id, created_at desc);

create index if not exists data_export_requests_status_idx
  on public.data_export_requests (status)
  where status in ('pending', 'processing');

alter table public.data_export_requests enable row level security;

-- User reads their own requests.
drop policy if exists "users read own export requests"
  on public.data_export_requests;
create policy "users read own export requests"
  on public.data_export_requests
  for select
  using (user_id = auth.uid());

-- Inserts / updates happen only through SECURITY DEFINER RPCs or service_role.
-- We deliberately REVOKE write privileges from authenticated so the rate-limit
-- check in request_data_export() (Phase 2) cannot be bypassed by direct table
-- access. Supabase grants write privileges to authenticated by default across
-- public tables, hence the explicit revoke here.
revoke insert, update, delete on public.data_export_requests from authenticated;
