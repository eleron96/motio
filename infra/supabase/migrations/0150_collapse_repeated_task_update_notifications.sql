-- Observed on production 2026-09-21: one person adjusted a single, non-recurring
-- task four times within 30 seconds (dragging its bar on the timeline until it
-- sat right). Every drop is its own UPDATE, so the assignee got four identical
-- 'task_updated' notifications and four pushes. 0134/0146 only collapse bursts
-- across a repeat series; repeated edits of the SAME task were never covered.
--
-- Fix: if the recipient still has an unread 'task_updated' notification for
-- this very task, from the same actor, written less than 2 minutes ago, do not
-- add another one. The existing row gets the fresh title/start-date snapshot so
-- it describes where the task ended up. created_at is left alone on purpose:
-- the window is measured from the first edit, so endless fiddling cannot hold
-- the notification back forever, and no second push is sent.
--
-- Deliberately unchanged: a notification the recipient already read (or
-- deleted) does not swallow later edits; a different actor notifies
-- separately; different tasks still notify per task; the 60-second series
-- guard from 0146 stays as it is. notify_task_assignment is not touched.
--
-- Rollback: re-apply the notify_task_updated definition from 0146.

create or replace function public.notify_task_updated()
returns trigger as $$
declare
  actor_id uuid := auth.uid();
  common_assignees uuid[];
  assignee_id uuid;
  recipient_id uuid;
  pending_id uuid;
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

    -- Nudging one task until it sits right is one piece of news: while the
    -- recipient has not opened the earlier notification, keep it and refresh
    -- what it shows instead of stacking another one (and another push).
    select n.id
    into pending_id
    from public.user_notifications n
    where n.recipient_user_id = recipient_id
      and n.type = 'task_updated'
      and n.task_id = new.id
      and n.actor_user_id is not distinct from actor_id
      and n.read_at is null
      and n.deleted_at is null
      and n.created_at > now() - interval '2 minutes'
    order by n.created_at desc
    limit 1;

    if pending_id is not null then
      update public.user_notifications
      set task_title_snapshot = coalesce(new.title, 'Untitled task'),
          task_start_date_snapshot = new.start_date
      where id = pending_id;
      continue;
    end if;

    -- Moving or rebuilding a series touches every occurrence, whether in one
    -- statement or one request per occurrence: notify once.
    if new.repeat_id is not null and exists(
      select 1
      from public.user_notifications n
      join public.tasks series_task on series_task.id = n.task_id
      where n.recipient_user_id = recipient_id
        and n.type = 'task_updated'
        and n.workspace_id = new.workspace_id
        and series_task.repeat_id = new.repeat_id
        and n.created_at > now() - interval '60 seconds'
    ) then
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
