-- Workspace API: reading the workspace (people, projects, tasks, milestones).
--
-- Until now a workspace token could do one thing, import absences (0156). This
-- adds read-only endpoints, and with them scopes: what a token may do is chosen
-- when it is created and cannot be widened later.
--
--   * workspace_api_tokens.scopes — 'time_off' (list, create/update and delete
--     absences) and/or 'read' (read people, projects, tasks, milestones and
--     absences). Tokens that exist keep 'time_off' only: nothing they were
--     handed out for changes.
--   * create_workspace_api_token gets p_scopes (default: time_off only, so a
--     tab with the previous build keeps working); list_workspace_api_tokens
--     returns the scopes.
--   * api_token_access — the workspace and the scopes of an active token. It
--     replaces api_token_workspace (0156), which stays for a rollback of the
--     Edge Function.
--   * api_get_workspace / api_list_members / api_list_projects /
--     api_list_tasks / api_get_task / api_list_milestones — SECURITY INVOKER,
--     EXECUTE for service_role only, every one bound to p_workspace_id.
--
-- Nothing here writes anything except last_used_at of the token.
-- Idempotent: columns and constraints are guarded, functions are "or replace"
-- (or dropped first where the signature changes).
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.api_list_milestones(uuid, date, date, uuid, date, uuid, integer);
--   DROP FUNCTION IF EXISTS public.api_get_task(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.api_list_tasks(uuid, date, date, uuid, uuid, timestamptz, date, uuid, integer);
--   DROP FUNCTION IF EXISTS public.api_list_projects(uuid, boolean);
--   DROP FUNCTION IF EXISTS public.api_list_members(uuid);
--   DROP FUNCTION IF EXISTS public.api_get_workspace(uuid);
--   DROP FUNCTION IF EXISTS public.api_token_access(text);
--   -- then re-run the create/list functions of 0156 and:
--   ALTER TABLE public.workspace_api_tokens DROP COLUMN IF EXISTS scopes;

-- ────────────────────────── scopes ──────────────────────────

alter table public.workspace_api_tokens
  add column if not exists scopes text[] not null default array['time_off']::text[];

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workspace_api_tokens_scopes_check'
      and conrelid = 'public.workspace_api_tokens'::regclass
  ) then
    alter table public.workspace_api_tokens
      add constraint workspace_api_tokens_scopes_check
      check (cardinality(scopes) between 1 and 2 and scopes <@ array['time_off', 'read']::text[]);
  end if;
end $$;

-- ────────────────────────── admin RPCs ──────────────────────────

-- The signature changes (p_scopes; scopes in the answer), so the 0156 versions
-- go first. PostgREST resolves a call without p_scopes to the default.
drop function if exists public.create_workspace_api_token(uuid, text);
drop function if exists public.create_workspace_api_token(uuid, text, text[]);

create function public.create_workspace_api_token(
  p_workspace_id uuid,
  p_name text,
  p_scopes text[] default array['time_off']::text[]
)
returns table (id uuid, name text, token text, token_prefix text, created_at timestamptz, scopes text[])
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_scopes text[];
  v_token text;
  v_row public.workspace_api_tokens%rowtype;
begin
  if auth.uid() is null or not public.is_workspace_admin(p_workspace_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(v_name) not between 1 and 80 then
    raise exception 'API_TOKEN_NAME_INVALID' using errcode = '22023';
  end if;

  -- Distinct and in a fixed order, so two tokens with the same rights look the same.
  select coalesce(array_agg(distinct s order by s), array[]::text[]) into v_scopes
  from unnest(coalesce(p_scopes, array[]::text[])) as s;
  if cardinality(v_scopes) = 0 or not (v_scopes <@ array['time_off', 'read']::text[]) then
    raise exception 'API_TOKEN_SCOPES_INVALID' using errcode = '22023';
  end if;

  if (select count(*) from public.workspace_api_tokens t
      where t.workspace_id = p_workspace_id and t.revoked_at is null) >= 10 then
    raise exception 'API_TOKEN_LIMIT' using errcode = '54000';
  end if;

  -- Two v4 UUIDs: 244 random bits, hex only, so the token is safe in headers.
  v_token := 'motio_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.workspace_api_tokens (workspace_id, name, token_prefix, token_hash, created_by, scopes)
  values (
    p_workspace_id,
    v_name,
    left(v_token, 14),
    encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
    auth.uid(),
    v_scopes
  )
  returning * into v_row;

  -- The only moment the plain token exists outside the caller's hands.
  return query select v_row.id, v_row.name, v_token, v_row.token_prefix, v_row.created_at, v_row.scopes;
end;
$$;

revoke all on function public.create_workspace_api_token(uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.create_workspace_api_token(uuid, text, text[]) to authenticated;

drop function if exists public.list_workspace_api_tokens(uuid);

create function public.list_workspace_api_tokens(p_workspace_id uuid)
returns table (
  id uuid,
  name text,
  token_prefix text,
  created_at timestamptz,
  last_used_at timestamptz,
  scopes text[]
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.uid() is null or not public.is_workspace_admin(p_workspace_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return query
  select t.id, t.name, t.token_prefix, t.created_at, t.last_used_at, t.scopes
  from public.workspace_api_tokens t
  where t.workspace_id = p_workspace_id and t.revoked_at is null
  order by t.created_at desc;
end;
$$;

revoke all on function public.list_workspace_api_tokens(uuid) from public, anon, authenticated;
grant execute on function public.list_workspace_api_tokens(uuid) to authenticated;

-- ────────────────────────── API functions (service_role) ──────────────────────────

-- The workspace and the scopes of an active token, given the SHA-256 hex of the
-- token; no row for an unknown or revoked one. last_used_at is written at most
-- once a minute to keep the hot path cheap.
create or replace function public.api_token_access(p_token_hash text)
returns table (workspace_id uuid, scopes text[])
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_workspace_id uuid;
  v_scopes text[];
  v_last_used timestamptz;
begin
  select t.id, t.workspace_id, t.scopes, t.last_used_at
    into v_id, v_workspace_id, v_scopes, v_last_used
  from public.workspace_api_tokens t
  where t.token_hash = lower(p_token_hash) and t.revoked_at is null;

  if v_id is null then
    return;
  end if;

  if v_last_used is null or v_last_used < now() - interval '1 minute' then
    update public.workspace_api_tokens set last_used_at = now() where id = v_id;
  end if;

  return query select v_workspace_id, v_scopes;
end;
$$;

revoke all on function public.api_token_access(text) from public, anon, authenticated;
grant execute on function public.api_token_access(text) to service_role;

create or replace function public.api_get_workspace(p_workspace_id uuid)
returns table (id uuid, name text)
language sql
stable
security invoker
set search_path = public
as $$
  select w.id, w.name from public.workspaces w where w.id = p_workspace_id;
$$;

revoke all on function public.api_get_workspace(uuid) from public, anon, authenticated;
grant execute on function public.api_get_workspace(uuid) to service_role;

-- Everyone on the timeline of the workspace: members with an account and people
-- added without one. email and role are those of the account, null without one.
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
  select a.id, a.name, p.email, wm.role::text, g.name, a.user_id is not null, a.is_active, a.deactivated_at
  from public.assignees a
  left join public.profiles p on p.id = a.user_id
  left join public.workspace_members wm on wm.workspace_id = a.workspace_id and wm.user_id = a.user_id
  left join public.member_groups g on g.id = wm.group_id
  where a.workspace_id = p_workspace_id
  order by a.name, a.id
  limit 5000;
$$;

revoke all on function public.api_list_members(uuid) from public, anon, authenticated;
grant execute on function public.api_list_members(uuid) to service_role;

-- Projects of the workspace; p_archived null = all, true/false = only those.
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
  select pr.id, pr.name, pr.code, pr.color, pr.status, pr.archived, pr.customer_id, c.name, pr.created_at
  from public.projects pr
  left join public.customers c on c.id = pr.customer_id
  where pr.workspace_id = p_workspace_id
    and (p_archived is null or pr.archived = p_archived)
  order by pr.name, pr.id
  limit 5000;
$$;

revoke all on function public.api_list_projects(uuid, boolean) from public, anon, authenticated;
grant execute on function public.api_list_projects(uuid, boolean) to service_role;

-- Tasks of the workspace, ordered by (start_date, id), one page at a time:
-- p_after_date / p_after_id are the last row of the previous page. Every filter
-- is optional; p_from / p_to select tasks that overlap the range. The caller
-- asks for one row more than a page to learn whether another page follows.
-- The description is left out here (it can be long): api_get_task has it.
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
    t.status_id, s.name, s.is_final, s.is_cancelled,
    ty.name, t.priority,
    coalesce((
      select array_agg(g.name order by g.name)
      from public.tags g
      where g.workspace_id = t.workspace_id and g.id = any(t.tag_ids)
    ), array[]::text[]),
    t.repeat_id, t.created_at, t.updated_at
  from public.tasks t
  join public.statuses s on s.id = t.status_id
  join public.task_types ty on ty.id = t.type_id
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

-- One task with its description and checklist; null when the workspace has no
-- such task.
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
    'is_done', s.is_final,
    'is_cancelled', s.is_cancelled,
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
      where st.task_id = t.id
    ), '[]'::jsonb)
  )
  from public.tasks t
  join public.statuses s on s.id = t.status_id
  join public.task_types ty on ty.id = t.type_id
  where t.workspace_id = p_workspace_id and t.id = p_task_id;
$$;

revoke all on function public.api_get_task(uuid, uuid) from public, anon, authenticated;
grant execute on function public.api_get_task(uuid, uuid) to service_role;

-- Milestones of the workspace, ordered by (date, id), paged like the tasks.
-- status is what someone set by hand (done / current / upcoming) or null.
create or replace function public.api_list_milestones(
  p_workspace_id uuid,
  p_from date,
  p_to date,
  p_project_id uuid,
  p_after_date date,
  p_after_id uuid,
  p_limit integer
)
returns table (
  id uuid,
  project_id uuid,
  date date,
  title text,
  note text,
  status text,
  include_in_workload boolean,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select m.id, m.project_id, m.date, m.title, m.note, m.status_override, m.include_in_workload, m.updated_at
  from public.milestones m
  where m.workspace_id = p_workspace_id
    and (p_from is null or m.date >= p_from)
    and (p_to is null or m.date <= p_to)
    and (p_project_id is null or m.project_id = p_project_id)
    and (p_after_date is null or (m.date, m.id) > (p_after_date, p_after_id))
  order by m.date, m.id
  limit least(greatest(coalesce(p_limit, 200), 1), 501);
$$;

revoke all on function public.api_list_milestones(uuid, date, date, uuid, date, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.api_list_milestones(uuid, date, date, uuid, date, uuid, integer)
  to service_role;
