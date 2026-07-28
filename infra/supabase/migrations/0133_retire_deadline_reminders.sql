-- Deadline reminders ("Приближается дедлайн") are retired: they told the user
-- nothing the timeline doesn't already show. The daily scanner cron and the
-- push/inbox handling are gone from the code; this migration takes care of the
-- database side:
--   * drops the scanner function added in 0122, so nothing can create such rows,
--   * removes 'deadline_approaching' from the push claim list (0123), so a
--     leftover unsent row can never be delivered as a push,
--   * hides the reminders users still have sitting in their bell.
--
-- Hiding is a SOFT delete (deleted_at), the same mechanism the "delete
-- notification" button uses: the rows stay in the table and the change is
-- reversible. The type check constraint keeps allowing 'deadline_approaching'
-- precisely so this history stays valid — nothing writes that type any more.
--
-- Rollback:
--   UPDATE public.user_notifications SET deleted_at = null
--    WHERE type = 'deadline_approaching' AND read_at is null;  -- (best effort)
--   plus re-apply the 0122 scanner and the 0123 claim function definitions.

drop function if exists public.scan_upcoming_deadlines();

-- Same signature and OUT columns as 0123, only the type filter narrows.
create or replace function public.claim_push_notifications(p_limit integer)
returns table (
  id uuid,
  recipient_user_id uuid,
  actor_user_id uuid,
  type text,
  workspace_id uuid,
  task_id uuid,
  task_title_snapshot text,
  task_start_date_snapshot date,
  comment_preview text
)
language sql
security definer
set search_path = public
as $$
  update public.user_notifications n
  set push_sent_at = now()
  where n.id in (
    select en.id
    from public.user_notifications en
    where en.push_sent_at is null
      and en.deleted_at is null
      and en.created_at > now() - interval '1 hour'
      and en.type in ('task_assigned', 'comment_mention', 'task_updated')
    order by en.created_at
    for update skip locked
    limit greatest(1, least(p_limit, 200))
  )
  returning n.id, n.recipient_user_id, n.actor_user_id, n.type, n.workspace_id, n.task_id,
            n.task_title_snapshot, n.task_start_date_snapshot, n.comment_preview;
$$;

-- Grants are restated rather than inherited: an applied changeSet is no proof the
-- live object carries them (create or replace keeps them, a re-created function
-- would not).
revoke execute on function public.claim_push_notifications(integer) from public;
revoke execute on function public.claim_push_notifications(integer) from anon;
revoke execute on function public.claim_push_notifications(integer) from authenticated;
grant execute on function public.claim_push_notifications(integer) to service_role;

update public.user_notifications
   set deleted_at = now()
 where type = 'deadline_approaching'
   and deleted_at is null;
