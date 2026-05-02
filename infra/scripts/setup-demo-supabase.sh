#!/usr/bin/env bash
# Bootstrap a Supabase project (cloud or self-hosted) into a working
# demo backend for the /demo sandbox.
#
# What it does, in order:
#   1. Verifies psql can reach $DATABASE_URL.
#   2. Applies every prod schema migration from infra/supabase/migrations.
#   3. Applies the demo extension layer from infra/supabase/demo
#      (template tables, seed content, RPCs, cron). Cron requires the
#      pg_cron extension; enable it in Database → Extensions before
#      running this script.
#
# Usage:
#   DATABASE_URL='postgresql://postgres:PASSWORD@HOST:5432/postgres' \
#     ./infra/scripts/setup-demo-supabase.sh
#
# The DATABASE_URL must point at the *demo* Supabase project — never the
# production one. The script aborts if the database already contains
# user-owned workspaces (a weak guard against pointing at the wrong DB).
#
# Anonymous sign-ins still need to be enabled manually in the demo
# project's Auth settings; this script does not configure auth.

set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root_dir"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required." >&2
  echo "Example: DATABASE_URL='postgresql://postgres:PASS@db.example.supabase.co:5432/postgres'" >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required (install postgresql-client)." >&2
  exit 1
fi

# Sanity ping
if ! psql "$DATABASE_URL" -c 'select 1' >/dev/null 2>&1; then
  echo "Cannot connect to $DATABASE_URL" >&2
  exit 1
fi

# Refuse to run against a database that already contains user data.
existing_ws=$(psql "$DATABASE_URL" -tA -c \
  "select count(*) from information_schema.tables where table_schema='public' and table_name='workspaces'" \
  2>/dev/null || echo 0)

if [[ "$existing_ws" -gt 0 ]]; then
  ws_count=$(psql "$DATABASE_URL" -tA -c "select count(*) from public.workspaces" 2>/dev/null || echo 0)
  if [[ "$ws_count" -gt 0 ]]; then
    cat >&2 <<MSG
Refusing to run: database already contains $ws_count workspace(s).
This script is only meant for a fresh demo project. If you really want
to re-seed, drop the schema first:
  psql "\$DATABASE_URL" -c 'drop schema public cascade; create schema public;'
MSG
    exit 1
  fi
fi

echo "==> Applying prod schema migrations to demo project"
prod_count=0
for f in "$root_dir"/infra/supabase/migrations/00*.sql; do
  printf "    %s ... " "$(basename "$f")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"
  printf "ok\n"
  prod_count=$((prod_count + 1))
done
echo "    $prod_count prod migrations applied"

echo "==> Applying demo extension layer"
demo_count=0
for f in "$root_dir"/infra/supabase/demo/00*.sql; do
  printf "    %s ... " "$(basename "$f")"
  if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f" 2>/tmp/demo-setup-err.log; then
    printf "ok\n"
    demo_count=$((demo_count + 1))
  else
    rc=$?
    base="$(basename "$f")"
    err="$(cat /tmp/demo-setup-err.log)"
    if [[ "$base" == "0005_demo_cleanup_cron.sql" && "$err" == *"pg_cron"* ]]; then
      printf "SKIPPED (pg_cron not enabled)\n" >&2
      echo "       Enable pg_cron in Database → Extensions, then re-run just this file:" >&2
      echo "       psql \"\$DATABASE_URL\" -f $f" >&2
      continue
    fi
    printf "FAILED\n%s\n" "$err" >&2
    exit "$rc"
  fi
done
echo "    $demo_count demo files applied"

echo
echo "Demo Supabase project is ready."
echo "Next:"
echo "  1. Enable Anonymous sign-ins in Auth → Providers (if not already)."
echo "  2. Set VITE_SUPABASE_URL_DEMO and VITE_SUPABASE_ANON_KEY_DEMO in"
echo "     the frontend's build environment."
