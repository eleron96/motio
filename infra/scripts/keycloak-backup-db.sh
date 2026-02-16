#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  cd "$root_dir"
fi

env_file="${1:-.env}"
compose_file="${2:-infra/docker-compose.prod.yml}"
backup_dir="${3:-infra/backups/keycloak}"

if [[ ! -f "$env_file" ]]; then
  echo "Missing env file: $env_file" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required to create Keycloak DB backup." >&2
  exit 1
fi

get_env_value() {
  local key="$1"
  local line
  line="$(grep -E "^${key}=" "$env_file" | head -n1 || true)"
  echo "${line#*=}"
}

fail() {
  echo "$1" >&2
  exit 1
}

keycloak_db_name="$(get_env_value KEYCLOAK_DB_NAME)"
keycloak_db_user="$(get_env_value KEYCLOAK_DB_USER)"
keycloak_db_password="$(get_env_value KEYCLOAK_DB_PASSWORD)"

keycloak_db_name="${keycloak_db_name:-keycloak}"
keycloak_db_user="${keycloak_db_user:-keycloak}"
keycloak_db_password="${keycloak_db_password:-keycloak}"

container_id="$(docker compose -f "$compose_file" --env-file "$env_file" ps -q keycloak-db || true)"
if [[ -z "$container_id" ]]; then
  fail "keycloak-db service is not running. Start stack first."
fi

mkdir -p "$backup_dir"
timestamp="$(date +%Y%m%d-%H%M%S)"
backup_path="${backup_dir}/keycloak-pre-sync-${timestamp}.dump"

if ! docker compose -f "$compose_file" --env-file "$env_file" exec -T \
  -e PGPASSWORD="$keycloak_db_password" keycloak-db \
  pg_dump --format=custom --no-owner -U "$keycloak_db_user" -d "$keycloak_db_name" > "$backup_path"; then
  rm -f "$backup_path"
  fail "Failed to create Keycloak DB backup."
fi

backup_size_bytes="$(wc -c < "$backup_path" | tr -d '[:space:]')"
echo "Keycloak DB backup created: ${backup_path} (${backup_size_bytes} bytes)"

