#!/usr/bin/env bash
# One-shot bootstrap for the demo sandbox database.
#
# Runs psql inside the existing supabase-db container to:
#   1. Create the motio_demo database if it doesn't already exist.
#   2. Apply every prod schema migration to motio_demo (so its tables match
#      prod and the frontend's TypeScript types stay valid).
#   3. Apply the demo extension layer (template + RPCs + cron + override).
#
# Idempotent on (1): re-runs are safe.
# (2) and (3) are NOT idempotent on a populated DB — run only on a fresh
# motio_demo. The script aborts if motio_demo already has user-owned
# workspaces.
#
# Run this from the deployment host after `docker compose ... up -d` has
# brought up the `db` service. It does not require the demo-* services
# themselves to be running; in fact it should run before they start so
# the schema is in place.

set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root_dir"

env_file="${ENV_FILE:-.env}"
if [[ ! -f "$env_file" ]]; then
  echo "Missing $env_file" >&2
  exit 1
fi

# Pull only the keys we need. Sourcing the whole .env breaks on values
# with whitespace (JAVA_OPTS, command-style flags, etc.).
get_env() {
  local key="$1"
  local line
  line=$(grep -E "^${key}=" "$env_file" | tail -n1 || true)
  if [[ -z "$line" ]]; then return; fi
  printf '%s' "${line#*=}"
}

POSTGRES_USER="$(get_env POSTGRES_USER)"
POSTGRES_PASSWORD="$(get_env POSTGRES_PASSWORD)"
DEMO_DB_NAME="$(get_env DEMO_DB_NAME)"
DEMO_DB_NAME="${DEMO_DB_NAME:-motio_demo}"
if [[ -z "$POSTGRES_USER" || -z "$POSTGRES_PASSWORD" ]]; then
  echo "POSTGRES_USER / POSTGRES_PASSWORD missing from $env_file" >&2
  exit 1
fi

# Resolve the running Postgres container — compose's container_name doesn't
# always survive override layering, so we fall back to whatever container is
# wrapping the supabase/postgres image.
detect_db_container() {
  if [[ -n "${DB_CONTAINER:-}" ]] && docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
    echo "$DB_CONTAINER"
    return
  fi
  for candidate in supabase-db infra-db-1 motio-db-1 motio-test-db-1; do
    if docker ps --format '{{.Names}}' | grep -qx "$candidate"; then
      echo "$candidate"
      return
    fi
  done
  docker ps --filter ancestor=supabase/postgres:15.1.0.117 --format '{{.Names}}' | head -n1
}

DB_CONTAINER="$(detect_db_container)"

if ! docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
  echo "Container $DB_CONTAINER is not running." >&2
  exit 1
fi

psql_in() {
  docker exec -i \
    -e PGPASSWORD="$POSTGRES_PASSWORD" \
    "$DB_CONTAINER" \
    psql -U "$POSTGRES_USER" -v ON_ERROR_STOP=1 "$@"
}

# Migrations need to load extensions (pgcrypto, etc.) and run security
# definer functions, which require superuser. Only supabase_admin has
# rolsuper=true on standard Supabase Postgres images.
psql_super() {
  docker exec -i \
    -e PGPASSWORD="$POSTGRES_PASSWORD" \
    "$DB_CONTAINER" \
    psql -U supabase_admin -v ON_ERROR_STOP=1 "$@"
}

echo "==> Ensuring database $DEMO_DB_NAME exists"
exists=$(psql_in -d postgres -tA -c "select 1 from pg_database where datname='$DEMO_DB_NAME'" || true)
if [[ "$exists" != "1" ]]; then
  psql_in -d postgres -c "create database $DEMO_DB_NAME owner $POSTGRES_USER"
  echo "    created"
else
  echo "    already exists"
fi

# Refuse to seed an already-seeded demo DB.
ws_table=$(psql_in -d "$DEMO_DB_NAME" -tA -c \
  "select 1 from information_schema.tables where table_schema='public' and table_name='workspaces'" || true)
if [[ "$ws_table" == "1" ]]; then
  ws_count=$(psql_in -d "$DEMO_DB_NAME" -tA -c "select count(*) from public.workspaces" || echo 0)
  if [[ "$ws_count" -gt 0 ]]; then
    cat >&2 <<MSG
Refusing to migrate: $DEMO_DB_NAME already has $ws_count workspace(s).
The demo seed assumes a fresh database. To re-initialise:
  docker exec -i $DB_CONTAINER psql -U $POSTGRES_USER -d postgres -c "drop database $DEMO_DB_NAME"
…then re-run this script.
MSG
    exit 1
  fi
fi

echo "==> Pre-creating auth + storage schemas (GoTrue / Storage normally bootstrap them, but freshly CREATE'd databases skip the supabase-postgres init script)"
psql_super -d "$DEMO_DB_NAME" >/dev/null <<'BOOTSTRAP'
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role, supabase_auth_admin;
grant create on schema auth to supabase_auth_admin;
alter default privileges in schema auth grant select on tables to anon, authenticated, service_role;

create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

-- Demo doesn't run a Storage service, but our prod migrations reference
-- storage.buckets and storage.objects to seed avatar policies. Provide
-- thin shims that those migrations expect; rows here are inert because
-- there is no storage daemon serving them.
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id) on delete cascade,
  name text,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(),
  metadata jsonb,
  path_tokens text[]
);
create or replace function storage.foldername(name text)
returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
BOOTSTRAP

echo "==> Bringing up demo-auth so it can create auth.users, auth.identities etc."
COMPOSE_FILES="${COMPOSE_FILES:--f infra/docker-compose.prod.yml -f infra/docker-compose.testing.yml}"
# shellcheck disable=SC2086
docker compose $COMPOSE_FILES --env-file "$env_file" --profile demo up -d demo-auth >/dev/null

echo "    waiting for auth.users in $DEMO_DB_NAME"
for _ in $(seq 1 30); do
  if psql_super -d "$DEMO_DB_NAME" -tAc \
    "select 1 from information_schema.tables where table_schema='auth' and table_name='users'" \
    2>/dev/null | grep -q 1; then
    echo "    auth schema ready"
    break
  fi
  sleep 1
done

# auth.identities is also referenced by 0026_keycloak_identity_helpers.sql.
# Older GoTrue migrations may not create it on first boot for our flow,
# so we ensure it exists with a thin shim if missing.
psql_super -d "$DEMO_DB_NAME" >/dev/null <<'PROVISION'
do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema='auth' and table_name='identities') then
    create table if not exists auth.identities (
      id text primary key,
      user_id uuid references auth.users(id) on delete cascade,
      provider text,
      provider_id text,
      identity_data jsonb default '{}'::jsonb,
      email text,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
  end if;
end $$;
PROVISION

echo "==> Applying prod migrations to $DEMO_DB_NAME"
prod_count=0
for f in "$root_dir"/infra/supabase/migrations/00*.sql; do
  printf "    %s ... " "$(basename "$f")"
  psql_super -d "$DEMO_DB_NAME" < "$f" >/dev/null
  printf "ok\n"
  prod_count=$((prod_count + 1))
done
echo "    $prod_count prod migrations applied"

echo "==> Applying demo extension layer"
demo_count=0
for f in "$root_dir"/infra/supabase/demo/00*.sql; do
  base="$(basename "$f")"
  printf "    %s ... " "$base"
  if psql_super -d "$DEMO_DB_NAME" < "$f" 2>/tmp/demo-init-err.log >/dev/null; then
    printf "ok\n"
    demo_count=$((demo_count + 1))
  else
    err="$(cat /tmp/demo-init-err.log)"
    if [[ "$base" == "0005_demo_cleanup_cron.sql" && "$err" == *"pg_cron"* ]]; then
      printf "SKIPPED (pg_cron not available)\n" >&2
      echo "       Re-run this single file after enabling pg_cron in the DB:" >&2
      echo "       docker exec -i $DB_CONTAINER psql -U $POSTGRES_USER -d $DEMO_DB_NAME < $f" >&2
      continue
    fi
    printf "FAILED\n%s\n" "$err" >&2
    exit 1
  fi
done
echo "    $demo_count demo files applied"

echo "==> Granting Supabase role privileges on public/auth/storage schemas"
# Freshly CREATE'd databases inside supabase-postgres skip the bundled
# init script that grants public.* access to anon / authenticated /
# service_role. Without these, PostgREST hits "permission denied for
# table tasks" on the first SELECT. RLS policies still gate row-level
# access — these grants only open the door to the table at all.
psql_super -d "$DEMO_DB_NAME" >/dev/null <<'GRANTS'
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public grant select on tables to anon;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

grant usage on schema auth to anon, authenticated, service_role;
grant select on all tables in schema auth to authenticated, service_role;
grant select on all tables in schema storage to authenticated, service_role;
GRANTS

echo
echo "Demo database $DEMO_DB_NAME is ready."
echo "Bring up the demo stack:"
echo "  docker compose --profile demo -f infra/docker-compose.prod.yml -f infra/docker-compose.testing.yml --env-file $env_file up -d demo-auth demo-rest demo-gateway"
