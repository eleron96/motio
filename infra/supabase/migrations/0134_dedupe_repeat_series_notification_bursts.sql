-- One edit of a repeat series produced one notification PER OCCURRENCE.
--
-- Observed on production 2026-07-29: editing a weekly series (52 occurrences,
-- "ends: never" → a one-year horizon) fired rebuild_repeat_series, whose first
-- statement repositions every row of the series in a single UPDATE. The
-- row-level trigger tasks_notify_updated ran 52 times and wrote 52
-- 'task_updated' rows for the same assignee in the same transaction — all 52
-- were delivered as pushes. The same shape shows up for 'task_assigned'
-- whenever an assignee is added to a whole series at once (bursts of 53 and 100
-- rows are in the history), because the dedupe added in 0050 only covers the
-- INSERT path (new occurrences), not bulk UPDATEs of an existing series.
--
-- Fix: for tasks that belong to a series, keep at most ONE notification per
-- (recipient, type, series) per transaction. now() is the transaction start
-- time and user_notifications.created_at defaults to now(), so rows written
-- earlier in the same statement/transaction are exactly those with
-- created_at = now() — the same trick needs no new column and rides the
-- existing user_notifications_recipient_created_idx index.
--
-- Deliberately NOT changed: a single occurrence edited on its own still
-- notifies (a series is only collapsed when one action touches several of its
-- occurrences), and non-recurring tasks keep one notification per task.
--
-- Behaviour only: the bursts already sitting in people's bells are left alone
-- (deliberate — that history stays as it was recorded).
--
-- Rollback: re-apply the 0050 and 0121 function bodies (this file is their only
-- later redefinition).

-- 1) Assignment notifications: add the per-transaction series guard.
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

    -- Bulk assignee change across a whole series: notify once, not per occurrence.
    if new.repeat_id is not null and exists(
      select 1
      from public.user_notifications n
      join public.tasks series_task on series_task.id = n.task_id
      where n.recipient_user_id = recipient_id
        and n.type = 'task_assigned'
        and n.workspace_id = new.workspace_id
        and series_task.repeat_id = new.repeat_id
        and n.created_at = now()
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

-- 2) Update notifications: same guard (this is the path that produced the 52).
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

    -- Series rebuild moves every occurrence in one statement: notify once.
    if new.repeat_id is not null and exists(
      select 1
      from public.user_notifications n
      join public.tasks series_task on series_task.id = n.task_id
      where n.recipient_user_id = recipient_id
        and n.type = 'task_updated'
        and n.workspace_id = new.workspace_id
        and series_task.repeat_id = new.repeat_id
        and n.created_at = now()
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
