-- Demo project only. Periodic cleanup of inactive anon sessions.
--
-- The frontend pings demo_heartbeat() every ~30s while the user is
-- active. After ~3 minutes of idle it stops. Anything older than
-- 10 minutes here is considered abandoned and deleted, taking the
-- workspace and all cascaded rows with it.
--
-- Requires the pg_cron extension. Enable in the demo Supabase project
-- via Database → Extensions → pg_cron before applying this file.

create extension if not exists pg_cron;

create or replace function public.cleanup_demo_sessions()
returns int as $$
declare
  v_deleted int;
begin
  with stale as (
    select user_id
    from public.demo_session_heartbeats
    where last_seen_at < now() - interval '10 minutes'
  ),
  removed_users as (
    delete from auth.users
    where id in (select user_id from stale)
      and coalesce(is_anonymous, false) = true
    returning id
  )
  select count(*) into v_deleted from removed_users;

  return v_deleted;
end;
$$ language plpgsql security definer set search_path = public, auth set row_security = off;

-- Scheduled every 2 minutes. Gives ~10-12 minutes between user idle
-- and full cleanup, matching the "10 minutes after they leave" spec.
select cron.schedule(
  'demo-cleanup-stale-sessions',
  '*/2 * * * *',
  $$select public.cleanup_demo_sessions()$$
);
