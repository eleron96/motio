-- 0134 collapses a series-wide burst into a single notification, but only when
-- the whole burst happens inside ONE transaction: its guard compares
-- user_notifications.created_at with now(), and now() is the transaction start
-- time.
--
-- Observed on production 2026-09-04: dragging a repeat series with scope
-- "this and following" does not touch the series in one statement. The client
-- sends one UPDATE per occurrence in a loop (plannerStore.taskActions.ts,
-- moveTask; the undo of that move replays the rows one by one as well), so
-- every occurrence commits in its own transaction with its own now(). The
-- guard never matched: one drag of a 51-occurrence series wrote 74
-- 'task_updated' rows — and 74 pushes — for a single assignee inside two
-- minutes.
--
-- Fix: keep the rule ("at most one notification per recipient, per type, per
-- series") but decide "same action" by a short time window instead of by
-- transaction identity. now() still works as the clock here: for the bulk
-- paths it is the shared transaction start (0134's behaviour is preserved
-- exactly), and for a row-by-row loop it advances with each transaction while
-- the earlier notification stays behind it — inside the window either way.
--
-- Window: 60 seconds. A drag of a long series takes a few hundred milliseconds
-- per occurrence, so a minute covers even a slow series with a slow network,
-- while a person editing occurrences deliberately, one at a time, is well past
-- it.
--
-- Deliberately unchanged: non-recurring tasks still notify per task, a single
-- occurrence edited on its own still notifies, and the INSERT-path dedupe for
-- freshly created occurrences (0050) stays as it is.
--
-- Accepted trade-off: two different occurrences of the same series changed by
-- the same actor within the same minute now produce one notification instead of
-- two. That is the same collapse 0134 already applied inside a transaction,
-- widened in time.
--
-- Rollback: re-apply 0134 (this file is its only later redefinition).

-- 1) Assignment notifications.
create or replace function public.notify_task_assignment()
returns trigger as $$
declare
  actor_id uuid := auth.uid();
  actor_profile_exists boolean := false;
  next_assignees uuid[] := coalesce(new.assignee_ids, '{}'::uuid[]);
  previous_assignees uuid[] := '{}'::uuid[];
  assignee_id uuid;
  recipient_id uuid;
begin
  if actor_id is not null then
    select exists(
      select 1
      from public.profiles
      where id = actor_id
    )
    into actor_profile_exists;

    if not actor_profile_exists then
      actor_id := null;
    end if;
  end if;

  if tg_op = 'UPDATE' then
    previous_assignees := coalesce(old.assignee_ids, '{}'::uuid[]);
  end if;

  if new.assignee_id is not null and not (new.assignee_id = any(next_assignees)) then
    next_assignees := array_prepend(new.assignee_id, next_assignees);
  end if;

  if tg_op = 'UPDATE' and old.assignee_id is not null and not (old.assignee_id = any(previous_assignees)) then
    previous_assignees := array_prepend(old.assignee_id, previous_assignees);
  end if;

  -- Repeat series can insert multiple rows in one action.
  -- If a sibling already exists, we keep notifications only on the first task in the series.
  if tg_op = 'INSERT' and new.repeat_id is not null then
    if exists(
      select 1
      from public.tasks series_task
      where series_task.workspace_id = new.workspace_id
        and series_task.repeat_id = new.repeat_id
        and series_task.id <> new.id
    ) then
      return new;
    end if;
  end if;

  for assignee_id in
    select distinct id
    from unnest(next_assignees) as id
    where id is not null
      and not (id = any(previous_assignees))
  loop
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

    if not exists(
      select 1
      from public.profiles
      where id = recipient_id
    ) then
      continue;
    end if;

    -- One assignee change across a whole series: notify once, however many
    -- statements or transactions the client spends on it.
    if new.repeat_id is not null and exists(
      select 1
      from public.user_notifications n
      join public.tasks series_task on series_task.id = n.task_id
      where n.recipient_user_id = recipient_id
        and n.type = 'task_assigned'
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
      'task_assigned',
      new.id,
      coalesce(new.title, 'Untitled task'),
      new.start_date
    );
  end loop;

  return new;
end;
$$ language plpgsql security definer set search_path = public set row_security = off;

-- 2) Update notifications: the path that produced the 74.
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
