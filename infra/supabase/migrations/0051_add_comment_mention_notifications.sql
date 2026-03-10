-- Extend user_notifications to support comment_mention type.
-- Adds comment_id and comment_preview columns and a trigger that fires
-- when a new comment is inserted with non-empty mentioned_user_ids.

-- 1. Drop the old type constraint and re-create it to include the new type.
alter table public.user_notifications
  drop constraint if exists user_notifications_type_check;

alter table public.user_notifications
  add constraint user_notifications_type_check
  check (type in ('task_assigned', 'comment_mention'));

-- 2. Add columns for the comment reference and a plain-text preview.
alter table public.user_notifications
  add column if not exists comment_id uuid references public.task_comments(id) on delete set null,
  add column if not exists comment_preview text;

-- 3. Trigger function: fires after INSERT on task_comments.
--    Creates one notification per unique mentioned user (deduplication within a comment).
--    Does NOT fire on UPDATE (edits don't produce new notifications).
create or replace function public.notify_comment_mention()
returns trigger as $$
declare
  actor_id    uuid := auth.uid();
  mentioned_id uuid;
  preview      text;
  task_title   text;
begin
  -- Only handle fresh inserts of non-deleted comments with at least one mention
  if tg_op != 'INSERT' then
    return new;
  end if;

  if new.deleted_at is not null then
    return new;
  end if;

  if array_length(new.mentioned_user_ids, 1) is null then
    return new;
  end if;

  -- Build a plain-text preview (strip HTML tags, trim to 150 chars)
  preview := left(
    regexp_replace(new.content, '<[^>]+>', '', 'g'),
    150
  );

  -- Fetch current task title for the snapshot
  select coalesce(t.title, 'Untitled task')
  into task_title
  from public.tasks t
  where t.id = new.task_id;

  -- Iterate over unique mentioned user IDs
  for mentioned_id in
    select distinct unnest(new.mentioned_user_ids)
  loop
    if mentioned_id is null then
      continue;
    end if;

    -- Skip self-mention
    if actor_id is not null and mentioned_id = actor_id then
      continue;
    end if;

    -- Only notify active workspace members
    if not exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = new.workspace_id
        and wm.user_id = mentioned_id
    ) then
      continue;
    end if;

    -- Verify recipient profile exists
    if not exists (
      select 1
      from public.profiles p
      where p.id = mentioned_id
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
      comment_id,
      comment_preview
    )
    values (
      new.workspace_id,
      mentioned_id,
      actor_id,
      'comment_mention',
      new.task_id,
      coalesce(task_title, 'Untitled task'),
      new.id,
      preview
    );
  end loop;

  return new;
end;
$$ language plpgsql security definer set search_path = public set row_security = off;

drop trigger if exists task_comments_notify_mention on public.task_comments;
create trigger task_comments_notify_mention
  after insert on public.task_comments
  for each row execute function public.notify_comment_mention();
