#!/usr/bin/env bash
set -euo pipefail

# Server settings (Admin → Settings) on the owner's servers over ssh:
#
#   make settings CONTOUR=testing                       # list
#   make settings CONTOUR=testing SET=timeline.density=on
#   make settings CONTOUR=testing RESET=timeline.density
#   make settings CONTOUR=prod …                        # asks before changing anything
#
# Runs infra/scripts/motio-settings.sh in the deployed checkout, so the server
# must have a deploy that has it. Self-hosted installs use install.sh settings.

contour="${CONTOUR:-}"
case "$contour" in
  testing)
    host="root@72.56.34.157"
    remote_dir="/opt/motio-test"
    compose="docker compose -f infra/docker-compose.prod.yml -f infra/docker-compose.testing.yml --env-file .env"
    ;;
  prod)
    host="${DEPLOY_HOST:-root@94.141.162.237}"
    remote_dir="${DEPLOY_PATH:-/opt/new_toggl}"
    compose="docker compose -f infra/docker-compose.prod.yml --env-file .env"
    ;;
  *)
    echo "Usage: make settings CONTOUR=testing|prod [SET=key=on|off] [RESET=key]" >&2
    exit 1
    ;;
esac

args=(list)
if [[ -n "${SET:-}" ]]; then
  [[ "$SET" == *=* ]] || { echo "SET=key=on|off" >&2; exit 1; }
  args=(set "${SET%%=*}" "${SET#*=}")
elif [[ -n "${RESET:-}" ]]; then
  args=(reset "$RESET")
fi

# Keys and values are checked against the registry on the server; here only
# make sure nothing but plain words reaches the remote shell.
for arg in "${args[@]}"; do
  [[ "$arg" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "Unexpected characters in: $arg" >&2; exit 1; }
done

if [[ "$contour" == "prod" && "${args[0]}" != "list" ]]; then
  printf 'Change a PRODUCTION setting: %s? [y/N] ' "${args[*]}"
  read -r answer
  [[ "$answer" == "y" || "$answer" == "Y" ]] || { echo "Nothing changed."; exit 1; }
fi

ssh "$host" "cd '$remote_dir' && test -x infra/scripts/motio-settings.sh || { echo 'This server has no motio-settings.sh yet: deploy first.' >&2; exit 1; }; MOTIO_SETTINGS_COMPOSE='$compose' infra/scripts/motio-settings.sh ${args[*]}"
