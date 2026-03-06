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
