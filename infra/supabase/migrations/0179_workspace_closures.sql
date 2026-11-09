-- Days off for a whole workspace (company closures, collective leave).
--
-- Used only with the server setting workspaces.closures (Admin → Settings, off
-- by default). A workspace admin adds a named date range in the workspace
-- settings; the app shows it like a public holiday — hatched on the timeline,
-- in the calendar, not a working day in the workload heatmap. A day that is
-- both a holiday and a closure is one day off, never counted twice. Nobody's
-- time off changes (Motio keeps no leave balances).
--
-- RLS: members read their workspace's closures; admins (and the owner, who is
-- not always is_workspace_admin, see 0130) write them. No anon access.
--
-- Idempotent.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.workspace_closures;

create table if not exists public.workspace_closures (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  start_date date not null,
  end_date date not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  -- A closure is days or weeks, not years: one year at most.
  constraint workspace_closures_dates_check check (end_date >= start_date and end_date - start_date <= 366)
);

create index if not exists workspace_closures_workspace_idx
  on public.workspace_closures (workspace_id, start_date);

alter table public.workspace_closures enable row level security;

drop policy if exists "workspace members read closures" on public.workspace_closures;
create policy "workspace members read closures" on public.workspace_closures
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace admins write closures" on public.workspace_closures;
create policy "workspace admins write closures" on public.workspace_closures
  for all
  using (
    public.is_workspace_admin(workspace_id)
    or exists (select 1 from public.workspaces w where w.id = workspace_closures.workspace_id and w.owner_id = auth.uid())
  )
  with check (
    public.is_workspace_admin(workspace_id)
    or exists (select 1 from public.workspaces w where w.id = workspace_closures.workspace_id and w.owner_id = auth.uid())
  );

-- Deployed stands apply migrations as supabase_admin (no default grants): grant
-- explicitly. Never anon.
revoke all on public.workspace_closures from public, anon;
grant select, insert, update, delete on public.workspace_closures to authenticated, service_role;
