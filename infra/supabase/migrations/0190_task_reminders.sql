-- Task reminders: an editor picks "remind N days before the start" on a task,
-- and every assignee with an account gets a bell notification (and a push) at
-- 09:00 of that day.
--
-- This is not the retired "deadline approaching" scan (0122 → 0133): that one
-- fired for every task on its own. A reminder exists only where somebody asked
-- for it.
--
-- How it fits together:
--   * tasks.reminder_days_before — null = no reminder; 0 = on the start day.
--     The reminder day is start_date - reminder_days_before, so moving the task
--     moves its reminder.
--   * 09:00 is the RECIPIENT's morning: profiles.time_zone (IANA name the
--     client writes on load). Until a person has opened the app after this
--     release their zone is unknown; tasks.reminder_time_zone — the zone of
--     whoever set the reminder — stands in, then UTC.
--   * fire_task_reminders() runs every minute (backup-service, right before the
--     push flush) and inserts 'task_reminder' rows into user_notifications. The
--     existing push ticker delivers them like any other notification.
--   * A reminder is late by at most 3 hours (service down, task dragged onto
--     tomorrow at 10:00); past that it is skipped rather than sent at an odd
--     hour. One reminder per person per task per 12 hours — reminder moments of
--     one task are a day apart, so this never swallows a real one.
--   * Finished and cancelled tasks (final or cancelled status) are not
--     reminded about.
--
-- Idempotent.
--
-- Rollback:
--   drop function if exists public.fire_task_reminders();
--   drop function if exists public.task_reminder_moment(date, text);
--   re-apply claim_push_notifications from 0133 and inbox_list from 0166;
--   update public.user_notifications set deleted_at = now()
--    where type = 'task_reminder' and deleted_at is null;
--   drop index if exists public.tasks_reminder_day_idx;
--   alter table public.tasks drop column if exists reminder_days_before,
--                            drop column if exists reminder_time_zone;
--   alter table public.profiles drop column if exists time_zone;
--   alter table public.user_notifications drop column if exists reminder_days_before;

-- ───────────────────────────── columns ─────────────────────────────

alter table public.tasks
  add column if not exists reminder_days_before smallint,
  add column if not exists reminder_time_zone text;

alter table public.tasks
  drop constraint if exists tasks_reminder_days_before_check;
alter table public.tasks
  add constraint tasks_reminder_days_before_check
  check (reminder_days_before is null or reminder_days_before between 0 and 30);

alter table public.tasks
  drop constraint if exists tasks_reminder_time_zone_check;
alter table public.tasks
  add constraint tasks_reminder_time_zone_check
  check (reminder_time_zone is null or char_length(reminder_time_zone) between 1 and 64);

-- The minute scan looks only at tasks whose reminder day is around today.
create index if not exists tasks_reminder_day_idx
  on public.tasks ((start_date - reminder_days_before))
  where reminder_days_before is not null;

alter table public.profiles
  add column if not exists time_zone text;

alter table public.profiles
  drop constraint if exists profiles_time_zone_check;
alter table public.profiles
  add constraint profiles_time_zone_check
  check (time_zone is null or char_length(time_zone) between 1 and 64);

-- What the reminder said when it fired ("today", "tomorrow", "in a week"): the
-- push text needs it and cannot derive it without the recipient's time zone.
alter table public.user_notifications
  add column if not exists reminder_days_before smallint;

alter table public.user_notifications
  drop constraint if exists user_notifications_type_check;
alter table public.user_notifications
  add constraint user_notifications_type_check
  check (type in (
    'task_assigned', 'comment_mention', 'export_ready', 'export_failed',
    'task_updated', 'deadline_approaching', 'task_reminder'
  ));

-- ───────────────────────────── when ─────────────────────────────

-- 09:00 of a day in a time zone. The zone name comes from a browser, so an
-- unknown one must not break the whole scan: it reads as UTC.
create or replace function public.task_reminder_moment(p_day date, p_time_zone text)
returns timestamptz
language plpgsql
stable
set search_path = pg_catalog, public
as $$
begin
  return (p_day + time '09:00') at time zone coalesce(nullif(btrim(p_time_zone), ''), 'UTC');
exception when others then
  return (p_day + time '09:00') at time zone 'UTC';
end;
$$;

revoke all on function public.task_reminder_moment(date, text) from public, anon, authenticated;
grant execute on function public.task_reminder_moment(date, text) to service_role;

-- ───────────────────────────── fire ─────────────────────────────

create or replace function public.fire_task_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  insert into public.user_notifications (
    workspace_id,
    recipient_user_id,
    actor_user_id,
    type,
    task_id,
    task_title_snapshot,
    task_start_date_snapshot,
    reminder_days_before
  )
  select distinct on (a.user_id, t.id)
    t.workspace_id,
    a.user_id,
    null::uuid,
    'task_reminder',
    t.id,
    coalesce(nullif(btrim(t.title), ''), 'Untitled task'),
    t.start_date,
    t.reminder_days_before
  from public.tasks t
  left join public.statuses s on s.id = t.status_id
  cross join lateral unnest(coalesce(t.assignee_ids, '{}'::uuid[])) as ta(assignee_id)
  join public.assignees a
    on a.id = ta.assignee_id
   and a.workspace_id = t.workspace_id
  join public.profiles p on p.id = a.user_id
  join public.workspace_members m
    on m.workspace_id = t.workspace_id
   and m.user_id = a.user_id
  cross join lateral (
    select public.task_reminder_moment(
      t.start_date - t.reminder_days_before,
      coalesce(p.time_zone, t.reminder_time_zone)
    ) as fires_at
  ) moment
  where t.reminder_days_before is not null
    -- 09:00 somewhere on Earth for day D lies within UTC days D-1 … D+1.
    and (t.start_date - t.reminder_days_before) between current_date - 1 and current_date + 1
    and coalesce(s.is_final, false) = false
    and coalesce(s.is_cancelled, false) = false
    and a.is_active
    and coalesce(p.status, 'ACTIVE') = 'ACTIVE'
    and now() >= moment.fires_at
    and now() < moment.fires_at + interval '3 hours'
    and not exists (
      select 1
      from public.user_notifications n
      where n.recipient_user_id = a.user_id
        and n.task_id = t.id
        and n.type = 'task_reminder'
        and n.created_at > now() - interval '12 hours'
    );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.fire_task_reminders() from public, anon, authenticated;
grant execute on function public.fire_task_reminders() to service_role;

comment on function public.fire_task_reminders() is
  'Writes the task reminders that are due right now (09:00 in each assignee''s '
  'time zone, N days before the task starts). Called every minute by backup-service.';

-- ───────────────────────────── push ─────────────────────────────

-- The claim also returns reminder_days_before now; a changed OUT row type needs
-- a drop first (as in 0123).
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
  comment_preview text,
  reminder_days_before smallint
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
      and en.type in ('task_assigned', 'comment_mention', 'task_updated', 'task_reminder')
    order by en.created_at
    for update skip locked
    limit greatest(1, least(p_limit, 200))
  )
  returning n.id, n.recipient_user_id, n.actor_user_id, n.type, n.workspace_id, n.task_id,
            n.task_title_snapshot, n.task_start_date_snapshot, n.comment_preview,
            n.reminder_days_before;
$$;

revoke all on function public.claim_push_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_push_notifications(integer) to service_role;

-- ───────────────────────────── bell ─────────────────────────────

-- inbox_list as in 0166, with 'task_reminder' added to the known types.
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
  where v.type in (
    'task_assigned', 'comment_mention', 'task_updated', 'task_reminder',
    'export_ready', 'export_failed'
  );

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
