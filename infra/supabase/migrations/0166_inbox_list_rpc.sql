-- The notification bell in one query.
--
-- The inbox edge function answered every poll (each open tab, every 75 s) with
-- 6–7 sequential internal round-trips: auth check, notifications, membership
-- check, workspace names, actor profiles, task titles, invites. On prod that
-- was ~158k of ~234k PostgREST requests a week. This returns the same lists in
-- the same shape, from one call through PostgREST (which checks the JWT).
--
-- Same rules as the function (infra/supabase/functions/inbox):
--   - notifications: the user's last N non-deleted rows; rows from a workspace
--     the user is no longer a member of are dropped after the limit, as before;
--     account-level rows (workspace_id is null, data export) always pass;
--     unknown types are dropped; title/start date come from the live task when
--     it still exists, else from the snapshot;
--   - pending invites: addressed to the user's email, not accepted, not revoked,
--     not expired;
--   - sent invites (on request): sent by the user in the last 90 days, with
--     the derived status.
-- SECURITY DEFINER because it reads auth.users (the email) and other people's
-- profiles; everything is scoped to auth.uid(). The edge function stays for
-- tabs still running an older build.

create or replace function public.inbox_list(
  p_limit integer default 60,
  p_pending_invite_limit integer default 80,
  p_sent_limit integer default 120,
  p_include_sent boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_limit integer := greatest(1, least(200, coalesce(p_limit, 60)));
  v_pending_limit integer := greatest(1, least(200, coalesce(p_pending_invite_limit, 80)));
  v_sent_limit integer := greatest(1, least(400, coalesce(p_sent_limit, 120)));
  v_invites jsonb;
  v_notifications jsonb;
  v_sent jsonb := '[]'::jsonb;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select lower(btrim(coalesce(u.email, ''))) into v_email
  from auth.users u
  where u.id = v_user;

  select coalesce(jsonb_agg(s.item order by s.created_at desc), '[]'::jsonb) into v_invites
  from (
    select i.created_at, jsonb_build_object(
      'token', i.token,
      'workspaceId', i.workspace_id,
      'workspaceName', coalesce(w.name, 'Workspace'),
      'role', i.role,
      'inviterDisplayName', p.display_name,
      'inviterEmail', p.email
    ) as item
    from public.workspace_invites i
    left join public.workspaces w on w.id = i.workspace_id
    left join public.profiles p on p.id = i.invited_by
    where coalesce(v_email, '') <> ''
      and i.email_normalized = v_email
      and i.accepted_at is null
      and i.revoked_at is null
      and i.expires_at > now()
    order by i.created_at desc
    limit v_pending_limit
  ) s;

  with recent as (
    select n.*
    from public.user_notifications n
    where n.recipient_user_id = v_user
      and n.deleted_at is null
    order by n.created_at desc
    limit v_limit
  ),
  visible as (
    select r.*
    from recent r
    where r.workspace_id is null
       or exists (
         select 1 from public.workspace_members m
         where m.workspace_id = r.workspace_id and m.user_id = v_user
       )
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', v.id,
      'type', v.type,
      'workspaceId', v.workspace_id,
      'workspaceName', case when v.workspace_id is null then '' else coalesce(w.name, 'Workspace') end,
      'actorUserId', v.actor_user_id,
      'actorDisplayName', ap.display_name,
      'actorEmail', ap.email,
      'taskId', v.task_id,
      'taskTitle', coalesce(t.title, v.task_title_snapshot, 'Untitled task'),
      'taskStartDate', coalesce(t.start_date, v.task_start_date_snapshot),
      'taskExists', t.id is not null,
      'commentId', case when v.type = 'comment_mention' then v.comment_id end,
      'commentPreview', case when v.type in ('comment_mention', 'export_ready', 'export_failed') then v.comment_preview end,
      'createdAt', v.created_at,
      'readAt', v.read_at
    ) order by v.created_at desc, v.id), '[]'::jsonb) into v_notifications
  from visible v
  left join public.workspaces w on w.id = v.workspace_id
  left join public.profiles ap on ap.id = v.actor_user_id
  left join public.tasks t on t.id = v.task_id
  where v.type in ('task_assigned', 'comment_mention', 'task_updated', 'export_ready', 'export_failed');

  if coalesce(p_include_sent, false) then
    select coalesce(jsonb_agg(s.item order by s.created_at desc), '[]'::jsonb) into v_sent
    from (
      select i.created_at, jsonb_build_object(
        'token', i.token,
        'workspaceId', i.workspace_id,
        'workspaceName', coalesce(w.name, 'Workspace'),
        'email', i.email,
        'status', case
          when i.accepted_at is not null then 'accepted'
          when i.revoked_at is not null then case i.revoked_reason
            when 'declined' then 'declined'
            when 'expired' then 'expired'
            else 'canceled'
          end
          when i.expires_at <= now() then 'expired'
          else 'pending'
        end,
        'respondedAt', coalesce(
          i.accepted_at,
          i.revoked_at,
          case when i.expires_at <= now() then i.expires_at end
        )
      ) as item
      from public.workspace_invites i
      left join public.workspaces w on w.id = i.workspace_id
      where i.invited_by = v_user
        and i.created_at >= now() - interval '90 days'
      order by i.created_at desc
      limit v_sent_limit
    ) s;
  end if;

  return jsonb_build_object(
    'invites', v_invites,
    'notifications', v_notifications,
    'sentInvites', v_sent,
    'polledAt', now()
  );
end;
$$;

revoke all on function public.inbox_list(integer, integer, integer, boolean) from public, anon;
grant execute on function public.inbox_list(integer, integer, integer, boolean) to authenticated;

comment on function public.inbox_list(integer, integer, integer, boolean) is
  'The notification bell (invites, notifications, sent invites) in one call, '
  'scoped to auth.uid(). Same output as the inbox edge function.';
