#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
host="${1:-${DEPLOY_HOST:-root@85.239.60.3}}"
remote_dir="${DEPLOY_PATH:-/opt/new_toggl}"

echo "Deploy target: ${host}:${remote_dir}"

rsync -az \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude '.env' \
  --exclude 'infra/backups' \
  "${root_dir}/" "${host}:${remote_dir}/"

ssh "$host" "cd '${remote_dir}' && bash infra/scripts/prod-compose.sh"
ssh "$host" "if docker ps --format '{{.Names}}' | grep -qx 'motio-caddy'; then docker exec motio-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 && echo 'Caddy config reloaded.' || (docker restart motio-caddy >/dev/null && echo 'Caddy container restarted (reload failed).'); fi"

scp "${host}:${remote_dir}/VERSION" "${root_dir}/VERSION"
scp "${host}:${remote_dir}/infra/releases.log" "${root_dir}/infra/releases.log"
scp "${host}:${remote_dir}/CHANGELOG.md" "${root_dir}/CHANGELOG.md"
scp "${host}:${remote_dir}/CHANGELOG.en.md" "${root_dir}/CHANGELOG.en.md"

echo "Deployment finished. Synced VERSION, CHANGELOGs and infra/releases.log from server."
