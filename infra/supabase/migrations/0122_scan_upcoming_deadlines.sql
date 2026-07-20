-- Phase 4 of browser push: a daily scanner creates a 'deadline_approaching'
-- notification for every assignee of a task whose end_date is today or tomorrow,
-- once per (assignee, task). The ticker then delivers it as a push. Completed
-- tasks (final status) and non-account assignees are skipped. The NOT EXISTS
-- guard makes the daily scan idempotent — a task is reminded about only once.

create or replace function public.scan_upcoming_deadlines()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  insert into public.user_notifications (
    workspace_id,
    recipient_user_id,
    actor_user_id,
    type,
    task_id,
    task_title_snapshot,
    task_start_date_snapshot
  )
  select distinct on (a.user_id, t.id)
    t.workspace_id,
    a.user_id,
    null::uuid,
    'deadline_approaching',
    t.id,
    coalesce(t.title, 'Untitled task'),
    t.start_date
  from public.tasks t
  left join public.statuses s on s.id = t.status_id
  cross join lateral unnest(coalesce(t.assignee_ids, '{}'::uuid[])) as ta(assignee_id)
  join public.assignees a
    on a.id = ta.assignee_id
   and a.workspace_id = t.workspace_id
  where t.end_date >= current_date
    and t.end_date <= current_date + 1
    and coalesce(s.is_final, false) = false
    and a.user_id is not null
    and exists (select 1 from public.profiles p where p.id = a.user_id)
    and not exists (
      select 1
      from public.user_notifications n
      where n.recipient_user_id = a.user_id
        and n.task_id = t.id
        and n.type = 'deadline_approaching'
    );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke execute on function public.scan_upcoming_deadlines() from public;
revoke execute on function public.scan_upcoming_deadlines() from anon;
revoke execute on function public.scan_upcoming_deadlines() from authenticated;
grant execute on function public.scan_upcoming_deadlines() to service_role;
