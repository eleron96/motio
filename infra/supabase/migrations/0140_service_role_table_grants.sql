-- Give service_role the table grants it is supposed to have everywhere.
--
-- Production carries them (they came from Supabase's default privileges when
-- the database was first built), but a stand created later does not: 25 of 37
-- tables had no grant for service_role, so every edge function reading them
-- answered "permission denied for table …". The admin user list was dead on the
-- testing stand for exactly this reason, which also means the stand could not
-- be trusted to reproduce production.
--
-- service_role is the backend key that already bypasses RLS; granting it table
-- access widens nothing that was not already intended. anon and authenticated
-- are deliberately untouched — see 0119/0132 for the same reasoning.
--
-- Rollback: revoke the grants below per table.

do $$
declare
  target record;
begin
  for target in
    select tablename
    from pg_tables
    where schemaname = 'public'
      -- Liquibase's own bookkeeping is nobody else's business.
      and tablename not in ('databasechangelog', 'databasechangeloglock')
  loop
    execute format(
      'grant select, insert, update, delete on public.%I to service_role',
      target.tablename
    );
  end loop;
end $$;

-- New tables should inherit it instead of being discovered the hard way, one
-- 42501 at a time. Liquibase runs as supabase_admin on the deployed stands and
-- as postgres in dev/CI, so both owners are covered.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'postgres') then
    execute 'alter default privileges for role postgres in schema public'
      || ' grant select, insert, update, delete on tables to service_role';
  end if;
end $$;
