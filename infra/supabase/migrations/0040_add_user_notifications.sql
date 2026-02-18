create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  type text not null,
  task_id uuid references public.tasks(id) on delete set null,
  task_title_snapshot text not null,
  task_start_date_snapshot date,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  deleted_at timestamptz,
  constraint user_notifications_type_check check (type in ('task_assigned'))
);

create index if not exists user_notifications_recipient_created_idx
  on public.user_notifications (recipient_user_id, created_at desc);

create index if not exists user_notifications_workspace_idx
  on public.user_notifications (workspace_id);

create index if not exists user_notifications_unread_idx
  on public.user_notifications (recipient_user_id, created_at desc)
  where read_at is null and deleted_at is null;

create index if not exists user_notifications_active_idx
  on public.user_notifications (recipient_user_id, created_at desc)
  where deleted_at is null;

alter table public.user_notifications enable row level security;

drop policy if exists "users can read own notifications" on public.user_notifications;
create policy "users can read own notifications" on public.user_notifications
  for select using (
    recipient_user_id = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "users can update own notifications" on public.user_notifications;
create policy "users can update own notifications" on public.user_notifications
  for update using (
    recipient_user_id = auth.uid()
    and public.is_workspace_member(workspace_id)
  )
  with check (
    recipient_user_id = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

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

drop trigger if exists tasks_notify_assignment on public.tasks;
create trigger tasks_notify_assignment
  after insert or update of assignee_id, assignee_ids on public.tasks
  for each row execute function public.notify_task_assignment();
