-- Demo project only. Runtime RPCs invoked by the frontend.
--
-- seed_demo_workspace()  — bootstraps the calling anon user's sandbox by
--                          copying demo_template.* into real public.*
--                          tables with offset_days resolved against today.
-- demo_heartbeat()       — touches the calling user's last_seen_at; the
--                          cleanup cron uses this to decide who to delete.
-- reset_demo_workspace() — wipes and re-seeds the caller's workspace.
--
-- All three are security definer so they can bypass RLS on tables they
-- need to populate. The set-of-rows they touch is always scoped to
-- auth.uid(), so cross-user access is impossible.

-- ── Heartbeat tracking ─────────────────────────────────────────────────
create table if not exists public.demo_session_heartbeats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.demo_session_heartbeats enable row level security;
-- No policies on purpose: only the security-definer RPCs below ever
-- write to this table; the frontend never reads it directly.

-- ── seed_demo_workspace ────────────────────────────────────────────────
create or replace function public.seed_demo_workspace()
returns uuid as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_today date := current_date;
begin
  if v_user_id is null then
    raise exception 'seed_demo_workspace requires an authenticated session';
  end if;

  -- Reuse existing workspace if the user already has one (idempotent boot).
  select id
    into v_workspace_id
  from public.workspaces
  where owner_id = v_user_id
  order by created_at asc
  limit 1;

  if v_workspace_id is not null then
    insert into public.demo_session_heartbeats (user_id, workspace_id, last_seen_at)
    values (v_user_id, v_workspace_id, now())
    on conflict (user_id) do update
      set last_seen_at = excluded.last_seen_at,
          workspace_id = excluded.workspace_id;
    return v_workspace_id;
  end if;

  insert into public.workspaces (name, owner_id)
  values ('Demo Sandbox', v_user_id)
  returning id into v_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, v_user_id, 'admin');

  -- Statuses, task_types, tags — direct copy of template sets.
  insert into public.statuses (id, workspace_id, name, color, is_final)
  select id, v_workspace_id, name, color, is_final
  from demo_template.statuses
  order by sort_order;

  insert into public.task_types (id, workspace_id, name, icon)
  select id, v_workspace_id, name, icon
  from demo_template.task_types
  order by sort_order;

  insert into public.tags (id, workspace_id, name, color)
  select id, v_workspace_id, name, color
  from demo_template.tags
  order by sort_order;

  -- Projects — direct copy.
  insert into public.projects (id, workspace_id, name, color)
  select id, v_workspace_id, name, color
  from demo_template.projects
  order by sort_order;

  -- Assignees — synthetic teammates (user_id NULL) plus the auto-assignee
  -- created by sync_member_assignee for the anon user themselves.
  insert into public.assignees (id, workspace_id, user_id, name)
  select id, v_workspace_id, null, name
  from demo_template.assignees
  order by sort_order
  on conflict do nothing;

  -- Tasks — resolve relative offsets to absolute dates against today.
  insert into public.tasks
    (id, workspace_id, title, project_id, assignee_id, start_date, end_date,
     status_id, type_id, priority, tag_ids, description)
  select
    t.id,
    v_workspace_id,
    t.title,
    t.project_id,
    t.assignee_id,
    v_today + t.start_offset_days,
    v_today + t.end_offset_days,
    t.status_id,
    t.type_id,
    t.priority,
    t.tag_ids,
    t.description
  from demo_template.tasks t
  order by t.sort_order;

  -- Milestones.
  insert into public.milestones (id, workspace_id, project_id, date, title)
  select
    m.id,
    v_workspace_id,
    m.project_id,
    v_today + m.offset_days,
    m.title
  from demo_template.milestones m
  order by m.sort_order;

  insert into public.demo_session_heartbeats (user_id, workspace_id)
  values (v_user_id, v_workspace_id)
  on conflict (user_id) do update
    set last_seen_at = now(),
        workspace_id = excluded.workspace_id;

  return v_workspace_id;
end;
$$ language plpgsql security definer set search_path = public, demo_template set row_security = off;

grant execute on function public.seed_demo_workspace() to anon, authenticated;

-- ── demo_heartbeat ─────────────────────────────────────────────────────
create or replace function public.demo_heartbeat()
returns void as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return;
  end if;

  update public.demo_session_heartbeats
    set last_seen_at = now()
  where user_id = v_user_id;
end;
$$ language plpgsql security definer set search_path = public set row_security = off;

grant execute on function public.demo_heartbeat() to anon, authenticated;

-- ── reset_demo_workspace ───────────────────────────────────────────────
create or replace function public.reset_demo_workspace()
returns uuid as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'reset_demo_workspace requires an authenticated session';
  end if;

  delete from public.workspaces
  where owner_id = v_user_id;
  -- Cascades into workspace_members, projects, tasks, milestones, etc.
  -- demo_session_heartbeats also cascades via workspace_id FK.

  return public.seed_demo_workspace();
end;
$$ language plpgsql security definer set search_path = public set row_security = off;

grant execute on function public.reset_demo_workspace() to anon, authenticated;
