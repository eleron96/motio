-- Comment counts for a date window, so they arrive with the tasks.
--
-- task_comment_counts_batch takes task ids, so the planner could only ask for
-- the counts after the tasks had arrived: the timeline drew its bars, and the
-- comment badges popped in one round-trip later. This one takes the same
-- window as the task query (a task belongs to it when the date ranges
-- overlap), so the planner sends both requests at once.
--
-- SECURITY INVOKER: the tasks and task_comments read policies decide what the
-- caller sees, exactly as for the task query itself. Tasks without comments
-- are not returned; the client treats a missing task as zero.

create or replace function public.task_comment_counts_in_window(
  p_workspace_id uuid,
  p_start_date date,
  p_end_date date
)
returns table(task_id uuid, comment_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select tc.task_id, count(*)::bigint
  from public.tasks t
  join public.task_comments tc
    on tc.workspace_id = t.workspace_id
   and tc.task_id = t.id
   and tc.deleted_at is null
  where t.workspace_id = p_workspace_id
    and t.end_date >= p_start_date
    and t.start_date <= p_end_date
  group by tc.task_id;
$$;

revoke all on function public.task_comment_counts_in_window(uuid, date, date) from public, anon;
grant execute on function public.task_comment_counts_in_window(uuid, date, date) to authenticated, service_role;
