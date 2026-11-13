-- Workspace API, reading: three corrections after testing 0187 on the stand.
--
--   1. An account's email goes out only while that account is a member of the
--      workspace. Someone who left stays on the timeline (their tasks keep a
--      row), and api_list_members / api_list_time_off still joined their
--      profile and returned the address. Now email is null for them, like for
--      a person who never had an account.
--   2. Every lookup is bound to the workspace, not just the row it starts
--      from: a task's status and type, a project's customer. The foreign keys
--      are on the id alone, so a row that ever pointed at another workspace's
--      status, type or customer would have had its name returned. With the
--      binding such a row reads as null.
--   3. is_done means "finished", not "in a final status": a cancelled task is
--      is_cancelled only. Before, it was both, and a client counting finished
--      work by is_done counted cancelled tasks too.
--
-- Signatures and grants do not change; every function is "or replace".
-- Idempotent.
--
-- Rollback: re-run the same functions from 0156 (api_list_time_off) and 0187.

create or replace function public.api_list_members(p_workspace_id uuid)
returns table (
  id uuid,
  name text,
  email text,
  role text,
  "group" text,
  has_account boolean,
  is_active boolean,
  deactivated_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    a.id,
    a.name,
    case when wm.user_id is not null then p.email end,
    wm.role::text,
    g.name,
    a.user_id is not null,
    a.is_active,
    a.deactivated_at
  from public.assignees a
  left join public.workspace_members wm on wm.workspace_id = a.workspace_id and wm.user_id = a.user_id
  left join public.profiles p on p.id = wm.user_id
  left join public.member_groups g on g.id = wm.group_id and g.workspace_id = a.workspace_id
  where a.workspace_id = p_workspace_id
  order by a.name, a.id
  limit 5000;
$$;

revoke all on function public.api_list_members(uuid) from public, anon, authenticated;
grant execute on function public.api_list_members(uuid) to service_role;

create or replace function public.api_list_time_off(p_workspace_id uuid, p_from date, p_to date)
returns table (
  id uuid,
  external_id text,
  email text,
  person text,
  start_date date,
  end_date date,
  note text,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select o.id, o.external_id, p.email, a.name, o.start_date, o.end_date, o.note, o.updated_at
  from public.time_off o
  join public.assignees a on a.id = o.assignee_id and a.workspace_id = o.workspace_id
  left join public.workspace_members wm on wm.workspace_id = o.workspace_id and wm.user_id = a.user_id
  left join public.profiles p on p.id = wm.user_id
  where o.workspace_id = p_workspace_id
    and (p_from is null or o.end_date >= p_from)
    and (p_to is null or o.start_date <= p_to)
  order by o.start_date, o.end_date, o.id
  limit 5000;
$$;

revoke all on function public.api_list_time_off(uuid, date, date) from public, anon, authenticated;
grant execute on function public.api_list_time_off(uuid, date, date) to service_role;

create or replace function public.api_list_projects(p_workspace_id uuid, p_archived boolean)
returns table (
  id uuid,
  name text,
  code text,
  color text,
  status text,
  archived boolean,
  customer_id uuid,
  customer text,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select pr.id, pr.name, pr.code, pr.color, pr.status, pr.archived, c.id, c.name, pr.created_at
  from public.projects pr
  left join public.customers c on c.id = pr.customer_id and c.workspace_id = pr.workspace_id
  where pr.workspace_id = p_workspace_id
    and (p_archived is null or pr.archived = p_archived)
  order by pr.name, pr.id
  limit 5000;
$$;

revoke all on function public.api_list_projects(uuid, boolean) from public, anon, authenticated;
grant execute on function public.api_list_projects(uuid, boolean) to service_role;

create or replace function public.api_list_tasks(
  p_workspace_id uuid,
  p_from date,
  p_to date,
  p_project_id uuid,
  p_assignee_id uuid,
  p_updated_since timestamptz,
  p_after_date date,
  p_after_id uuid,
  p_limit integer
)
returns table (
  id uuid,
  title text,
  project_id uuid,
  assignee_ids uuid[],
  start_date date,
  end_date date,
  status_id uuid,
  status text,
  is_done boolean,
  is_cancelled boolean,
  type text,
  priority text,
  tags text[],
  repeat_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    t.id, t.title, t.project_id, t.assignee_ids, t.start_date, t.end_date,
    t.status_id, s.name,
    coalesce(s.is_final and not s.is_cancelled, false),
    coalesce(s.is_cancelled, false),
    ty.name, t.priority,
    coalesce((
      select array_agg(g.name order by g.name)
      from public.tags g
      where g.workspace_id = t.workspace_id and g.id = any(t.tag_ids)
    ), array[]::text[]),
    t.repeat_id, t.created_at, t.updated_at
  from public.tasks t
  left join public.statuses s on s.id = t.status_id and s.workspace_id = t.workspace_id
  left join public.task_types ty on ty.id = t.type_id and ty.workspace_id = t.workspace_id
  where t.workspace_id = p_workspace_id
    and (p_from is null or t.end_date >= p_from)
    and (p_to is null or t.start_date <= p_to)
    and (p_project_id is null or t.project_id = p_project_id)
    and (p_assignee_id is null or p_assignee_id = any(t.assignee_ids))
    and (p_updated_since is null or t.updated_at >= p_updated_since)
    and (p_after_date is null or (t.start_date, t.id) > (p_after_date, p_after_id))
  order by t.start_date, t.id
  limit least(greatest(coalesce(p_limit, 200), 1), 501);
$$;

revoke all on function public.api_list_tasks(uuid, date, date, uuid, uuid, timestamptz, date, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.api_list_tasks(uuid, date, date, uuid, uuid, timestamptz, date, uuid, integer)
  to service_role;

create or replace function public.api_get_task(p_workspace_id uuid, p_task_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'id', t.id,
    'title', t.title,
    'project_id', t.project_id,
    'assignee_ids', to_jsonb(t.assignee_ids),
    'start_date', t.start_date,
    'end_date', t.end_date,
    'status_id', t.status_id,
    'status', s.name,
    'is_done', coalesce(s.is_final and not s.is_cancelled, false),
    'is_cancelled', coalesce(s.is_cancelled, false),
    'type', ty.name,
    'priority', t.priority,
    'tags', coalesce((
      select jsonb_agg(g.name order by g.name)
      from public.tags g
      where g.workspace_id = t.workspace_id and g.id = any(t.tag_ids)
    ), '[]'::jsonb),
    'repeat_id', t.repeat_id,
    'created_at', t.created_at,
    'updated_at', t.updated_at,
    'description', t.description,
    'subtasks', coalesce((
      select jsonb_agg(jsonb_build_object('title', st.title, 'is_done', st.is_done) order by st.position, st.id)
      from public.task_subtasks st
      where st.task_id = t.id and st.workspace_id = t.workspace_id
    ), '[]'::jsonb)
  )
  from public.tasks t
  left join public.statuses s on s.id = t.status_id and s.workspace_id = t.workspace_id
  left join public.task_types ty on ty.id = t.type_id and ty.workspace_id = t.workspace_id
  where t.workspace_id = p_workspace_id and t.id = p_task_id;
$$;

revoke all on function public.api_get_task(uuid, uuid) from public, anon, authenticated;
grant execute on function public.api_get_task(uuid, uuid) to service_role;
