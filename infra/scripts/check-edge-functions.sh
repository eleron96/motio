#!/usr/bin/env bash
set -euo pipefail

# CI typecheck for the Edge Functions (infra/supabase/functions, Deno). They are
# outside tsconfig.app.json, so `npm run typecheck` never sees them.
#
# main/index.ts imports every function, so one `deno check` covers them all.
# Strictness matches the frontend (strictNullChecks, no full strict) via
# infra/supabase/deno.check.json — kept outside functions/ so the edge-runtime
# container (which mounts only that folder) never picks it up.
#
# Any type error fails the step.
#
# Needs `deno` 1.40.x (the version inside supabase/edge-runtime v1.41.2).
# Without a local install:
#   docker run --rm -v "$PWD:/repo:ro" -w /repo denoland/deno:1.40.3 \
#     bash infra/scripts/check-edge-functions.sh

if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  cd "$root_dir"
fi

if ! command -v deno >/dev/null 2>&1; then
  echo "deno is required to typecheck the Edge Functions." >&2
  exit 1
fi

CONFIG="$PWD/infra/supabase/deno.check.json"

set +e
output="$(cd infra/supabase/functions && deno check --no-lock --config "$CONFIG" main/index.ts 2>&1)"
status=$?
set -e

if [[ $status -ne 0 ]]; then
  printf '%s\n' "$output" | sed 's/\x1b\[[0-9;]*m//g' | grep -v '^Download ' >&2 || true
  echo "::error::Edge Functions typecheck failed (see above)." >&2
  exit 1
fi

echo "Edge Functions: no type errors."
