#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root_dir"
infra_dir="$root_dir/infra"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. Please install Docker Desktop." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start Docker Desktop and retry." >&2
  exit 1
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI not found. Falling back to docker-compose." >&2
  exec ./infra/scripts/dev-compose.sh
fi

(
  cd "$infra_dir"
  supabase start
)

SUPABASE_WORKDIR="$infra_dir" ROOT_DIR="$root_dir" node - <<'NODE'
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const infraDir = process.env.SUPABASE_WORKDIR || process.cwd();
const rootDir = process.env.ROOT_DIR || process.cwd();

let statusRaw = '';
try {
  statusRaw = execSync('supabase status --output json', { encoding: 'utf8', cwd: infraDir });
} catch (error) {
  console.error('Failed to read supabase status.');
  process.exit(1);
}

let status = {};
try {
  status = JSON.parse(statusRaw);
} catch (error) {
  console.error('Failed to parse supabase status JSON.');
  process.exit(1);
}

const url = status.API_URL || status.api_url || status.apiUrl;
const anon = status.ANON_KEY || status.anon_key || status.anonKey;
const service = status.SERVICE_ROLE_KEY || status.service_role_key || status.serviceRoleKey;

if (!url || !anon) {
  console.error('Supabase status output is missing API_URL or ANON_KEY.');
  process.exit(1);
}

const envPath = path.join(rootDir, '.env');
const parseEnv = (content) => Object.fromEntries(content.split('\n')
  .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
  .map((line) => {
    const idx = line.indexOf('=');
    return [line.slice(0, idx), line.slice(idx + 1)];
  }));

const existing = fs.existsSync(envPath) ? parseEnv(fs.readFileSync(envPath, 'utf8')) : {};
existing.VITE_SUPABASE_URL = url;
existing.VITE_SUPABASE_ANON_KEY = anon;

const serialized = Object.entries(existing).map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
fs.writeFileSync(envPath, serialized);

if (service) {
  const functionsEnv = `SUPABASE_URL=${url}\nSUPABASE_SERVICE_ROLE_KEY=${service}\nAPP_URL=http://localhost:5173\n`;
  fs.writeFileSync(path.join(infraDir, '.supabase-functions.env'), functionsEnv);
}
console.log('Updated .env');
NODE

if [[ -f "$infra_dir/.supabase-functions.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$infra_dir/.supabase-functions.env"
  set +a
fi

pushd "$infra_dir" >/dev/null
supabase functions serve main > .supabase-functions.log 2>&1 &
functions_pid=$!
popd >/dev/null

cleanup() {
  if kill -0 "$functions_pid" >/dev/null 2>&1; then
    kill "$functions_pid"
  fi
}
trap cleanup EXIT

npm run dev
