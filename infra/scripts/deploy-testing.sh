#!/usr/bin/env bash
set -euo pipefail

# Deploy to the TESTING server (46.149.69.61).
# This script is intentionally separate from deploy-remote.sh to avoid
# accidentally touching the production server or its release artifacts.
#
# Differences from deploy-remote.sh:
#   - Hardcoded to test host only (no fallback to prod IP)
#   - Calls test-compose.sh instead of prod-compose.sh
#   - Does NOT sync VERSION / CHANGELOG / releases.log back
#   - Syncs Caddyfile.testing instead of Caddyfile

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
host="${1:-root@46.149.69.61}"
remote_dir="/opt/motio-test"

# Safety: refuse to deploy to production IP
prod_ip="94.141.162.237"
if [[ "$host" == *"$prod_ip"* ]]; then
  echo "ERROR: deploy-testing.sh must not target the production server ($prod_ip)." >&2
  exit 1
fi

echo "Deploy target (TESTING): ${host}:${remote_dir}"

rsync_output="$(
  rsync -az --itemize-changes \
    --exclude '.git' \
    --exclude '.claude/' \
    --exclude 'node_modules' \
    --exclude 'dist' \
    --exclude '.env' \
    --exclude 'infra/backups' \
    --exclude 'infra/caddy/Caddyfile' \
    --exclude 'infra/caddy/Caddyfile.testing' \
    "${root_dir}/" "${host}:${remote_dir}/"
)"

if [[ -n "${rsync_output}" ]]; then
  printf "%s\n" "${rsync_output}"
fi

keycloak_theme_changed="false"
if printf "%s\n" "${rsync_output}" | grep -q 'infra/keycloak/themes/'; then
  keycloak_theme_changed="true"
fi

# Sync Caddyfile.testing as the server's Caddyfile (in-place to keep inode stable)
rsync -az --inplace \
  "${root_dir}/infra/caddy/Caddyfile.testing" \
  "${host}:${remote_dir}/infra/caddy/Caddyfile"

# Sync nginx.conf in-place
rsync -az --inplace \
  "${root_dir}/infra/supabase/nginx.conf" \
  "${host}:${remote_dir}/infra/supabase/nginx.conf"

# Run test-compose.sh on the remote server
ssh "$host" "cd '${remote_dir}' && bash infra/scripts/test-compose.sh"

if [[ "${keycloak_theme_changed}" == "true" ]]; then
  echo "Keycloak theme changes detected. Recreating keycloak to flush theme cache."
  ssh "$host" "cd '${remote_dir}' && docker compose -f infra/docker-compose.prod.yml -f infra/docker-compose.testing.yml --env-file .env up -d --force-recreate --no-deps keycloak"
fi

ssh "$host" "cd '${remote_dir}' && bash infra/scripts/ensure-caddy-network-access.sh"

ssh "$host" "if docker ps --format '{{.Names}}' | grep -qx 'motio-caddy'; then \
  docker exec motio-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 && echo 'Caddy config reloaded.' || (docker restart motio-caddy >/dev/null && echo 'Caddy container restarted (reload failed).'); \
fi"

if [[ "${RUN_FIREWALL_HARDEN:-0}" == "1" && "${SKIP_FIREWALL_HARDEN:-0}" != "1" ]]; then
  DEPLOY_HOST="$host" bash "${root_dir}/infra/scripts/harden-firewall.sh" "$host"
else
  echo "Skipping firewall hardening (set RUN_FIREWALL_HARDEN=1 to enforce)."
fi

# NOTE: We intentionally do NOT sync VERSION/CHANGELOG/releases.log back.
# The testing server has no release lifecycle.

echo "Testing deployment finished."
