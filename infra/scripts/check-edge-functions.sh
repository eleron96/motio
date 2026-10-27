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
# The code predates this check and carries known type errors (mostly
# untyped Supabase rows and unnarrowed result unions). The step is a ratchet:
# it fails only when the error count grows past the baseline, so new code is
# checked without blocking on the backlog. After fixing errors, lower it:
#   infra/scripts/check-edge-functions.sh --write-baseline
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

BASELINE_FILE="infra/scripts/edge-typecheck-baseline.txt"
CONFIG="$PWD/infra/supabase/deno.check.json"

set +e
output="$(cd infra/supabase/functions && deno check --no-lock --config "$CONFIG" main/index.ts 2>&1)"
status=$?
set -e

clean_output="$(printf '%s\n' "$output" | sed 's/\x1b\[[0-9;]*m//g' | grep -v '^Download ' || true)"
errors="$(printf '%s\n' "$clean_output" | grep -cE 'TS[0-9]+ \[ERROR\]' || true)"

if [[ $status -ne 0 && $errors -eq 0 ]]; then
  # Not a type error: unresolved import, syntax error, network failure.
  printf '%s\n' "$clean_output" >&2
  echo "deno check failed before typechecking (see above)." >&2
  exit 1
fi

if [[ "${1:-}" == "--write-baseline" ]]; then
  echo "$errors" > "$BASELINE_FILE"
  echo "Baseline set to $errors type errors."
  exit 0
fi

baseline="$(tr -d '[:space:]' < "$BASELINE_FILE")"

if (( errors > baseline )); then
  printf '%s\n' "$clean_output" >&2
  echo "::error::Edge Functions: $errors type errors, baseline is $baseline. Fix the new ones (listed above)." >&2
  exit 1
fi

if (( errors < baseline )); then
  echo "Edge Functions: $errors type errors, below the baseline of $baseline — lower it with --write-baseline."
  exit 0
fi

echo "Edge Functions: $errors type errors (baseline $baseline), no new ones."
