-- A deleted comment disappears for teammates too, live.
--
-- Comments are soft-deleted (deleted_at is set). Realtime sends an UPDATE to a
-- subscriber only if that subscriber may read the NEW row, and the read
-- policy hid every row with deleted_at set — so nobody ever got the event:
-- the comment stayed in teammates' open cards and in the counter.
--
-- Now members may read a deleted row, but there is nothing left in it to
-- read: the moment deleted_at is set, a trigger empties the text and the
-- mentions, whether the delete came through soft_delete_task_comment or a
-- direct UPDATE the update policy allows an author. The mention
-- notifications built from the comment lose their text preview too. Every
-- read in the app still filters deleted_at is null (feed, single comment,
-- counts, export).
--
-- Accepted: a member can still read a deleted row's bookkeeping — who wrote
-- it (author id and name snapshot), when, and on which task. All of that was
-- visible to the same members before the comment was deleted.

alter table public.task_comments
  drop constraint if exists task_comments_content_not_blank;
alter table public.task_comments
  add constraint task_comments_content_not_blank
  check (deleted_at is not null or length(btrim(content)) > 0);

-- SECURITY DEFINER for the notifications: they belong to the mentioned
-- people, and the one deleting may not write them.
create or replace function public.clear_deleted_task_comment()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    new.content := '';
    new.mentioned_user_ids := '{}';
    update public.user_notifications
    set comment_preview = null
    where comment_id = new.id
      and comment_preview is not null;
  end if;
  return new;
end;
$$;

revoke all on function public.clear_deleted_task_comment() from public, anon, authenticated;

drop trigger if exists task_comments_clear_deleted on public.task_comments;
create trigger task_comments_clear_deleted
  before update on public.task_comments
  for each row execute function public.clear_deleted_task_comment();

-- Comments deleted before this migration still hold their text; empty it
-- before their rows become readable.
update public.task_comments
set content = '', mentioned_user_ids = '{}'
where deleted_at is not null
  and (content <> '' or mentioned_user_ids <> '{}');

update public.user_notifications n
set comment_preview = null
from public.task_comments c
where c.id = n.comment_id
  and c.deleted_at is not null
  and n.comment_preview is not null;

drop policy if exists "workspace members can read task comments" on public.task_comments;
create policy "workspace members can read task comments" on public.task_comments
  for select using (public.is_workspace_member(workspace_id));
