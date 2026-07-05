#!/usr/bin/env bash
set -euo pipefail

# Restore Supabase storage blobs (avatars, task-media) from a storage-*.tar.gz
# archive produced by the backup service (createStorageBackup: `tar cz -C
# /storage-blobs .`). The blobs live in the `supabase_storage_data` docker
# volume, which the backup container mounts read-only — so restore is a host
# operation, not a backup-service endpoint. We write into the volume through a
# throwaway container that mounts it read-write.
#
# Safety: before overwriting, we snapshot the current volume contents to a
# timestamped pre-restore archive, so a bad restore is reversible.
#
# Usage:
#   infra/scripts/restore-storage.sh <path/to/storage-YYYY...tar.gz> [--yes]
#
# Env overrides:
#   STORAGE_VOLUME   docker volume name        (default: supabase_storage_data)
#   SNAPSHOT_DIR     where to write the safety  (default: ./backups)
#   HELPER_IMAGE     image used for tar         (default: alpine:3)

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root_dir"

STORAGE_VOLUME="${STORAGE_VOLUME:-supabase_storage_data}"
SNAPSHOT_DIR="${SNAPSHOT_DIR:-./backups}"
HELPER_IMAGE="${HELPER_IMAGE:-alpine:3}"

archive="${1:-}"
assume_yes=0
for arg in "$@"; do
  [[ "$arg" == "--yes" || "$arg" == "-y" ]] && assume_yes=1
done

die() { echo "ERROR: $*" >&2; exit 1; }

[[ -n "$archive" ]] || die "Usage: $0 <storage-*.tar.gz> [--yes]"
[[ -f "$archive" ]] || die "Archive not found: $archive"
[[ "$archive" == *.tar.gz ]] || die "Expected a .tar.gz archive, got: $archive"

command -v docker >/dev/null 2>&1 || die "Docker is required."
docker info >/dev/null 2>&1 || die "Docker is not running."
docker volume inspect "$STORAGE_VOLUME" >/dev/null 2>&1 \
  || die "Docker volume '$STORAGE_VOLUME' does not exist. Create it and bring the stack up first."

# Absolute paths so container mounts are unambiguous.
archive_abs="$(cd "$(dirname "$archive")" && pwd)/$(basename "$archive")"
mkdir -p "$SNAPSHOT_DIR"
snapshot_dir_abs="$(cd "$SNAPSHOT_DIR" && pwd)"

echo "==> Validating archive integrity (tar -tz)…"
entry_count="$(tar -tzf "$archive_abs" | wc -l | tr -d ' ')"
[[ "$entry_count" -gt 0 ]] || die "Archive is empty or unreadable: $archive_abs"
echo "    archive OK — $entry_count entries"

echo
echo "About to RESTORE storage blobs:"
echo "  archive : $archive_abs"
echo "  volume  : $STORAGE_VOLUME  (will be CLEARED, then extracted into)"
echo "  snapshot: $snapshot_dir_abs/storage-prerestore-<ts>.tar.gz"
echo
if [[ "$assume_yes" -ne 1 ]]; then
  read -r -p "Type 'restore' to proceed: " confirm
  [[ "$confirm" == "restore" ]] || die "Aborted by user."
fi

ts="$(date -u +%Y%m%dT%H%M%SZ)"
snapshot_name="storage-prerestore-${ts}.tar.gz"
echo "==> Snapshotting current volume to $snapshot_name (safety net)…"
docker run --rm \
  -v "$STORAGE_VOLUME":/dst:ro \
  -v "$snapshot_dir_abs":/out \
  "$HELPER_IMAGE" \
  sh -c "tar czf /out/${snapshot_name} -C /dst . && echo '    snapshot bytes:' \$(wc -c </out/${snapshot_name})"

echo "==> Clearing volume and extracting archive…"
docker run --rm \
  -v "$STORAGE_VOLUME":/dst \
  -v "$archive_abs":/src/archive.tar.gz:ro \
  "$HELPER_IMAGE" \
  sh -c "set -e; rm -rf /dst/* /dst/..?* /dst/.[!.]* 2>/dev/null || true; tar xzf /src/archive.tar.gz -C /dst; echo '    restored entries:' \$(find /dst -mindepth 1 | wc -l)"

echo
echo "==> Storage restore complete."
echo "    If something looks wrong, roll back with:"
echo "    STORAGE_VOLUME=$STORAGE_VOLUME $0 $snapshot_dir_abs/$snapshot_name --yes"
