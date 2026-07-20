-- Phase 3 of browser push: notify a task's assignees when the task itself
-- changes in a meaningful way (dates or status). Assignee changes are already
-- covered by notify_task_assignment, so this deliberately ignores them and only
-- notifies people who were on the task BOTH before and after the update (a
-- newly-added assignee gets a 'task_assigned' notification for the same edit).
-- Widen the type check here to also allow 'deadline_approaching' (used by 0122).

alter table public.user_notifications
  drop constraint if exists user_notifications_type_check;

alter table public.user_notifications
  add constraint user_notifications_type_check
  check (type in (
    'task_assigned', 'comment_mention', 'export_ready', 'export_failed',
    'task_updated', 'deadline_approaching'
  ));

create or replace function public.notify_task_updated()
returns trigger as $$
declare
  actor_id uuid := auth.uid();
  common_assignees uuid[];
  assignee_id uuid;
  recipient_id uuid;
begin
  -- Only meaningful changes count: start/end date or status. If none of them
  -- actually changed (the columns were merely in the UPDATE's SET list), stop.
  if new.start_date is not distinct from old.start_date
     and new.end_date is not distinct from old.end_date
     and new.status_id is not distinct from old.status_id then
    return new;
  end if;

  if actor_id is not null and not exists (
    select 1 from public.profiles where id = actor_id
  ) then
    actor_id := null;
  end if;

  -- Assignees present both before and after this update.
  common_assignees := (
    select coalesce(array_agg(x), '{}'::uuid[])
    from (
      select unnest(coalesce(new.assignee_ids, '{}'::uuid[]))
      intersect
      select unnest(coalesce(old.assignee_ids, '{}'::uuid[]))
    ) as t(x)
  );

  for assignee_id in select distinct unnest(common_assignees) loop
    if assignee_id is null then
      continue;
    end if;

    select assignees.user_id
    into recipient_id
    from public.assignees
    where assignees.id = assignee_id
      and assignees.workspace_id = new.workspace_id;

    if recipient_id is null then
      continue;
    end if;

    if actor_id is not null and recipient_id = actor_id then
      continue;
    end if;

    if not exists (select 1 from public.profiles where id = recipient_id) then
      continue;
    end if;

    insert into public.user_notifications (
      workspace_id,
      recipient_user_id,
      actor_user_id,
      type,
      task_id,
      task_title_snapshot,
      task_start_date_snapshot
    )
    values (
      new.workspace_id,
      recipient_id,
      actor_id,
      'task_updated',
      new.id,
      coalesce(new.title, 'Untitled task'),
      new.start_date
    );
  end loop;

  return new;
end;
$$ language plpgsql security definer set search_path = public set row_security = off;

drop trigger if exists tasks_notify_updated on public.tasks;
create trigger tasks_notify_updated
  after update of start_date, end_date, status_id on public.tasks
  for each row execute function public.notify_task_updated();
