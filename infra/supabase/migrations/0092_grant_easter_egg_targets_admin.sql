-- Make easter_egg_targets manageable via the normal admin paths.
--
-- 0091 created the table as its Liquibase owner (supabase_admin), so by default
-- NO other role — not even `postgres` or `service_role` — can read or write it,
-- which makes assigning eggs via SQL/Metabase impossible without connecting as
-- supabase_admin. The client read path (RPC get_my_daily_brief_egg) is
-- unaffected (SECURITY DEFINER runs as the owner), but management needs grants.
--
-- We grant full access to the server-side admin roles only:
--   * postgres     — the SSH / Studio SQL admin role used to manage assignments
--   * service_role — the backend / Metabase service-key path
-- The client roles (anon, authenticated) are deliberately NOT granted: browsers
-- still read only through the RPC and can never write. So the surprise stays
-- hidden and the table stays default-deny for end users.

grant select, insert, update, delete on public.easter_egg_targets to postgres;
grant select, insert, update, delete on public.easter_egg_targets to service_role;
