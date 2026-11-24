#!/usr/bin/env bash
set -euo pipefail

# PULL_IMAGES=1 make deploy / deploy-testing: fetch the newest build of the images
# that follow a version line (keycloak:26.8, nginx:1.30-alpine, postgres:15-alpine,
# liquibase:4.27 — any tag that is not a full x.y.z version) and of the base images
# of web and backup. A deploy never pulls, so without this they stay at the build
# first fetched on the server. Images pinned to an exact version are left alone:
# `up` fetches those when they are missing.
#
# Docker Hub counts anonymous pulls per address, and a hosting provider's shared
# IPv6 prefix runs out of them (429). An official image that Docker Hub refuses is
# taken from its mirror, public.ecr.aws/docker/library, and tagged with the name
# compose expects. An image that cannot be fetched at all but is already here only
# warns; one that is missing stops the deploy before anything has started.
#
#   infra/scripts/pull-line-images.sh <docker compose args…>

is_full_version() { [[ "${1##*:}" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+ ]]; }

pull_one() {
  local image="$1"
  if docker pull --quiet "$image" >/dev/null 2>&1; then
    echo "  pulled $image"
    return 0
  fi
  # Official images have no registry and no namespace: "nginx:1.30-alpine".
  if [[ "$image" != */* ]]; then
    local mirror="public.ecr.aws/docker/library/$image"
    if docker pull --quiet "$mirror" >/dev/null 2>&1 && docker tag "$mirror" "$image"; then
      echo "  pulled $image (from the mirror)"
      return 0
    fi
  fi
  if docker image inspect "$image" >/dev/null 2>&1; then
    echo "  Warning: could not pull $image; keeping the copy already here." >&2
    return 0
  fi
  echo "  Could not pull $image and it is not on this server." >&2
  return 1
}

echo "PULL_IMAGES: fetching the newest builds..."
while IFS= read -r image; do
  # No tag: an image compose builds here (infra-web, infra-backup).
  [[ -n "$image" && "$image" == *:* ]] || continue
  is_full_version "$image" && continue
  pull_one "$image"
done < <(docker compose "$@" config --images | sort -u)

# Base images of what is built here. That registry is not always reachable from
# the server either, and the build then uses the copy it has.
while IFS= read -r image; do
  [[ -n "$image" ]] || continue
  docker pull --quiet "$image" >/dev/null 2>&1 && echo "  pulled $image" \
    || echo "  Warning: could not pull $image; the build uses the copy already here." >&2
done < <(grep -hE '^FROM ' infra/web/Dockerfile infra/backup-service/Dockerfile | awk '{print $2}' | sort -u)
