#!/usr/bin/env bash
set -euo pipefail

# The maintenance page on the owner's servers, over ssh:
#
#   make maintenance CONTOUR=testing              # is it on?
#   make maintenance CONTOUR=testing STATE=on
#   make maintenance CONTOUR=testing STATE=off
#   make maintenance CONTOUR=prod STATE=on        # asks first
#
# While it is on, Caddy answers every request to the site with a "Motio is
# being updated" page and 503, and nothing reaches the services behind it
# (infra/caddy/Caddyfile, snippet "maintenance"). It is a file in Caddy's data
# volume, so it stays on across a restart of Caddy or of the whole server until
# someone turns it off. Self-hosted installs: docs/self-hosting/updates.md.

contour="${CONTOUR:-}"
state="${STATE:-status}"
case "$contour" in
  testing) host="root@72.56.34.157" ;;
  prod) host="${DEPLOY_HOST:-root@94.141.162.237}" ;;
  *)
    echo "Usage: make maintenance CONTOUR=testing|prod [STATE=on|off]" >&2
    exit 1
    ;;
esac

flag="/data/motio-maintenance"
case "$state" in
  on) remote="touch $flag && echo 'Maintenance page is ON.'" ;;
  off) remote="rm -f $flag && echo 'Maintenance page is off.'" ;;
  status) remote="if [ -e $flag ]; then echo 'Maintenance page is ON.'; else echo 'Maintenance page is off.'; fi" ;;
  *)
    echo "STATE=on|off" >&2
    exit 1
    ;;
esac

if [[ "$contour" == "prod" && "$state" == "on" ]]; then
  printf 'Show the maintenance page to everyone on PRODUCTION? [y/N] '
  read -r answer
  [[ "$answer" == "y" || "$answer" == "Y" ]] || { echo "Nothing changed."; exit 1; }
fi

ssh "$host" "docker exec motio-caddy sh -c \"$remote\""
