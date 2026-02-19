-- Query-path indexes for members/projects/planner workloads.
create index concurrently if not exists tasks_assignee_ids_gin_idx
  on public.tasks using gin (assignee_ids);

create index concurrently if not exists tasks_workspace_project_start_date_idx
  on public.tasks (workspace_id, project_id, start_date);

create index concurrently if not exists tasks_workspace_assignee_dates_idx
  on public.tasks (workspace_id, assignee_id, end_date, start_date);

create index concurrently if not exists workspace_invites_email_active_idx
  on public.workspace_invites (email_normalized, expires_at desc, created_at desc)
  where accepted_at is null and revoked_at is null;

-- Case-insensitive profile email lookup helper for admin id resolution.
create index concurrently if not exists profiles_email_lower_idx
  on public.profiles (lower(email));

create or replace function public.find_visible_profile_id_by_email(p_email text)
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select p.id
  from public.profiles p
  where lower(p.email) = lower(trim(p_email))
  limit 1;
$$;

grant execute on function public.find_visible_profile_id_by_email(text) to authenticated;

-- Dashboard RPCs execute short analytical queries; disable JIT to avoid compilation spikes.
alter function if exists public.dashboard_task_counts(uuid, date, date) set jit = off;
alter function if exists public.dashboard_task_counts_base(uuid, date, date) set jit = off;
alter function if exists public.dashboard_task_time_series(uuid, date, date) set jit = off;
alter function if exists public.dashboard_task_time_series_base(uuid, date, date) set jit = off;
