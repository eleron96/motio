-- The broadcast tables (0113) were created by Liquibase, which runs as
-- supabase_admin on the testing/prod stacks. Tables owned by supabase_admin do
-- NOT inherit the Supabase default privileges — those only fire for tables
-- owned by postgres — so on a fresh stack every read answers
-- "permission denied for table email_broadcasts" and the admin console shows
-- an empty history with an error.
--
-- Production happens to have the grants (its tables predate that ownership
-- change), the testing stand does not. This makes the two agree, and any new
-- stand come up correct.
--
-- Row visibility is unchanged: RLS still gates who sees what. anon is left out
-- on purpose — nothing anonymous has business reading broadcasts.
--
-- Rollback:
--   revoke all on public.email_broadcasts from authenticated, service_role;
--   revoke all on public.email_broadcast_recipients from authenticated, service_role;

grant select on public.email_broadcasts to authenticated;
grant select, insert, update, delete on public.email_broadcasts to service_role;

grant select on public.email_broadcast_recipients to authenticated;
grant select, insert, update, delete on public.email_broadcast_recipients to service_role;
