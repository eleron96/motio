#!/usr/bin/env bash
set -euo pipefail

# docker compose for a self-hosted install (see docs/self-hosting.md): the
# production compose file + the self-host overlay (+ the TLS overlay when
# MOTIO_MODE=tls), with the install's .env. Any compose arguments pass through:
#
#   infra/scripts/selfhost-compose.sh ps
#   infra/scripts/selfhost-compose.sh logs -f --tail=100 auth
#
# Run from anywhere; it works on the checkout it lives in.

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root_dir"

env_file="${MOTIO_ENV_FILE:-.env}"
if [[ ! -f "$env_file" ]]; then
  echo "Missing $env_file — run infra/scripts/install.sh first." >&2
  exit 1
fi

mode="$(grep -E '^MOTIO_MODE=' "$env_file" | head -n1 | cut -d= -f2- || true)"

files=(-f infra/docker-compose.prod.yml -f infra/docker-compose.selfhost.yml)
if [[ "$mode" == "tls" ]]; then
  files+=(-f infra/docker-compose.selfhost-tls.yml)
fi

export COMPOSE_MENU=0
exec docker compose "${files[@]}" --env-file "$env_file" "$@"
