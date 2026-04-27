#!/usr/bin/env bash
# Разворачивает GlitchTip (self-hosted error tracking) на продакшен-сервере.
#
# Что делает:
#   1. Синхронизирует docker-compose.glitchtip.yml на сервер
#   2. Создаёт Docker-сеть motio-glitchtip (если ещё нет)
#   3. Подключает Caddy к этой сети (если ещё не подключён)
#   4. Синхронизирует Caddyfile in-place и перезагружает Caddy
#   5. Поднимает контейнеры GlitchTip (или обновляет если уже запущены)
#   6. Подсказывает что делать при первом запуске
#
# Использование:
#   ./infra/scripts/deploy-glitchtip.sh [host]
#   make deploy-glitchtip
#
# Необходимые переменные в .env на сервере:
#   GLITCHTIP_DB_PASSWORD  — пароль для postgres GlitchTip
#   GLITCHTIP_SECRET_KEY   — секретный ключ Django (50+ случайных символов)
#   GLITCHTIP_FROM_EMAIL   — адрес отправителя писем
#   GLITCHTIP_EMAIL_URL    — SMTP строка подключения (smtp://user:pass@host:587)
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
host="${1:-${DEPLOY_HOST:-root@94.141.162.237}}"
remote_dir="${DEPLOY_PATH:-/opt/new_toggl}"

echo "==> GlitchTip deploy target: ${host}:${remote_dir}"

# 1. Синхронизировать compose-файл на сервер
echo "==> Syncing docker-compose.glitchtip.yml..."
rsync -az --itemize-changes \
  "${root_dir}/infra/docker-compose.glitchtip.yml" \
  "${host}:${remote_dir}/infra/docker-compose.glitchtip.yml"

# 2. Синхронизировать Caddyfile in-place (чтобы не сломать bind mount)
echo "==> Syncing Caddyfile..."
rsync -az --inplace \
  "${root_dir}/infra/caddy/Caddyfile" \
  "${host}:${remote_dir}/infra/caddy/Caddyfile"

# 3. На сервере: создать сеть, подключить Caddy, поднять контейнеры, перезагрузить Caddy
ssh "$host" bash << REMOTE
set -euo pipefail
cd "${remote_dir}"

echo "==> Creating Docker network motio-glitchtip (skip if exists)..."
docker network create motio-glitchtip 2>/dev/null && echo "Network created." || echo "Network already exists, skipping."

echo "==> Connecting Caddy to motio-glitchtip (skip if already connected)..."
docker network connect motio-glitchtip motio-caddy 2>/dev/null && echo "Caddy connected." || echo "Caddy already connected, skipping."

echo "==> Starting GlitchTip containers..."
docker compose -f infra/docker-compose.glitchtip.yml --env-file .env pull --quiet
docker compose -f infra/docker-compose.glitchtip.yml --env-file .env up -d

echo "==> Reloading Caddy config..."
docker exec motio-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile 2>/dev/null \
  && echo "Caddy config reloaded." \
  || (docker restart motio-caddy > /dev/null && echo "Caddy restarted (reload failed).")

echo ""
echo "==> GlitchTip containers status:"
docker compose -f infra/docker-compose.glitchtip.yml --env-file .env ps
REMOTE

echo ""
echo "==> Deploy finished."
echo ""
echo "Если это первый запуск — создай admin-аккаунт:"
echo "  ssh ${host}"
echo "  docker exec -it glitchtip-web ./manage.py createsuperuser"
echo ""
echo "Затем открой: https://errors.motio.nikog.net"
