-- M-2 (Medium): Liquibase bookkeeping tables are anonymously readable/writable.
--
-- databasechangelog and databasechangeloglock live in the exposed `public`
-- schema (PGRST_DB_SCHEMA=public) and were never locked down, so the anon role
-- inherits the default table grants: an unauthenticated caller can read the full
-- migration history and, worse, PATCH databasechangeloglock (locked=true) to
-- block every future deploy, or DELETE from databasechangelog to corrupt the
-- migration state.
--
-- Fix: revoke all client access. Liquibase itself connects as the table OWNER
-- (supabase_admin on prod, postgres on dev), which is unaffected by revoking
-- anon/authenticated/public, so deploys keep working. service_role is a
-- server-side-only key and is intentionally left alone.
--
-- Do NOT enable FORCE ROW LEVEL SECURITY here: it would apply RLS to the owner
-- too and, with no permissive policy, deny Liquibase's own lock/insert writes —
-- breaking every future deploy. Plain REVOKE is sufficient: the DB-layer
-- privilege check denies client access immediately, and after a PostgREST schema
-- reload the tables also drop out of API introspection.
-- Guarded + idempotent so it is safe on a fresh stack and on re-run.

do $$
begin
  if to_regclass('public.databasechangelog') is not null then
    execute 'revoke all on public.databasechangelog from anon, authenticated, public';
  end if;
  if to_regclass('public.databasechangeloglock') is not null then
    execute 'revoke all on public.databasechangeloglock from anon, authenticated, public';
  end if;
end $$;
