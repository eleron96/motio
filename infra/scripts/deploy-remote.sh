#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
host="${1:-${DEPLOY_HOST:-root@94.141.162.237}}"
remote_dir="${DEPLOY_PATH:-/opt/new_toggl}"

echo "Deploy target: ${host}:${remote_dir}"

rsync_output="$(
  rsync -az --itemize-changes \
    --exclude '.git' \
    --exclude '.claude/' \
    --exclude 'node_modules' \
    --exclude 'dist' \
    --exclude '.env' \
    --exclude 'infra/backups' \
    --exclude 'infra/caddy/Caddyfile' \
    "${root_dir}/" "${host}:${remote_dir}/"
)"

if [[ -n "${rsync_output}" ]]; then
  printf "%s\n" "${rsync_output}"
fi

keycloak_theme_changed="false"
if printf "%s\n" "${rsync_output}" | grep -q 'infra/keycloak/themes/'; then
  keycloak_theme_changed="true"
fi

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

if [[ "${keycloak_theme_changed}" == "true" ]]; then
  echo "Keycloak theme changes detected. Recreating keycloak to flush theme cache."
  ssh "$host" "cd '${remote_dir}' && docker compose -f infra/docker-compose.prod.yml --env-file .env up -d --force-recreate --no-deps keycloak"
fi

# Ensure caddy can reach monitor service by DNS name `beszel` on a shared user-defined network.
# `host.docker.internal:8090` is not reachable when beszel is bound to 127.0.0.1 on host.
ssh "$host" "if docker ps --format '{{.Names}}' | grep -qx 'motio-caddy' && docker ps --format '{{.Names}}' | grep -qx 'beszel'; then \
  docker network inspect motio-monitor >/dev/null 2>&1 || docker network create motio-monitor >/dev/null; \
  docker network connect motio-monitor motio-caddy >/dev/null 2>&1 || true; \
  docker network connect motio-monitor beszel >/dev/null 2>&1 || true; \
  echo 'Ensured motio-monitor network for caddy<->beszel.'; \
fi"

ssh "$host" "if docker ps --format '{{.Names}}' | grep -qx 'motio-caddy'; then \
  host_hash=\$(sha1sum '${remote_dir}/infra/caddy/Caddyfile' | awk '{print \$1}'); \
  container_hash=\$(docker exec motio-caddy sha1sum /etc/caddy/Caddyfile 2>/dev/null | awk '{print \$1}' || true); \
  if [ -n \"\$container_hash\" ] && [ \"\$host_hash\" != \"\$container_hash\" ]; then \
    docker restart motio-caddy >/dev/null && echo 'Caddy container restarted (Caddyfile updated).'; \
  fi; \
  docker exec motio-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 && echo 'Caddy config reloaded.' || (docker restart motio-caddy >/dev/null && echo 'Caddy container restarted (reload failed).'); \
fi"

if [[ "${RUN_FIREWALL_HARDEN:-0}" == "1" && "${SKIP_FIREWALL_HARDEN:-0}" != "1" ]]; then
  bash "${root_dir}/infra/scripts/harden-firewall.sh" "$host"
else
  echo "Skipping firewall hardening (set RUN_FIREWALL_HARDEN=1 to enforce)."
fi

scp "${host}:${remote_dir}/VERSION" "${root_dir}/VERSION"
scp "${host}:${remote_dir}/infra/releases.log" "${root_dir}/infra/releases.log"
scp "${host}:${remote_dir}/CHANGELOG.md" "${root_dir}/CHANGELOG.md"
scp "${host}:${remote_dir}/CHANGELOG.en.md" "${root_dir}/CHANGELOG.en.md"

echo "Deployment finished. Synced VERSION, CHANGELOGs and infra/releases.log from server."
