-- Timeline search returns parent tasks whose own title or any subtask title
-- matches, including tasks outside the loaded date window. One parent occupies
-- one result slot even when hundreds of its subtasks match.
create or replace function public.search_workspace_tasks(
  p_workspace_id uuid,
  p_query text
)
returns table (
  id uuid,
  title text,
  project_id uuid,
  assignee_id uuid,
  assignee_ids uuid[],
  start_date date,
  end_date date,
  status_id uuid,
  type_id uuid,
  priority text,
  tag_ids uuid[],
  repeat_id uuid,
  updated_at timestamptz,
  matched_subtask_title text
)
language sql
stable
security invoker
set search_path = public
as $$
  with search_query as (
    -- Match normalizeSearchQuery: trim/collapse JavaScript whitespace, then
    -- lowercase and fold ё into е. Titles themselves retain their spacing.
    select replace(lower(btrim(regexp_replace(
      coalesce(p_query, ''),
      U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+',
      ' ', 'g'
    ))), 'ё', 'е') as needle
  )
  select
    t.id, t.title, t.project_id, t.assignee_id, t.assignee_ids,
    t.start_date, t.end_date, t.status_id, t.type_id, t.priority,
    t.tag_ids, t.repeat_id, t.updated_at, matched.title
  from public.tasks t
  cross join search_query q
  left join lateral (
    select s.title
    from public.task_subtasks s
    where s.task_id = t.id
      and s.workspace_id = t.workspace_id
      and strpos(replace(lower(s.title), 'ё', 'е'), q.needle) > 0
    order by s.position, s.id
    limit 1
  ) matched on true
  where t.workspace_id = p_workspace_id
    and char_length(q.needle) >= 2
    and (
      strpos(replace(lower(t.title), 'ё', 'е'), q.needle) > 0
      or matched.title is not null
    )
  order by t.start_date, t.id
  limit 200;
$$;

revoke all on function public.search_workspace_tasks(uuid, text) from public, anon;
grant execute on function public.search_workspace_tasks(uuid, text) to authenticated, service_role;
