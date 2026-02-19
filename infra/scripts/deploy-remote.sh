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
  --exclude 'infra/caddy/Caddyfile' \
  "${root_dir}/" "${host}:${remote_dir}/"

# motio-caddy binds a single file (/opt/new_toggl/infra/caddy/Caddyfile -> /etc/caddy/Caddyfile).
# Plain rsync replaces the file via rename, which breaks that bind mount until the container restarts.
# Sync the Caddyfile in-place to keep the inode stable.
rsync -az --inplace \
  "${root_dir}/infra/caddy/Caddyfile" \
  "${host}:${remote_dir}/infra/caddy/Caddyfile"

# Supabase gateway also binds a single file
# (/opt/new_toggl/infra/supabase/nginx.conf -> /etc/nginx/nginx.conf).
# Keep inode stable so `nginx -s reload` inside prod-compose picks up updates.
rsync -az --inplace \
  "${root_dir}/infra/supabase/nginx.conf" \
  "${host}:${remote_dir}/infra/supabase/nginx.conf"

ssh "$host" "cd '${remote_dir}' && bash infra/scripts/prod-compose.sh"
ssh "$host" "if docker ps --format '{{.Names}}' | grep -qx 'motio-caddy'; then \
  host_hash=\$(sha1sum '${remote_dir}/infra/caddy/Caddyfile' | awk '{print \$1}'); \
  container_hash=\$(docker exec motio-caddy sha1sum /etc/caddy/Caddyfile 2>/dev/null | awk '{print \$1}' || true); \
  if [ -n \"\$container_hash\" ] && [ \"\$host_hash\" != \"\$container_hash\" ]; then \
    docker restart motio-caddy >/dev/null && echo 'Caddy container restarted (Caddyfile updated).'; \
  fi; \
  docker exec motio-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 && echo 'Caddy config reloaded.' || (docker restart motio-caddy >/dev/null && echo 'Caddy container restarted (reload failed).'); \
fi"

if [[ "${SKIP_FIREWALL_HARDEN:-0}" != "1" ]]; then
  bash "${root_dir}/infra/scripts/harden-firewall.sh" "$host"
else
  echo "SKIP_FIREWALL_HARDEN=1, skipping firewall hardening."
fi

scp "${host}:${remote_dir}/VERSION" "${root_dir}/VERSION"
scp "${host}:${remote_dir}/infra/releases.log" "${root_dir}/infra/releases.log"
scp "${host}:${remote_dir}/CHANGELOG.md" "${root_dir}/CHANGELOG.md"
scp "${host}:${remote_dir}/CHANGELOG.en.md" "${root_dir}/CHANGELOG.en.md"

echo "Deployment finished. Synced VERSION, CHANGELOGs and infra/releases.log from server."
