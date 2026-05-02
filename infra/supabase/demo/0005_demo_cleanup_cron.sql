-- Demo project only. Function that removes inactive anon sessions.
--
-- The frontend pings demo_heartbeat() every ~30s while the user is
-- active. After ~3 minutes of idle it stops. Anything older than
-- 10 minutes here is considered abandoned and deleted, taking the
-- workspace and all cascaded rows with it.
--
-- Scheduling is *not* via pg_cron (which lives in the cluster-wide
-- `postgres` database and is awkward to use from a separate logical
-- DB on shared infra). Instead, a tiny demo-janitor sidecar in
-- docker-compose calls this function every 2 minutes via psql.

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

grant execute on function public.cleanup_demo_sessions() to anon, authenticated, service_role;
