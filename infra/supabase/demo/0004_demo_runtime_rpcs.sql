-- Demo project only. Runtime RPCs invoked by the frontend.
--
-- seed_demo_workspace()  — bootstraps the calling anon user's sandbox by
--                          copying demo_template.* into real public.*
--                          tables. Each call mints fresh UUIDs and
--                          remaps every FK reference (assignee_ids,
--                          tag_ids, status_id, type_id, project_id) to
--                          the new IDs, so multiple visitors never
--                          collide on the metadata primary keys.
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

  -- Same key as ensure_initial_workspace so the two cannot race on first
  -- sign-in. Whoever wins creates and seeds; the loser sees the existing
  -- workspace and returns early.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

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

  -- ── Per-call ID mapping ──────────────────────────────────────────────
  -- public.statuses, projects etc. have a global PK on id, so we can't
  -- copy the deterministic UUIDs from demo_template — the second visitor
  -- would conflict on the existing rows. Generate fresh UUIDs at insert
  -- time and remember which template row each new row came from.
  --
  -- Join key is name: template content keeps each name unique within a
  -- given catalog (one Backlog, one Ready, one Emma Taylor, etc.), and
  -- public.* tables receive only those names within v_workspace_id.
  create temp table if not exists _seed_status_map (
    template_id uuid primary key, new_id uuid not null
  ) on commit drop;
  create temp table if not exists _seed_type_map (
    template_id uuid primary key, new_id uuid not null
  ) on commit drop;
  create temp table if not exists _seed_tag_map (
    template_id uuid primary key, new_id uuid not null
  ) on commit drop;
  create temp table if not exists _seed_project_map (
    template_id uuid primary key, new_id uuid not null
  ) on commit drop;
  create temp table if not exists _seed_assignee_map (
    template_id uuid primary key, new_id uuid not null
  ) on commit drop;

  -- Statuses
  with inserted as (
    insert into public.statuses (workspace_id, name, color, is_final, is_cancelled)
    select v_workspace_id, t.name, t.color, t.is_final, t.is_cancelled
    from demo_template.statuses t
    order by t.sort_order
    returning id, name
  )
  insert into _seed_status_map (template_id, new_id)
  select t.id, i.id
  from demo_template.statuses t
  join inserted i on i.name = t.name;

  -- Task types
  with inserted as (
    insert into public.task_types (workspace_id, name, icon)
    select v_workspace_id, t.name, t.icon
    from demo_template.task_types t
    order by t.sort_order
    returning id, name
  )
  insert into _seed_type_map (template_id, new_id)
  select t.id, i.id
  from demo_template.task_types t
  join inserted i on i.name = t.name;

  -- Tags
  with inserted as (
    insert into public.tags (workspace_id, name, color)
    select v_workspace_id, t.name, t.color
    from demo_template.tags t
    order by t.sort_order
    returning id, name
  )
  insert into _seed_tag_map (template_id, new_id)
  select t.id, i.id
  from demo_template.tags t
  join inserted i on i.name = t.name;

  -- Projects
  with inserted as (
    insert into public.projects (workspace_id, name, color)
    select v_workspace_id, t.name, t.color
    from demo_template.projects t
    order by t.sort_order
    returning id, name
  )
  insert into _seed_project_map (template_id, new_id)
  select t.id, i.id
  from demo_template.projects t
  join inserted i on i.name = t.name;

  -- Assignees: synthetic teammates only (user_id NULL). The auto-assignee
  -- created by sync_member_assignee for the anon user themselves uses a
  -- different name ("Demo Visitor") and won't collide.
  with inserted as (
    insert into public.assignees (workspace_id, user_id, name)
    select v_workspace_id, null, t.name
    from demo_template.assignees t
    order by t.sort_order
    returning id, name
  )
  insert into _seed_assignee_map (template_id, new_id)
  select t.id, i.id
  from demo_template.assignees t
  join inserted i on i.name = t.name;

  -- Tasks: every FK reference rewritten via the maps. assignee_ids and
  -- tag_ids arrays are remapped element-wise via unnest WITH ORDINALITY
  -- so the original ordering is preserved.
  insert into public.tasks (
    workspace_id, title, project_id, assignee_id, assignee_ids,
    start_date, end_date, status_id, type_id, priority, tag_ids, description
  )
  select
    v_workspace_id,
    t.title,
    pm.new_id,
    case when array_length(t.assignee_ids, 1) > 0
         then (select new_id from _seed_assignee_map where template_id = t.assignee_ids[1])
         else null end,
    coalesce(
      (select array_agg(am.new_id order by ord.idx)
       from unnest(t.assignee_ids) with ordinality as ord(template_id, idx)
       join _seed_assignee_map am on am.template_id = ord.template_id),
      '{}'::uuid[]
    ),
    v_today + t.start_offset_days,
    v_today + t.end_offset_days,
    sm.new_id,
    tm.new_id,
    t.priority,
    coalesce(
      (select array_agg(gm.new_id order by ord.idx)
       from unnest(t.tag_ids) with ordinality as ord(template_id, idx)
       join _seed_tag_map gm on gm.template_id = ord.template_id),
      '{}'::uuid[]
    ),
    t.description
  from demo_template.tasks t
  join _seed_project_map pm on pm.template_id = t.project_id
  join _seed_status_map sm on sm.template_id = t.status_id
  join _seed_type_map tm on tm.template_id = t.type_id
  order by t.sort_order;

  -- Milestones
  insert into public.milestones (workspace_id, project_id, date, title)
  select
    v_workspace_id,
    pm.new_id,
    v_today + m.offset_days,
    m.title
  from demo_template.milestones m
  join _seed_project_map pm on pm.template_id = m.project_id
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
