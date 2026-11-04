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

if [[ ! -x "infra/scripts/keycloak-ensure-realm-bruteforce.sh" ]]; then
  echo "Missing executable infra/scripts/keycloak-ensure-realm-bruteforce.sh" >&2
  exit 1
fi

if [[ ! -x "infra/scripts/keycloak-ensure-realm-passwordpolicy.sh" ]]; then
  echo "Missing executable infra/scripts/keycloak-ensure-realm-passwordpolicy.sh" >&2
  exit 1
fi

if [[ ! -x "infra/scripts/keycloak-ensure-realm-user-profile.sh" ]]; then
  echo "Missing executable infra/scripts/keycloak-ensure-realm-user-profile.sh" >&2
  exit 1
fi

if [[ ! -x "infra/scripts/keycloak-ensure-realm-locales.sh" ]]; then
  echo "Missing executable infra/scripts/keycloak-ensure-realm-locales.sh" >&2
  exit 1
fi

if [[ ! -x "infra/scripts/keycloak-ensure-realm-register-password.sh" ]]; then
  echo "Missing executable infra/scripts/keycloak-ensure-realm-register-password.sh" >&2
  exit 1
fi

if [[ ! -x "infra/scripts/keycloak-ensure-identity-providers-disabled.sh" ]]; then
  echo "Missing executable infra/scripts/keycloak-ensure-identity-providers-disabled.sh" >&2
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

# Realm `timeline` lives in the shared Keycloak of the test server
# (ids-checker's, 127.0.0.1:8081 under /auth); see docker-compose.testing.yml.
export KEYCLOAK_ADMIN_BASE_URL="http://127.0.0.1:8081/auth"

# The shared Keycloak serves our login theme from this host directory;
# deploy-testing.sh restarts it when the theme changes.
mkdir -p /opt/keycloak-themes/timeline
rsync -a --delete infra/keycloak/themes/timeline/ /opt/keycloak-themes/timeline/

# --- Once: move a PostgreSQL 15 database to 17 (a no-op otherwise) ---
infra/scripts/pg-upgrade-17.sh "$env_file" "$compose_file" "$testing_override"

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

# GoTrue keeps its pooled database connections across a database restart and
# fails the first request on each of them (57P01 "terminating connection"):
# sign-ins and session refreshes right after a deploy that recreated the
# database (a changed db command) answered 500. Restart auth when it is older
# than the running database; the gateway reload further down picks up its
# address. Self-hosted updates stop the whole stack first, so they never hit it.
db_container="$($compose_cmd ps -q db)"
auth_container="$($compose_cmd ps -q auth)"
if [[ -n "$db_container" && -n "$auth_container" ]]; then
  db_started_at="$(date -d "$(docker inspect -f '{{.State.StartedAt}}' "$db_container")" +%s)"
  auth_started_at="$(date -d "$(docker inspect -f '{{.State.StartedAt}}' "$auth_container")" +%s)"
  if (( auth_started_at < db_started_at )); then
    echo "The database restarted after auth: restarting auth to drop its stale connections."
    $compose_cmd restart auth
  fi
fi

# --- Start remaining services ---
$compose_cmd up -d auth rest functions backup realtime storage gateway

# Recreate edge runtime container to drop stale deno module cache.
$compose_cmd up -d --force-recreate --no-deps functions
# The recreated container has a new IP and nginx resolves upstream names only
# on start/reload: re-resolve right away, or /functions/v1/* answers 502 for
# the rest of the deploy. The full config reload further down still runs.
$compose_cmd exec -T gateway nginx -s reload >/dev/null 2>&1 || true

# --- Keycloak configuration ---
infra/scripts/keycloak-ensure-client-secret.sh "$env_file"
infra/scripts/keycloak-ensure-client-urls.sh "$env_file"
infra/scripts/keycloak-ensure-realm-ssl-required.sh "$env_file"
infra/scripts/keycloak-ensure-realm-branding.sh "$env_file"
infra/scripts/keycloak-ensure-realm-frontend-url.sh "$env_file"
infra/scripts/keycloak-ensure-realm-session-policy.sh "$env_file"
infra/scripts/keycloak-ensure-realm-bruteforce.sh "$env_file"
infra/scripts/keycloak-ensure-realm-passwordpolicy.sh "$env_file"
infra/scripts/keycloak-ensure-realm-user-profile.sh "$env_file"
infra/scripts/keycloak-ensure-realm-locales.sh "$env_file"
infra/scripts/keycloak-ensure-realm-register-password.sh "$env_file"
infra/scripts/keycloak-ensure-identity-providers-disabled.sh "$env_file"

# --- Reload gateway config gracefully ---
# Show nginx -t output so config errors are visible in deploy logs.
# If test fails, force-recreate the gateway so it starts fresh with the new config.
if $compose_cmd ps -q gateway >/dev/null 2>&1; then
  if $compose_cmd exec -T gateway nginx -t 2>&1; then
    $compose_cmd exec -T gateway nginx -s reload 2>&1 || true
    echo "Gateway nginx config reloaded."
  else
    echo "Warning: gateway nginx config test failed; force-recreating gateway." >&2
    $compose_cmd up -d --force-recreate --no-deps gateway
  fi
fi

# --- Run migrations ---
$compose_cmd run --rm migrate

# --- Reserve admin bootstrap ---
if command -v curl >/dev/null 2>&1; then
  bootstrap_url="http://localhost:8080/functions/v1/admin"
  bootstrap_payload='{"action":"bootstrap.sync"}'
  bootstrap_service_key=$(grep -E '^SERVICE_ROLE_KEY=' "$env_file" | head -n1 | cut -d= -f2- || true)
  if [[ -z "$bootstrap_service_key" ]]; then
    echo "Warning: SERVICE_ROLE_KEY not found in $env_file; skipping reserve admin bootstrap." >&2
  else
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
        -H "Authorization: Bearer ${bootstrap_service_key}" \
        -d "$bootstrap_payload" \
        "$bootstrap_url" || true)
      if [[ "$status_code" == "200" ]]; then
        echo "Reserve admin bootstrap completed (HTTP $status_code)."
        bootstrap_ok=1
        break
      fi
      sleep 2
    done

    if [[ "$bootstrap_ok" -ne 1 ]]; then
      echo "Warning: could not confirm reserve admin bootstrap. Check functions logs." >&2
    fi
  fi
else
  echo "Warning: curl is not installed, skipping reserve admin bootstrap request." >&2
fi

# Keep the running release's files before the new web image replaces them: a
# tab opened before this release still loads its lazy chunks from the archive
# (infra/web/nginx.conf falls back to it) instead of a 404 and a forced reload.
# Files older than 7 days are dropped.
archive_web_assets() {
  local archive_dir="infra/web-assets-archive"
  mkdir -p "$archive_dir"
  local web_container
  web_container="$($compose_cmd ps -q web 2>/dev/null || true)"
  if [[ -n "$web_container" ]]; then
    docker cp "$web_container:/usr/share/nginx/html/assets/." "$archive_dir/" >/dev/null 2>&1 \
      || echo "Warning: could not archive the current web assets." >&2
  fi
  find "$archive_dir" -type f -mtime +7 -delete 2>/dev/null || true
}

# --- Build and start web + oauth2-proxy ---
archive_web_assets
$compose_cmd up -d --build web oauth2-proxy

echo "Testing stack is running."
echo "Frontend: http://localhost:5173"
echo "Supabase Gateway health: http://localhost:8080/health"
echo "Supabase Auth health: http://localhost:8080/auth/v1/health"
echo "Keycloak (shared): http://localhost:8081/auth"
echo "Login as reserve super admin: $RESERVE_ADMIN_EMAIL"
