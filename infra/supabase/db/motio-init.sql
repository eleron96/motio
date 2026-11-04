-- Runs once, when a new database is initialised: mounted into the image's
-- init migrations, after Supabase's own, as supabase_admin.

-- GoTrue and storage-api connect as `postgres` in Motio and own the tables
-- they create, as on the PostgreSQL 15 image. Newer images revoke that from
-- `postgres`; give it back the same rights so new and upgraded installs match.
grant supabase_auth_admin, supabase_storage_admin to postgres;
grant create on schema auth to postgres;
grant create on schema storage to postgres;
grant all on auth.schema_migrations to postgres;
do $$
begin
  if to_regclass('storage.migrations') is not null then
    grant all on storage.migrations to postgres;
  end if;
end $$;

-- Realtime keeps its own tables here (DB_AFTER_CONNECT_QUERY).
create schema if not exists _realtime;
