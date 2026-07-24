-- Push deep links: clicking a browser notification should open the exact task,
-- so the claim function must also expose the notification's workspace — the
-- client needs it to switch workspaces before highlighting the task. Changing
-- the OUT row type requires dropping the function first.

drop function if exists public.claim_push_notifications(integer);

create function public.claim_push_notifications(p_limit integer)
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
      and en.type in ('task_assigned', 'comment_mention', 'task_updated', 'deadline_approaching')
    order by en.created_at
    for update skip locked
    limit greatest(1, least(p_limit, 200))
  )
  returning n.id, n.recipient_user_id, n.actor_user_id, n.type, n.workspace_id, n.task_id,
            n.task_title_snapshot, n.task_start_date_snapshot, n.comment_preview;
$$;

-- Queue-mutating, service-role only (the push edge function via the ticker).
revoke execute on function public.claim_push_notifications(integer) from public;
revoke execute on function public.claim_push_notifications(integer) from anon;
revoke execute on function public.claim_push_notifications(integer) from authenticated;
grant execute on function public.claim_push_notifications(integer) to service_role;
