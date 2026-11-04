#!/usr/bin/env bash
set -euo pipefail

# Takes a restorable snapshot of production data BEFORE new service images
# start. GoTrue, Storage and Realtime migrate their own schemas when they
# start, and some of those migrations are one-way, so the pre-migration dump
# that prod-compose.sh takes later is already "after". This one is "before".
#
# Writes infra/backups/snapshots/<time>/ (mode 700, it holds all data):
#   db.tar.gz       physical copy of the database (pg_basebackup, consistent,
#                   taken while it runs — no downtime)
#   storage.tar.gz  uploaded files (the storage volume)
#   images.txt      the images that were running, to go back to
# Keeps the newest SNAPSHOT_KEEP (default 5). Restore: docs/operations.md,
# «Roll back a service upgrade».
#
#   infra/scripts/prod-snapshot.sh <env-file> <compose-file> [more compose files]

env_file="${1:?env file}"
shift
compose_args=()
for file in "$@"; do compose_args+=(-f "$file"); done
[[ ${#compose_args[@]} -gt 0 ]] || { echo "Usage: $0 <env-file> <compose-file>..." >&2; exit 1; }
compose=(docker compose "${compose_args[@]}" --env-file "$env_file")

storage_volume="${SNAPSHOT_STORAGE_VOLUME:-supabase_storage_data}"
keep="${SNAPSHOT_KEEP:-5}"
root="infra/backups/snapshots"
stamp="$(date +%Y%m%d-%H%M%S)"
dir="$root/$stamp"

db_container="$("${compose[@]}" ps -q --status running db 2>/dev/null || true)"
if [[ -z "$db_container" ]]; then
  echo "Snapshot skipped: the database is not running yet (first deploy)."
  exit 0
fi

mkdir -p "$dir"
chmod 700 "$root" "$dir"
tmp="/tmp/motio-snapshot-$stamp"

cleanup() {
  docker exec -u postgres "$db_container" rm -rf "$tmp" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Snapshot: database (pg_basebackup)..."
docker exec -u postgres "$db_container" pg_basebackup -U supabase_admin -D "$tmp" -X stream -c fast
docker exec "$db_container" tar -C "$tmp" -czf - . > "$dir/db.tar.gz"

if docker volume inspect "$storage_volume" >/dev/null 2>&1; then
  echo "Snapshot: uploaded files ($storage_volume)..."
  db_image="$(docker inspect "$db_container" --format '{{.Config.Image}}')"
  # GNU tar from the db image keeps owners and the xattrs storage-api relies on.
  docker run --rm -v "$storage_volume":/s:ro --entrypoint tar "$db_image" \
    --xattrs --xattrs-include='*' -C /s -czf - . > "$dir/storage.tar.gz"
fi

docker ps --format '{{.Names}} {{.Image}}' | sort > "$dir/images.txt"
[[ -f VERSION ]] && cp VERSION "$dir/VERSION"

for file in "$dir"/*.tar.gz; do
  gzip -t "$file" || { echo "Snapshot archive is damaged: $file" >&2; exit 1; }
done

echo "Snapshot created: $dir ($(du -sh "$dir" | cut -f1))"

mapfile -t old < <(ls -1d "$root"/*/ 2>/dev/null | sort | head -n -"$keep")
for path in "${old[@]}"; do
  rm -rf "$path"
done
