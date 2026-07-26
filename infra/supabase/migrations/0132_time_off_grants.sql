-- time_off (0131) was created owned by supabase_admin on the testing/prod stacks
-- (docker-compose.prod.yml runs Liquibase as MIGRATION_DB_USER=supabase_admin),
-- so it did NOT inherit the Supabase default privileges that grant
-- authenticated/service_role access to public tables — those defaults only fire
-- for tables owned by the postgres role. That is exactly the 0118 -> 0119 bug:
-- on a dev database (Liquibase runs as postgres) the table comes out with
-- authenticated=arwdDxt and everything works, while on the real stacks every
-- request fails with 42501 "permission denied for table time_off".
--
-- Row visibility stays gated by the RLS policies from 0131 (read = workspace
-- member; write = the person themselves or a workspace admin). These grants only
-- open the table to the roles at all; they do not widen who sees which row.
--
-- Rollback:
--   REVOKE ALL ON public.time_off FROM authenticated, service_role;

grant select, insert, update, delete on public.time_off to authenticated;
grant select, insert, update, delete on public.time_off to service_role;
