-- Daily task load for the workload heatmap board.
--
-- Returns one row per day in the window with the number of tasks that overlap
-- that day (start_date <= day <= end_date). Recurring tasks are materialized as
-- individual rows, so this count already includes routines; done tasks on future
-- dates are counted too, matching the "count everything" requirement.
--
-- Deliberately lean: no assignee/project/status breakdown. The headcount
-- normalization, milestone contribution and colour thresholds are computed on the
-- client so they can be tuned without a migration. count(distinct t.id) keeps a
-- task counted once per day regardless of how many assignees it has.
--
-- Security mirrors the dashboard_* RPCs: SECURITY DEFINER with row_security off and
-- an explicit is_workspace_member guard, so an unauthenticated or non-member caller
-- gets nothing. The overlap join is served by tasks_workspace_date_range_idx
-- (workspace_id, end_date, start_date) — a ~6 month window runs in a few ms.

create or replace function public.workspace_workload_heatmap(
  p_workspace_id uuid,
  p_start_date date,
  p_end_date date
)
returns table (
  bucket_date date,
  task_count bigint
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
    count(distinct t.id)::bigint as task_count
  from dates d
  left join public.tasks t
    on t.workspace_id = p_workspace_id
    and t.start_date <= d.bucket_date
    and t.end_date >= d.bucket_date
  group by d.bucket_date
  order by d.bucket_date;
end;
$$;

grant execute on function public.workspace_workload_heatmap(uuid, date, date) to authenticated;

alter function public.workspace_workload_heatmap(uuid, date, date) set jit = off;
