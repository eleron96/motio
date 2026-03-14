#!/usr/bin/env bash
set -euo pipefail

# Testing environment compose script.
# Based on prod-compose.sh but WITHOUT:
#   - version bump / changelog rotation / release log
#   - pre-migration backup (optional, off by default)
# Uses the same docker-compose.prod.yml and relies on a separate .env on the test server.

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root_dir"

compose_file="infra/docker-compose.prod.yml"
testing_override="infra/docker-compose.testing.yml"
env_file=".env"
compose_cmd="docker compose -f $compose_file -f $testing_override --env-file $env_file"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. Please install Docker." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start Docker and retry." >&2
  exit 1
fi

if [[ ! -f "$env_file" ]]; then
  echo "Missing .env file in project root." >&2
  echo "Create it from .env.example and fill the values." >&2
  exit 1
fi

if [[ ! -x "infra/scripts/check-prod-secrets.sh" ]]; then
  echo "Missing executable infra/scripts/check-prod-secrets.sh" >&2
  exit 1
fi

infra/scripts/check-prod-secrets.sh "$env_file"

if [[ ! -x "infra/scripts/check-internal-port-binds.sh" ]]; then
  echo "Missing executable infra/scripts/check-internal-port-binds.sh" >&2
  exit 1
fi

infra/scripts/check-internal-port-binds.sh --env-file "$env_file" "$compose_file" "$testing_override"

if [[ ! -x "infra/scripts/keycloak-ensure-client-secret.sh" ]]; then
  echo "Missing executable infra/scripts/keycloak-ensure-client-secret.sh" >&2
  exit 1
fi

if [[ ! -x "infra/scripts/keycloak-ensure-client-urls.sh" ]]; then
  echo "Missing executable infra/scripts/keycloak-ensure-client-urls.sh" >&2
  exit 1
fi

if [[ ! -x "infra/scripts/keycloak-ensure-realm-ssl-required.sh" ]]; then
  echo "Missing executable infra/scripts/keycloak-ensure-realm-ssl-required.sh" >&2
  exit 1
fi

if [[ ! -x "infra/scripts/keycloak-ensure-realm-branding.sh" ]]; then
  echo "Missing executable infra/scripts/keycloak-ensure-realm-branding.sh" >&2
  exit 1
fi

if [[ ! -x "infra/scripts/keycloak-ensure-realm-frontend-url.sh" ]]; then
  echo "Missing executable infra/scripts/keycloak-ensure-realm-frontend-url.sh" >&2
  exit 1
fi

if [[ ! -x "infra/scripts/keycloak-ensure-realm-session-policy.sh" ]]; then
  echo "Missing executable infra/scripts/keycloak-ensure-realm-session-policy.sh" >&2
  exit 1
fi

get_env_value() {
  local key="$1"
  local line
  line=$(grep -E "^${key}=" "$env_file" | head -n1 || true)
  echo "${line#*=}"
}

normalize_bool() {
  local value="${1:-}"
  value="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
  case "$value" in
    1|true|yes|on)
      echo "true"
      ;;
    *)
      echo "false"
      ;;
  esac
}

POSTGRES_USER="$(get_env_value POSTGRES_USER)"
POSTGRES_DB="$(get_env_value POSTGRES_DB)"
POSTGRES_PASSWORD="$(get_env_value POSTGRES_PASSWORD)"
RESERVE_ADMIN_EMAIL="$(get_env_value RESERVE_ADMIN_EMAIL)"
RESERVE_ADMIN_PASSWORD="$(get_env_value RESERVE_ADMIN_PASSWORD)"
OAUTH2_PROXY_COOKIE_SECRET="$(get_env_value OAUTH2_PROXY_COOKIE_SECRET)"

POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"

if [[ -z "$RESERVE_ADMIN_EMAIL" || -z "$RESERVE_ADMIN_PASSWORD" ]]; then
  echo "RESERVE_ADMIN_EMAIL and RESERVE_ADMIN_PASSWORD are required." >&2
  exit 1
fi

if [[ -z "$OAUTH2_PROXY_COOKIE_SECRET" ]]; then
  if command -v openssl >/dev/null 2>&1; then
    # oauth2-proxy requires exactly 16, 24, or 32 bytes for AES cipher
    OAUTH2_PROXY_COOKIE_SECRET="$(openssl rand -hex 16)"
  else
    echo "OAUTH2_PROXY_COOKIE_SECRET is missing and openssl is not available to generate it." >&2
    exit 1
  fi
  # Persist generated secret
  printf "OAUTH2_PROXY_COOKIE_SECRET=%s\n" "$OAUTH2_PROXY_COOKIE_SECRET" >> "$env_file"
  echo "Generated OAUTH2_PROXY_COOKIE_SECRET in $env_file"
fi

export COMPOSE_MENU=0

# --- Start database first ---
$compose_cmd up -d db

DB_WAIT_TIMEOUT_SECONDS="${DB_WAIT_TIMEOUT_SECONDS:-300}"
db_wait_started_at="$(date +%s)"

until $compose_cmd exec -T \
  -e PGPASSWORD="$POSTGRES_PASSWORD" db \
  pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; do
  db_wait_now="$(date +%s)"
  db_wait_elapsed="$((db_wait_now - db_wait_started_at))"
  if (( db_wait_elapsed >= DB_WAIT_TIMEOUT_SECONDS )); then
    echo "Timed out waiting for database readiness after ${DB_WAIT_TIMEOUT_SECONDS}s." >&2
    $compose_cmd ps db || true
    $compose_cmd logs --tail=40 db || true
    exit 1
  fi

  echo "Waiting for database... (${db_wait_elapsed}s/${DB_WAIT_TIMEOUT_SECONDS}s)"
  sleep 2
done

# --- Sync supabase internal role passwords with POSTGRES_PASSWORD ---
# The supabase/postgres image creates internal roles (supabase_auth_admin,
# authenticator, supabase_admin) with their own default passwords during
# first init. We need them to match POSTGRES_PASSWORD from .env so that
# auth, rest, and other services can connect.
echo "Syncing internal role passwords..."
$compose_cmd exec -T db \
  psql -U supabase_admin -d "$POSTGRES_DB" -c "
    ALTER ROLE postgres WITH PASSWORD '${POSTGRES_PASSWORD}';
    ALTER ROLE supabase_admin WITH PASSWORD '${POSTGRES_PASSWORD}';
    ALTER ROLE supabase_auth_admin WITH PASSWORD '${POSTGRES_PASSWORD}';
    ALTER ROLE authenticator WITH PASSWORD '${POSTGRES_PASSWORD}';
  " >/dev/null 2>&1 || echo "Warning: could not sync role passwords (may already match)." >&2

# --- Ensure _realtime schema exists (required by realtime service) ---
$compose_cmd exec -T db \
  psql -U supabase_admin -d "$POSTGRES_DB" -c "CREATE SCHEMA IF NOT EXISTS _realtime;" >/dev/null 2>&1

# --- Start remaining services ---
$compose_cmd up -d keycloak-db keycloak auth rest functions backup realtime gateway

# Recreate edge runtime container to drop stale deno module cache.
$compose_cmd up -d --force-recreate --no-deps functions

# --- Keycloak configuration ---
infra/scripts/keycloak-ensure-client-secret.sh "$env_file"
infra/scripts/keycloak-ensure-client-urls.sh "$env_file"
infra/scripts/keycloak-ensure-realm-ssl-required.sh "$env_file"
infra/scripts/keycloak-ensure-realm-branding.sh "$env_file"
infra/scripts/keycloak-ensure-realm-frontend-url.sh "$env_file"
infra/scripts/keycloak-ensure-realm-session-policy.sh "$env_file"

# --- Reload gateway config gracefully ---
if $compose_cmd ps -q gateway >/dev/null 2>&1; then
  if $compose_cmd exec -T gateway nginx -t >/dev/null 2>&1; then
    $compose_cmd exec -T gateway nginx -s reload >/dev/null 2>&1 || true
  else
    echo "Warning: gateway nginx config test failed; skipping reload." >&2
  fi
fi

# --- Run migrations ---
$compose_cmd run --rm migrate

# --- Keycloak sync bootstrap ---
if command -v curl >/dev/null 2>&1; then
  bootstrap_url="http://localhost:8080/functions/v1/admin"
  bootstrap_payload='{"action":"bootstrap.sync"}'
  bootstrap_ok=0
  BOOTSTRAP_CONNECT_TIMEOUT_SECONDS="${BOOTSTRAP_CONNECT_TIMEOUT_SECONDS:-5}"
  BOOTSTRAP_REQUEST_TIMEOUT_SECONDS="${BOOTSTRAP_REQUEST_TIMEOUT_SECONDS:-10}"
  for attempt in {1..20}; do
    status_code=$(curl \
      --connect-timeout "$BOOTSTRAP_CONNECT_TIMEOUT_SECONDS" \
      --max-time "$BOOTSTRAP_REQUEST_TIMEOUT_SECONDS" \
      -sS -o /dev/null -w "%{http_code}" \
      -X POST \
      -H "Content-Type: application/json" \
      -d "$bootstrap_payload" \
      "$bootstrap_url" || true)
    if [[ "$status_code" == "200" ]]; then
      echo "Keycloak sync bootstrap completed (HTTP $status_code)."
      bootstrap_ok=1
      break
    fi
    sleep 2
  done

  if [[ "$bootstrap_ok" -ne 1 ]]; then
    echo "Warning: could not confirm Keycloak sync bootstrap. Check functions logs." >&2
  fi
else
  echo "Warning: curl is not installed, skipping Keycloak sync bootstrap request." >&2
fi

# --- Build and start web + oauth2-proxy ---
$compose_cmd up -d --build web oauth2-proxy

echo "Testing stack is running."
echo "Frontend: http://localhost:5173"
echo "Supabase Gateway health: http://localhost:8080/health"
echo "Supabase Auth health: http://localhost:8080/auth/v1/health"
echo "Keycloak: http://localhost:8081"
echo "Login as reserve super admin: $RESERVE_ADMIN_EMAIL"
