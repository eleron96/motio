#!/usr/bin/env bash
set -euo pipefail

# Restore the Keycloak database (logins, passwords, realm config) from a
# keycloak-*.dump produced by the backup service (createKeycloakBackup: a
# custom-format `pg_dump` of the keycloak DB). This is the real login store —
# GoTrue's auth schema rides along with the Supabase DB backup, but passwords
# live in Keycloak.
#
# The restore MUST run with the Keycloak app stopped (open connections + a
# --clean restore = corruption), so this orchestrates stop -> restore -> start.
# pg_restore runs *inside* the keycloak-db container, reading the dump from
# stdin, so no Postgres client is needed on the host.
#
# Safety: dumps the current keycloak DB to a timestamped pre-restore file first.
#
# Usage:
#   infra/scripts/restore-keycloak.sh <path/to/keycloak-*.dump> [--yes]
#
# Env overrides:
#   COMPOSE_FILE   default: infra/docker-compose.prod.yml
#   ENV_FILE       default: .env
#   SNAPSHOT_DIR   default: ./backups

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root_dir"

COMPOSE_FILE="${COMPOSE_FILE:-infra/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env}"
SNAPSHOT_DIR="${SNAPSHOT_DIR:-./backups}"
KC_APP_SERVICE="keycloak"
KC_DB_SERVICE="keycloak-db"

dump="${1:-}"
assume_yes=0
for arg in "$@"; do
  [[ "$arg" == "--yes" || "$arg" == "-y" ]] && assume_yes=1
done

die() { echo "ERROR: $*" >&2; exit 1; }

[[ -n "$dump" ]] || die "Usage: $0 <keycloak-*.dump> [--yes]"
[[ -f "$dump" ]] || die "Dump not found: $dump"

command -v docker >/dev/null 2>&1 || die "Docker is required."
docker info >/dev/null 2>&1 || die "Docker is not running."
[[ -f "$COMPOSE_FILE" ]] || die "Compose file not found: $COMPOSE_FILE"
[[ -f "$ENV_FILE" ]] || die "Env file not found: $ENV_FILE"

# Verify custom-format pg_dump (magic bytes "PGDMP") before touching anything.
magic="$(head -c 5 "$dump" 2>/dev/null || true)"
[[ "$magic" == "PGDMP" ]] || die "Not a custom-format pg_dump (missing PGDMP header): $dump"

# DB name / user default to the compose defaults; .env may override them.
kc_db="${KEYCLOAK_DB_NAME:-keycloak}"
kc_user="${KEYCLOAK_DB_USER:-keycloak}"
if grep -q '^KEYCLOAK_DB_NAME=' "$ENV_FILE"; then kc_db="$(grep '^KEYCLOAK_DB_NAME=' "$ENV_FILE" | tail -1 | cut -d= -f2-)"; fi
if grep -q '^KEYCLOAK_DB_USER=' "$ENV_FILE"; then kc_user="$(grep '^KEYCLOAK_DB_USER=' "$ENV_FILE" | tail -1 | cut -d= -f2-)"; fi

dc() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

echo
echo "About to RESTORE Keycloak DB:"
echo "  dump    : $dump"
echo "  db/user : $kc_db / $kc_user  (container: $KC_DB_SERVICE)"
echo "  action  : stop $KC_APP_SERVICE -> pg_restore --clean -> start $KC_APP_SERVICE"
echo "  note    : restore into a Keycloak image of the SAME or NEWER version."
echo
if [[ "$assume_yes" -ne 1 ]]; then
  read -r -p "Type 'restore' to proceed: " confirm
  [[ "$confirm" == "restore" ]] || die "Aborted by user."
fi

mkdir -p "$SNAPSHOT_DIR"
ts="$(date -u +%Y%m%dT%H%M%SZ)"

echo "==> Ensuring $KC_DB_SERVICE is up…"
dc up -d "$KC_DB_SERVICE" >/dev/null

echo "==> Snapshotting current Keycloak DB (safety net)…"
snapshot="$SNAPSHOT_DIR/keycloak-prerestore-${ts}.dump"
if dc exec -T "$KC_DB_SERVICE" pg_dump -Fc -U "$kc_user" -d "$kc_db" > "$snapshot" 2>/dev/null && [[ -s "$snapshot" ]]; then
  echo "    snapshot: $snapshot ($(wc -c <"$snapshot" | tr -d ' ') bytes)"
else
  rm -f "$snapshot"
  echo "    (no existing DB to snapshot — proceeding with a fresh restore)"
fi

echo "==> Stopping $KC_APP_SERVICE app…"
dc stop "$KC_APP_SERVICE" >/dev/null 2>&1 || true

echo "==> Restoring dump into $kc_db…"
dc exec -T "$KC_DB_SERVICE" \
  pg_restore --clean --if-exists --single-transaction --no-owner \
  -U "$kc_user" -d "$kc_db" < "$dump"

echo "==> Starting $KC_APP_SERVICE app…"
dc up -d "$KC_APP_SERVICE" >/dev/null

echo "==> Waiting for Keycloak DB to accept connections…"
for _ in $(seq 1 30); do
  if dc exec -T "$KC_DB_SERVICE" pg_isready -U "$kc_user" -d "$kc_db" >/dev/null 2>&1; then
    echo "    keycloak-db ready."
    break
  fi
  sleep 2
done

echo
echo "==> Keycloak restore complete. Verify login at your Keycloak URL."
echo "    Keycloak runs its own schema migration on boot; give it ~30-60s."
[[ -f "$snapshot" ]] && echo "    Roll back with: $0 $snapshot --yes"
