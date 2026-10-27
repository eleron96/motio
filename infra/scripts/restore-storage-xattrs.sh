#!/usr/bin/env bash
set -euo pipefail

# Re-apply the extended attributes storage-api needs on restored blobs.
#
# Storage-api's file backend keeps each object's Content-Type and
# Cache-Control in xattrs (user.supabase.content-type / user.supabase.cache-control)
# and answers HTTP 500 for a blob without them. Neither the storage archives
# nor the per-file S3 copies carry xattrs, so after putting blobs back into
# the volume we rebuild them from storage.objects.metadata — the database is
# the source of truth and is restored first.
#
# Usage:
#   infra/scripts/restore-storage-xattrs.sh
#
# Env overrides:
#   STORAGE_VOLUME   docker volume name             (default: supabase_storage_data)
#   DB_CONTAINER     running Supabase DB container  (default: infra-db-1)
#   BLOB_PREFIX      tenant/backend-bucket dirs     (default: stub/stub)
#   HELPER_IMAGE     image used for setfattr        (default: alpine:3)

STORAGE_VOLUME="${STORAGE_VOLUME:-supabase_storage_data}"
DB_CONTAINER="${DB_CONTAINER:-infra-db-1}"
BLOB_PREFIX="${BLOB_PREFIX:-stub/stub}"
HELPER_IMAGE="${HELPER_IMAGE:-alpine:3}"

die() { echo "ERROR: $*" >&2; exit 1; }

docker volume inspect "$STORAGE_VOLUME" >/dev/null 2>&1 || die "Docker volume '$STORAGE_VOLUME' does not exist."
docker inspect "$DB_CONTAINER" >/dev/null 2>&1 || die "DB container '$DB_CONTAINER' is not running; restore the database first."

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

# One line per stored object: <path inside the volume>\t<content-type>\t<cache-control>
docker exec "$DB_CONTAINER" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -qtA -F $'\t' -c "
  select '${BLOB_PREFIX}/' || bucket_id || '/' || name || '/' || version,
         coalesce(nullif(metadata->>'mimetype', ''), 'application/octet-stream'),
         coalesce(nullif(metadata->>'cacheControl', ''), 'no-cache')
  from storage.objects
  where version is not null
" > "$work_dir/objects.tsv"

echo "==> Re-applying storage xattrs for $(grep -c . "$work_dir/objects.tsv" || true) object(s) from storage.objects…"
docker run --rm \
  -v "$STORAGE_VOLUME":/dst \
  -v "$work_dir":/work:ro \
  "$HELPER_IMAGE" \
  sh -c '
    apk add -q attr >/dev/null 2>&1 || { echo "cannot install attr (setfattr)" >&2; exit 1; }
    tab=$(printf "\t")
    applied=0; missing=0
    while IFS="$tab" read -r rel content_type cache_control; do
      [ -n "$rel" ] || continue
      if [ -f "/dst/$rel" ]; then
        setfattr -n user.supabase.content-type -v "$content_type" "/dst/$rel"
        setfattr -n user.supabase.cache-control -v "$cache_control" "/dst/$rel"
        applied=$((applied + 1))
      else
        missing=$((missing + 1))
        echo "    missing blob: $rel"
      fi
    done < /work/objects.tsv
    echo "    xattrs applied: $applied, blobs missing: $missing"
  '
