drop function if exists public.dashboard_task_counts(uuid, date, date);

create function public.dashboard_task_counts(
  p_workspace_id uuid,
  p_start_date date,
  p_end_date date
)
returns table (
  assignee_id uuid,
  assignee_name text,
  project_id uuid,
  project_name text,
  task_type_id uuid,
  task_type_name text,
  status_id uuid,
  status_name text,
  status_is_final boolean,
  total bigint
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'not allowed';
  end if;

  return query
  select
    assignee_link.assignee_id as assignee_id,
    a.name as assignee_name,
    p.id as project_id,
    p.name as project_name,
    tt.id as task_type_id,
    tt.name as task_type_name,
    s.id as status_id,
    s.name as status_name,
    s.is_final as status_is_final,
    count(t.id)::bigint as total
  from public.tasks t
  join public.statuses s on s.id = t.status_id
  left join public.projects p on p.id = t.project_id
  left join public.task_types tt on tt.id = t.type_id
  left join lateral (
    select unnest(
      case
        when t.assignee_ids is not null and array_length(t.assignee_ids, 1) > 0 then t.assignee_ids
        when t.assignee_id is not null then array[t.assignee_id]
        else array[null::uuid]
      end
    ) as assignee_id
  ) assignee_link on true
  left join public.assignees a on a.id = assignee_link.assignee_id
  where t.workspace_id = p_workspace_id
    and t.start_date <= p_end_date
    and t.end_date >= p_start_date
  group by assignee_link.assignee_id, a.name, p.id, p.name, tt.id, tt.name, s.id, s.name, s.is_final;
end;
$$;

grant execute on function public.dashboard_task_counts(uuid, date, date) to authenticated;

drop function if exists public.dashboard_task_counts_base(uuid, date, date);

create function public.dashboard_task_counts_base(
  p_workspace_id uuid,
  p_start_date date,
  p_end_date date
)
returns table (
  assignee_id uuid,
  assignee_name text,
  project_id uuid,
  project_name text,
  task_type_id uuid,
  task_type_name text,
  status_id uuid,
  status_name text,
  status_is_final boolean,
  total bigint
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'not allowed';
  end if;

  return query
  select
    null::uuid as assignee_id,
    null::text as assignee_name,
    p.id as project_id,
    p.name as project_name,
    tt.id as task_type_id,
    tt.name as task_type_name,
    s.id as status_id,
    s.name as status_name,
    s.is_final as status_is_final,
    count(distinct t.id)::bigint as total
  from public.tasks t
  join public.statuses s on s.id = t.status_id
  left join public.projects p on p.id = t.project_id
  left join public.task_types tt on tt.id = t.type_id
  where t.workspace_id = p_workspace_id
    and t.start_date <= p_end_date
    and t.end_date >= p_start_date
  group by p.id, p.name, tt.id, tt.name, s.id, s.name, s.is_final;
end;
$$;

grant execute on function public.dashboard_task_counts_base(uuid, date, date) to authenticated;

drop function if exists public.dashboard_task_time_series(uuid, date, date);

create function public.dashboard_task_time_series(
  p_workspace_id uuid,
  p_start_date date,
  p_end_date date
)
returns table (
  bucket_date date,
  assignee_id uuid,
  assignee_name text,
  project_id uuid,
  project_name text,
  task_type_id uuid,
  task_type_name text,
  status_id uuid,
  status_name text,
  status_is_final boolean,
  total bigint
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'not allowed';
  end if;

  return query
  with dates as (
    select generate_series(p_start_date, p_end_date, interval '1 day')::date as bucket_date
  )
  select
    d.bucket_date,
    assignee_link.assignee_id as assignee_id,
    a.name as assignee_name,
    p.id as project_id,
    p.name as project_name,
    tt.id as task_type_id,
    tt.name as task_type_name,
    s.id as status_id,
    s.name as status_name,
    s.is_final as status_is_final,
    count(t.id)::bigint as total
  from dates d
  join public.tasks t on t.workspace_id = p_workspace_id
    and t.start_date <= d.bucket_date
    and t.end_date >= d.bucket_date
  join public.statuses s on s.id = t.status_id
  left join public.projects p on p.id = t.project_id
  left join public.task_types tt on tt.id = t.type_id
  left join lateral (
    select unnest(
      case
        when t.assignee_ids is not null and array_length(t.assignee_ids, 1) > 0 then t.assignee_ids
        when t.assignee_id is not null then array[t.assignee_id]
        else array[null::uuid]
      end
    ) as assignee_id
  ) assignee_link on true
  left join public.assignees a on a.id = assignee_link.assignee_id
  group by d.bucket_date, assignee_link.assignee_id, a.name, p.id, p.name, tt.id, tt.name, s.id, s.name, s.is_final;
end;
$$;

grant execute on function public.dashboard_task_time_series(uuid, date, date) to authenticated;

drop function if exists public.dashboard_task_time_series_base(uuid, date, date);

create function public.dashboard_task_time_series_base(
  p_workspace_id uuid,
  p_start_date date,
  p_end_date date
)
returns table (
  bucket_date date,
  assignee_id uuid,
  assignee_name text,
  project_id uuid,
  project_name text,
  task_type_id uuid,
  task_type_name text,
  status_id uuid,
  status_name text,
  status_is_final boolean,
  total bigint
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'not allowed';
  end if;

  return query
  with dates as (
    select generate_series(p_start_date, p_end_date, interval '1 day')::date as bucket_date
  )
  select
    d.bucket_date,
    null::uuid as assignee_id,
    null::text as assignee_name,
    p.id as project_id,
    p.name as project_name,
    tt.id as task_type_id,
    tt.name as task_type_name,
    s.id as status_id,
    s.name as status_name,
    s.is_final as status_is_final,
    count(distinct t.id)::bigint as total
  from dates d
  join public.tasks t on t.workspace_id = p_workspace_id
    and t.start_date <= d.bucket_date
    and t.end_date >= d.bucket_date
  join public.statuses s on s.id = t.status_id
  left join public.projects p on p.id = t.project_id
  left join public.task_types tt on tt.id = t.type_id
  group by d.bucket_date, p.id, p.name, tt.id, tt.name, s.id, s.name, s.is_final;
end;
$$;

grant execute on function public.dashboard_task_time_series_base(uuid, date, date) to authenticated;

alter function public.dashboard_task_counts(uuid, date, date) set jit = off;
alter function public.dashboard_task_counts_base(uuid, date, date) set jit = off;
alter function public.dashboard_task_time_series(uuid, date, date) set jit = off;
alter function public.dashboard_task_time_series_base(uuid, date, date) set jit = off;
