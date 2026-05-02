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
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"

if [[ -z "$POSTGRES_USER" || -z "$POSTGRES_PASSWORD" ]]; then
  echo "POSTGRES_USER / POSTGRES_PASSWORD missing from $env_file" >&2
  exit 1
fi

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

echo "==> Applying prod migrations to $DEMO_DB_NAME"
prod_count=0
for f in "$root_dir"/infra/supabase/migrations/00*.sql; do
  printf "    %s ... " "$(basename "$f")"
  psql_in -d "$DEMO_DB_NAME" < "$f" >/dev/null
  printf "ok\n"
  prod_count=$((prod_count + 1))
done
echo "    $prod_count prod migrations applied"

echo "==> Applying demo extension layer"
demo_count=0
for f in "$root_dir"/infra/supabase/demo/00*.sql; do
  base="$(basename "$f")"
  printf "    %s ... " "$base"
  if psql_in -d "$DEMO_DB_NAME" < "$f" 2>/tmp/demo-init-err.log >/dev/null; then
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

echo
echo "Demo database $DEMO_DB_NAME is ready."
echo "Bring up the demo stack:"
echo "  docker compose --profile demo -f infra/docker-compose.prod.yml -f infra/docker-compose.testing.yml --env-file $env_file up -d demo-auth demo-rest demo-gateway"
