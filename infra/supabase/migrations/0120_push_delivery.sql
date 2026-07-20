-- Phase 2 of browser push: turn the existing user_notifications event stream
-- into actual web-push sends. A background ticker (backup-service) drains new
-- notifications and the push edge function encrypts + delivers them.
--
--   * push_sent_at marks a notification as already considered for push, so the
--     ticker never re-sends it. NULL = still pending.
--   * claim_push_notifications() atomically claims a batch (marks push_sent_at)
--     and returns their content, so two ticker runs can never double-deliver.
--     Only notifications from the last hour are eligible, so enabling push does
--     not retroactively blast a backlog of old notifications.

alter table public.user_notifications
  add column if not exists push_sent_at timestamptz;

create index if not exists user_notifications_push_pending_idx
  on public.user_notifications (created_at)
  where push_sent_at is null;

create or replace function public.claim_push_notifications(p_limit integer)
returns table (
  id uuid,
  recipient_user_id uuid,
  actor_user_id uuid,
  type text,
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
      and en.type in ('task_assigned', 'comment_mention', 'task_updated', 'deadline_approaching')
    order by en.created_at
    for update skip locked
    limit greatest(1, least(p_limit, 200))
  )
  returning n.id, n.recipient_user_id, n.actor_user_id, n.type, n.task_id,
            n.task_title_snapshot, n.task_start_date_snapshot, n.comment_preview;
$$;

-- Queue-mutating, service-role only (the push edge function via the ticker).
revoke execute on function public.claim_push_notifications(integer) from public;
revoke execute on function public.claim_push_notifications(integer) from anon;
revoke execute on function public.claim_push_notifications(integer) from authenticated;
grant execute on function public.claim_push_notifications(integer) to service_role;
