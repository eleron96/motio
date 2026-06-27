#!/usr/bin/env bash
#
# Provision a Supabase-schema Postgres for the integration test suite
# (`npm run test:integration`). Mirrors what `make up` produces for the data
# layer, minus the long-running runtime services:
#
#   1. supabase/postgres image  -> base auth.* (users) + storage.* tables
#   2. GoTrue (transient)       -> rest of the auth schema (auth.identities, ...)
#   3. storage-api (transient)  -> storage.buckets.public column + its migrations
#   4. Liquibase                -> all app migrations (infra/supabase/migrations)
#
# Steps 2-3 are needed because migrations reference service-managed schema that
# the bare DB image does not create. The two services are started only long
# enough to run their own migrations, then removed.
#
# Used by CI (.github/workflows/ci.yml). Safe to run locally too — it uses the
# same Docker volume as `make up`, so it leaves a ready dev DB behind.
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root_dir"

export POSTGRES_USER="${POSTGRES_USER:-postgres}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
export POSTGRES_DB="${POSTGRES_DB:-postgres}"
export JWT_SECRET="${JWT_SECRET:-ci-super-secret-jwt-token-with-at-least-32-characters}"

GOTRUE_IMAGE="${GOTRUE_IMAGE:-supabase/gotrue:v2.151.0}"
STORAGE_IMAGE="${STORAGE_IMAGE:-supabase/storage-api:v1.11.13}"
COMPOSE=(docker compose -f infra/docker-compose.yml)

log() { echo "==> $*"; }

cleanup() {
  docker rm -f ci-gotrue ci-storage >/dev/null 2>&1 || true
}
trap cleanup EXIT

psql_q() {
  docker exec supabase-db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$1" 2>/dev/null || echo ""
}

wait_for() {
  # wait_for <description> <sql-returning-t-or-f> <max-tries>
  local desc="$1" sql="$2" tries="${3:-30}" i
  for ((i = 1; i <= tries; i++)); do
    [ "$(psql_q "$sql")" = "t" ] && { log "$desc ready"; return 0; }
    sleep 2
  done
  log "ERROR: timed out waiting for $desc"
  return 1
}

# 1. External volume + Postgres -------------------------------------------------
docker volume create supabase_db_data >/dev/null
log "Starting Postgres..."
"${COMPOSE[@]}" up -d db

log "Waiting for Postgres health..."
db_status="starting"
for i in $(seq 1 60); do
  db_status="$(docker inspect -f '{{.State.Health.Status}}' supabase-db 2>/dev/null || echo starting)"
  [ "$db_status" = "healthy" ] && break
  sleep 3
done
if [ "$db_status" != "healthy" ]; then
  log "ERROR: Postgres did not become healthy"
  "${COMPOSE[@]}" logs db || true
  exit 1
fi

network="$(docker inspect supabase-db -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' | awk '{print $1}')"
log "Postgres is on network: $network"

# 2. GoTrue provisions the auth schema -----------------------------------------
log "Provisioning auth schema via GoTrue..."
docker rm -f ci-gotrue >/dev/null 2>&1 || true
docker run -d --name ci-gotrue --network "$network" \
  -e GOTRUE_DB_DRIVER=postgres \
  -e GOTRUE_DB_DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}?search_path=auth" \
  -e DB_NAMESPACE=auth \
  -e GOTRUE_API_HOST=0.0.0.0 -e GOTRUE_API_PORT=9999 \
  -e GOTRUE_JWT_SECRET="$JWT_SECRET" \
  -e GOTRUE_SITE_URL=http://localhost \
  -e API_EXTERNAL_URL=http://localhost:9999 \
  -e GOTRUE_URI_ALLOW_LIST='*' \
  -e GOTRUE_DISABLE_SIGNUP=false \
  -e GOTRUE_EXTERNAL_EMAIL_ENABLED=false \
  "$GOTRUE_IMAGE" >/dev/null
# Wait for the specific column migration 0026 needs (provider_id), not just the
# table — GoTrue adds the table early but the column in a later migration, so
# stopping at table-existence races the rest of GoTrue's migrations.
wait_for "auth.identities.provider_id" \
  "select exists (select 1 from information_schema.columns where table_schema='auth' and table_name='identities' and column_name='provider_id')" 40 || {
  docker logs ci-gotrue 2>&1 | tail -10 || true
  exit 1
}
docker rm -f ci-gotrue >/dev/null 2>&1 || true

# 3. storage-api provisions the storage schema ----------------------------------
log "Provisioning storage schema via storage-api..."
docker rm -f ci-storage >/dev/null 2>&1 || true
docker run -d --name ci-storage --network "$network" \
  -e ANON_KEY=dummy -e SERVICE_KEY=dummy \
  -e PGRST_JWT_SECRET="$JWT_SECRET" \
  -e DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}" \
  -e PGOPTIONS="-c search_path=storage" \
  -e FILE_SIZE_LIMIT=52428800 -e STORAGE_BACKEND=file -e FILE_STORAGE_BACKEND_PATH=/var/lib/storage \
  -e TENANT_ID=stub -e REGION=stub -e GLOBAL_S3_BUCKET=stub \
  -e POSTGREST_URL=http://localhost:3000 \
  "$STORAGE_IMAGE" >/dev/null
wait_for "storage.buckets.public" \
  "select exists (select 1 from information_schema.columns where table_schema='storage' and table_name='buckets' and column_name='public')" || {
  docker logs ci-storage 2>&1 | tail -10 || true
  exit 1
}
docker rm -f ci-storage >/dev/null 2>&1 || true

# 4. Apply app migrations -------------------------------------------------------
log "Applying Liquibase migrations..."
"${COMPOSE[@]}" run --rm --no-deps migrate

log "Test database ready on localhost:54322"
