-- Found on production 2026-10-13 while fixing 0151: the account-deletion and
-- data-export helpers from 0075-0078 were callable by anon over PostgREST with
-- the public anon key. Their migrations revoked EXECUTE from public and
-- authenticated, but Liquibase runs as supabase_admin, whose default
-- privileges grant anon EXECUTE explicitly — so `revoke ... from public` left
-- anon untouched (live ACL: anon=X/supabase_admin). A signed-in user could not
-- call them; an anonymous request could. The helpers check nothing about the
-- caller because only service_role (the cron edge functions) is meant to reach
-- them. The worst one, _collect_data_export_payload(uuid), returns a full data
-- export (profile with email, workspaces, tasks, comments) for any user id.
-- Gateway logs since 2026-07-21 show only internal callers (the crons).
--
-- Fix: revoke from public, anon and authenticated; service_role keeps EXECUTE.
-- get_my_announcements / dismiss_announcement (0137) had the same gap; they
-- check auth.uid() so anon got nothing, but anon has no business calling them
-- either — closed here too, authenticated keeps EXECUTE.
--
-- The SECURITY DEFINER lint now only accepts a revoke that names anon.
--
-- Rollback: grant execute ... to anon (do not).

revoke all on function public._account_deletion_health_check() from public, anon, authenticated;
revoke all on function public._collect_data_export_payload(uuid) from public, anon, authenticated;
revoke all on function public._finalize_export_request(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public._log_account_deletion_event(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public._pick_expired_exports(integer) from public, anon, authenticated;
revoke all on function public._pick_export_request() from public, anon, authenticated;
revoke all on function public._pick_profiles_to_purge(integer) from public, anon, authenticated;

grant execute on function public._account_deletion_health_check() to service_role;
grant execute on function public._collect_data_export_payload(uuid) to service_role;
grant execute on function public._finalize_export_request(uuid, text, text, text) to service_role;
grant execute on function public._log_account_deletion_event(uuid, text, text, jsonb) to service_role;
grant execute on function public._pick_expired_exports(integer) to service_role;
grant execute on function public._pick_export_request() to service_role;
grant execute on function public._pick_profiles_to_purge(integer) to service_role;

revoke all on function public.get_my_announcements() from public, anon;
revoke all on function public.dismiss_announcement(uuid) from public, anon;
grant execute on function public.get_my_announcements() to authenticated, service_role;
grant execute on function public.dismiss_announcement(uuid) to authenticated, service_role;
