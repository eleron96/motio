#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root_dir"

compose_file="infra/docker-compose.yml"
env_file=".env"
changelog_file="infra/supabase/liquibase/changelog-master.xml"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running." >&2
  exit 1
fi

if [[ ! -f "$env_file" ]]; then
  echo "Missing $env_file" >&2
  exit 1
fi

if [[ ! -f "$changelog_file" ]]; then
  echo "Missing $changelog_file" >&2
  exit 1
fi

get_env_value() {
  local key="$1"
  local line
  line=$(grep -E "^${key}=" "$env_file" | head -n1 || true)
  echo "${line#*=}"
}

POSTGRES_USER="$(get_env_value POSTGRES_USER)"
POSTGRES_DB="$(get_env_value POSTGRES_DB)"
POSTGRES_PASSWORD="$(get_env_value POSTGRES_PASSWORD)"

POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"

psql_query() {
  local query="$1"
  docker compose -f "$compose_file" --env-file "$env_file" exec -T \
    -e PGPASSWORD="$POSTGRES_PASSWORD" db \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -v ON_ERROR_STOP=1 -c "$query"
}

xml_ids_file="$(mktemp)"
schema_ids_file="$(mktemp)"
dbcl_ids_file="$(mktemp)"
xml_files_file="$(mktemp)"
repo_files_file="$(mktemp)"
cleanup() {
  rm -f "$xml_ids_file" "$schema_ids_file" "$dbcl_ids_file" "$xml_files_file" "$repo_files_file"
}
trap cleanup EXIT

rg -o '<changeSet id="[^"]+"' "$changelog_file" \
  | sed -E 's#<changeSet id="([^"]+)"#\1#' \
  | sort -u > "$xml_ids_file"

rg -o '<sqlFile path="\.\./migrations/[^"]+"' "$changelog_file" \
  | sed -E 's#<sqlFile path="\.\./migrations/([^"]+)"#\1#' \
  | sort -u > "$xml_files_file"

rg --files infra/supabase/migrations -g '*.sql' \
  | xargs -n1 basename \
  | sort -u > "$repo_files_file"

schema_exists="$(psql_query "select to_regclass('public.schema_migrations') is not null;")"
dbcl_exists="$(psql_query "select to_regclass('public.databasechangelog') is not null;")"

if [[ "$schema_exists" == "t" ]]; then
  psql_query "select filename from public.schema_migrations order by filename;" > "$schema_ids_file"
else
  : > "$schema_ids_file"
fi

if [[ "$dbcl_exists" == "t" ]]; then
  psql_query "select id from public.databasechangelog order by id;" > "$dbcl_ids_file"
else
  : > "$dbcl_ids_file"
fi

xml_count="$(wc -l < "$xml_ids_file" | tr -d ' ')"
schema_count="$(wc -l < "$schema_ids_file" | tr -d ' ')"
dbcl_count="$(wc -l < "$dbcl_ids_file" | tr -d ' ')"

echo "== Migration Audit (read-only) =="
echo "Source changelog entries: $xml_count"
echo "public.schema_migrations exists: $schema_exists (rows: $schema_count)"
echo "public.databasechangelog exists: $dbcl_exists (rows: $dbcl_count)"

if [[ "$dbcl_exists" == "t" ]]; then
  echo "databasechangelog exectype distribution:"
  psql_query "select exectype || ':' || count(*) from public.databasechangelog group by exectype order by exectype;"
fi

echo
echo "MISSING_IN_SCHEMA_MIGRATIONS:"
comm -23 "$xml_ids_file" "$schema_ids_file" || true

echo
echo "MISSING_IN_DATABASECHANGELOG:"
comm -23 "$xml_ids_file" "$dbcl_ids_file" || true

echo
echo "EXTRA_IN_SCHEMA_MIGRATIONS:"
comm -13 "$xml_ids_file" "$schema_ids_file" || true

echo
echo "EXTRA_IN_DATABASECHANGELOG:"
comm -13 "$xml_ids_file" "$dbcl_ids_file" || true

echo
echo "MISSING_IN_CHANGELOG_XML:"
missing_in_changelog="$(comm -23 "$repo_files_file" "$xml_files_file" || true)"
printf "%s\n" "$missing_in_changelog"

echo
echo "MISSING_MIGRATION_FILE:"
missing_migration_file="$(comm -13 "$repo_files_file" "$xml_files_file" || true)"
printf "%s\n" "$missing_migration_file"

if [[ -n "$missing_in_changelog" || -n "$missing_migration_file" ]]; then
  echo
  echo "Migration audit failed: changelog-master.xml and infra/supabase/migrations are out of sync." >&2
  exit 1
fi
