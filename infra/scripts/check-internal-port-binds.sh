#!/usr/bin/env bash
set -euo pipefail

env_file=".env"
allow_public_ports="80,443"
compose_files=()

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --env-file)
      env_file="$2"
      shift 2
      ;;
    --allow-public-ports)
      allow_public_ports="$2"
      shift 2
      ;;
    *)
      compose_files+=("$1")
      shift
      ;;
  esac
done

if [[ "${#compose_files[@]}" -eq 0 ]]; then
  echo "Usage: $0 [--env-file .env] [--allow-public-ports 80,443] <compose-file> [<compose-file> ...]" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required to validate internal port binds." >&2
  exit 1
fi

compose_cmd=(docker compose)
for compose_file in "${compose_files[@]}"; do
  compose_cmd+=(-f "$compose_file")
done
compose_cmd+=(--env-file "$env_file" config --format json)

config_json="$("${compose_cmd[@]}")"

COMPOSE_CONFIG_JSON="$config_json" python3 - "$allow_public_ports" <<'PY'
import json
import os
import sys

allowed_public_ports = {
    value.strip()
    for value in sys.argv[1].split(",")
    if value.strip()
}

try:
    config = json.loads(os.environ["COMPOSE_CONFIG_JSON"])
except json.JSONDecodeError as exc:
    print(f"Failed to parse docker compose config JSON: {exc}", file=sys.stderr)
    sys.exit(1)

violations = []

for service_name, service in (config.get("services") or {}).items():
    ports = service.get("ports") or []
    for port in ports:
        if isinstance(port, str):
            continue
        published = str(port.get("published", "")).strip()
        host_ip = str(port.get("host_ip", "")).strip()
        target = str(port.get("target", "")).strip()
        if not published:
            continue
        if published in allowed_public_ports:
            continue
        if host_ip in {"127.0.0.1", "::1"}:
            continue
        violations.append(
            f"{service_name}: published {published}->{target} must be bound to 127.0.0.1/::1, current host_ip='{host_ip or '0.0.0.0'}'"
        )

if violations:
    print("Unsafe internal port binds detected:", file=sys.stderr)
    for violation in violations:
        print(f"- {violation}", file=sys.stderr)
    sys.exit(1)
PY
