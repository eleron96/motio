#!/usr/bin/env bash
set -euo pipefail

caddy_container="${1:-motio-caddy}"
shift || true

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required to ensure Caddy network access." >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$caddy_container"; then
  echo "Caddy container '$caddy_container' is not running; skipping network access check."
  exit 0
fi

if [[ "$#" -eq 0 ]]; then
  target_containers=(
    infra-gateway-1
    infra-keycloak-1
    infra-web-1
    infra-oauth2-proxy-1
    beszel
  )
else
  target_containers=("$@")
fi

ensure_network_connected() {
  local network_name="$1"
  docker network inspect "$network_name" >/dev/null 2>&1 || return 0
  docker network connect "$network_name" "$caddy_container" >/dev/null 2>&1 || true
}

networks_to_connect=()

for container_name in "${target_containers[@]}"; do
  if ! docker ps --format '{{.Names}}' | grep -qx "$container_name"; then
    continue
  fi

  while IFS= read -r network_name; do
    case "$network_name" in
      ""|bridge|host|none)
        continue
        ;;
    esac

    already_listed="false"
    for listed in "${networks_to_connect[@]:-}"; do
      if [[ "$listed" == "$network_name" ]]; then
        already_listed="true"
        break
      fi
    done

    if [[ "$already_listed" == "false" ]]; then
      networks_to_connect+=("$network_name")
    fi
  done < <(
    docker inspect -f '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}' "$container_name" 2>/dev/null || true
  )
done

if [[ "${#networks_to_connect[@]}" -eq 0 ]]; then
  echo "No shared user-defined networks found for Caddy upstream access."
  exit 0
fi

for network_name in "${networks_to_connect[@]}"; do
  ensure_network_connected "$network_name"
done

printf 'Ensured Caddy network access: %s\n' "${networks_to_connect[*]}"
