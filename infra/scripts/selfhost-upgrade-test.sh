#!/usr/bin/env bash
set -euo pipefail

# End-to-end test of a self-hosted install's life, with the real install.sh at
# every step: install an older release, put data in, update to the release
# under test, check, roll back, check, update again, back up, change, restore,
# check. From a PostgreSQL 15 release it also covers the move to 17 and a
# backup set whose database its release cannot start (it must be refused).
# Run weekly and on installer changes by .github/workflows/selfhost-upgrade.yml.
#
#   infra/scripts/selfhost-upgrade-test.sh --from v0.10.61 [--slow-realtime]
#
# Options:
#   --from TAG        release to install first; "latest" = the newest v* tag
#   --to REF          release under test (default HEAD of --repo)
#   --repo PATH       git repository the install clones and updates from
#                     (default: this checkout); REF is tagged there as
#                     selfhost-upgrade-test for the run and untagged after it
#   --work DIR        working folder (default: $TMPDIR/motio-upgrade-test-<instance>)
#   --instance NAME   compose project and volume prefix (default motioupgradetest)
#   --port-base N     gateway N, Keycloak N+1, web N+8 on 127.0.0.1 (default 18080)
#   --slow-realtime   Realtime gets 0.1 CPU: the slow machine that once stopped
#                     the move to PostgreSQL 17 ("45 vs 91")
#   --keep            leave the install, its volumes and the folder afterwards
#
# Needs Docker with Compose 2.24+, git, python3, curl and openssl. On a shared
# server it stays in its own folder, instance and loopback ports, and removes
# everything it created (AGENTS.md §5.6 p.8); it never touches other installs.

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$script_dir/../.." && pwd)"
from="" to="HEAD" work="" instance="motioupgradetest" port_base=18080 slow_realtime=false keep=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --from) from="$2"; shift 2 ;;
    --to) to="$2"; shift 2 ;;
    --repo) repo="$2"; shift 2 ;;
    --work) work="$2"; shift 2 ;;
    --instance) instance="$2"; shift 2 ;;
    --port-base) port_base="$2"; shift 2 ;;
    --slow-realtime) slow_realtime=true; shift ;;
    --keep) keep=true; shift ;;
    -h|--help) sed -n '4,27p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done
[[ -n "$from" ]] || { echo "--from is required (see --help)" >&2; exit 2; }
[[ "$instance" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || { echo "--instance: lowercase letters, digits, - and _" >&2; exit 2; }
if [[ "$from" == "latest" ]]; then
  from="$(git -C "$repo" tag --list 'v*' --sort=-v:refname | head -n1)"
fi
git -C "$repo" rev-parse --verify --quiet "refs/tags/$from" >/dev/null || { echo "no tag $from in $repo" >&2; exit 2; }
to_commit="$(git -C "$repo" rev-parse --verify "$to^{commit}")"
from_commit="$(git -C "$repo" rev-parse --verify "$from^{commit}")"

work="${work:-${TMPDIR:-/tmp}/motio-upgrade-test-$instance}"
gateway_port="$port_base" keycloak_port="$((port_base + 1))" http_port="$((port_base + 8))"
domain="upgrade-test.example"
test_tag="selfhost-upgrade-test"
app="$work/app"
logs="$work/logs"
db="${instance}-db-1"
step_name="preparing"

say() { printf '\n\033[1m=== %s\033[0m\n' "$*"; }
pass() { printf '  ok: %s\n' "$*"; }

# Everything that could explain a failure, then exit 1. Inside a command
# substitution only the message: the caller fails in turn and reports.
fail() {
  if (( BASH_SUBSHELL > 0 )); then
    printf '  error: %s\n' "$*" >&2
    exit 1
  fi
  printf '\n\033[31mFAILED\033[0m in "%s": %s\n' "$step_name" "$*" >&2
  if [[ -d "$app" ]]; then
    (cd "$app" && infra/scripts/selfhost-compose.sh ps -a 2>/dev/null) >&2 || true
    (cd "$app" && infra/scripts/selfhost-compose.sh logs --tail=60 2>/dev/null) > "$logs/compose-on-failure.log" 2>&1 || true
    echo "  compose logs: $logs/compose-on-failure.log" >&2
  fi
  exit 1
}

remove_install() {
  if [[ -d "$app" ]]; then
    (cd "$app" && infra/scripts/selfhost-compose.sh down -v --remove-orphans >/dev/null 2>&1) || true
  fi
  docker ps -aq --filter "name=^${instance}-" | xargs -r docker rm -f >/dev/null 2>&1 || true
  # The PostgreSQL 15 volume is not in the compose file of PostgreSQL 17 releases.
  docker volume ls -q --filter "name=^${instance}_" | xargs -r docker volume rm >/dev/null 2>&1 || true
  docker network ls -q --filter "name=^${instance}_" | xargs -r docker network rm >/dev/null 2>&1 || true
  docker images --format '{{.Repository}}:{{.Tag}}' | grep "^${instance}-" | xargs -r docker rmi >/dev/null 2>&1 || true
}

finish() {
  local status=$?
  git -C "$repo" tag -d "$test_tag" >/dev/null 2>&1 || true
  if [[ "$keep" == "true" ]]; then
    echo "Kept: $app (instance $instance)"
  else
    remove_install
    # The logs stay (the CI artifact), and the mark that the folder is ours.
    find "$work" -mindepth 1 -maxdepth 1 ! -name logs ! -name "$owner_mark" -exec rm -rf {} + 2>/dev/null || true
  fi
  if (( status == 0 )); then
    printf '\n\033[32mPASSED\033[0m: %s → %s\n' "$from" "${to_commit:0:12}"
  fi
}

# Runs one install.sh command, its output in logs/<name>.log (shown on failure).
run() { # name, install.sh arguments…
  local name="$1"; shift
  step_name="$name"
  say "$name: install.sh $*"
  if ! (cd "$app" && infra/scripts/install.sh "$@") > "$logs/$name.log" 2>&1; then
    tail -n 60 "$logs/$name.log" >&2
    fail "install.sh $* exited with an error (log: $logs/$name.log)"
  fi
  grep -E '^\[pg-upgrade\]' "$logs/$name.log" | sed 's/^/  /' || true
}

envv() { grep -E "^$1=" "$app/.env" | head -n1 | cut -d= -f2-; }
sql() { docker exec -i "$db" psql -X -q -tA -v ON_ERROR_STOP=1 -U supabase_admin -d postgres "$@"; }
http_code() { curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$@" || true; }

# --- data -------------------------------------------------------------------

seed() {
  local owner ws status type
  # A person of their own, not the reserve admin: older releases take the
  # reserve admin out of every workspace on each start.
  owner="$(curl -s --max-time 30 -X POST -H "Authorization: Bearer $(envv SERVICE_ROLE_KEY)" \
      -H "apikey: $(envv SERVICE_ROLE_KEY)" -H 'Content-Type: application/json' \
      -d "{\"email\": \"anna@$domain\", \"password\": \"$(openssl rand -hex 16)\", \"email_confirm\": true}" \
      "http://127.0.0.1:$gateway_port/auth/v1/admin/users" \
    | python3 -c 'import json, sys; print(json.load(sys.stdin).get("id", ""))' || true)"
  [[ -n "$owner" ]] || fail "could not create the user who owns the test data"
  sql >/dev/null <<SQL
begin;
select set_config('request.jwt.claims', json_build_object('sub', '$owner', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.ensure_initial_workspace('Upgrade test');
commit;
SQL
  ws="$(sql -c "select id from public.workspaces order by created_at limit 1")"
  status="$(sql -c "select id from public.statuses where workspace_id = '$ws' order by created_at limit 1")"
  type="$(sql -c "select id from public.task_types where workspace_id = '$ws' order by created_at limit 1")"
  sql -c "insert into public.tasks (workspace_id, title, start_date, end_date, status_id, type_id, description)
          select '$ws', 'Task ' || g, current_date + g, current_date + g + 3, '$status', '$type', repeat('ü', g)
          from generate_series(1, 300) g" >/dev/null
  printf 'upgrade test file, ümlaut, %s\n' "$to_commit" > "$work/file.txt"
  [[ "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $(envv SERVICE_ROLE_KEY)" \
        -H "apikey: $(envv SERVICE_ROLE_KEY)" -H 'Content-Type: text/plain' --data-binary @"$work/file.txt" \
        "http://127.0.0.1:$gateway_port/storage/v1/object/task-media/$ws/upgrade-test.txt")" == "200" ]] \
    || fail "could not upload the test file"
  echo "$ws" > "$work/workspace"
  pass "a person with a workspace, 300 tasks and a file in storage"
}

mark() { # title: one task written now, to see whether a restore takes it away
  sql -c "insert into public.tasks (workspace_id, title, start_date, end_date, status_id, type_id)
          select workspace_id, '$1', start_date, end_date, status_id, type_id from public.tasks
          order by created_at limit 1" >/dev/null
}
marked() { sql -c "select count(*) from public.tasks where title = '$1'"; }

# The data fingerprint pg-upgrade-17.sh uses, without auth (the reserve admin
# is synced on every start) and the Liquibase lock: what a restore must bring
# back byte for byte.
fingerprint() {
  sql -f - < "$script_dir/pg-upgrade-17-data.sql" | sort \
    | grep -E '^(public|storage)\.' | grep -v '^public\.databasechangeloglock|'
}

counts() {
  echo "tasks=$(sql -c "select count(*) from public.tasks where title like 'Task %'")" \
       "users=$(sql -c 'select count(*) from auth.users')" \
       "identities=$(sql -c 'select count(*) from auth.identities')" \
       "objects=$(sql -c 'select count(*) from storage.objects')"
}

# Default privileges in public: PostgreSQL 17 images grant anon and
# authenticated on every new object unless the move cleared that. MAINTAIN is
# new in PostgreSQL 17 and left out.
default_acl() {
  sql -c "select pg_get_userbyid(d.defaclrole) || ' ' || d.defaclobjtype::text || ' '
                 || case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end || ' '
                 || string_agg(x.privilege_type, ',' order by x.privilege_type)
          from pg_default_acl d cross join aclexplode(d.defaclacl) x
          where d.defaclnamespace = 'public'::regnamespace and x.privilege_type <> 'MAINTAIN'
          group by d.defaclrole, d.defaclobjtype, x.grantee order by 1"
}

# --- checks -----------------------------------------------------------------

check_running() { # expected commit
  local head exited
  head="$(git -C "$app" rev-parse HEAD)"
  [[ "$head" == "$1" ]] || fail "the checkout is ${head:0:12}, expected ${1:0:12}"
  exited="$(docker ps -a --filter "name=^${instance}-" --format '{{.Names}} {{.Status}}' | grep -v ' Up ' || true)"
  [[ -z "$exited" ]] || fail "containers not running: $exited"
  [[ "$(http_code "http://127.0.0.1:$gateway_port/health")" == "200" ]] || fail "gateway /health"
  [[ "$(http_code "http://127.0.0.1:$gateway_port/auth/v1/health")" == "200" ]] || fail "GoTrue health"
  [[ "$(http_code "http://127.0.0.1:$gateway_port/storage/v1/status")" == "200" ]] || fail "storage status"
  [[ "$(http_code "http://127.0.0.1:$keycloak_port/realms/timeline/.well-known/openid-configuration")" == "200" ]] \
    || fail "Keycloak realm timeline"
  [[ "$(http_code -H "Host: $domain" "http://127.0.0.1:$http_port/")" == "200" ]] || fail "the web app"
  local location
  location="$(curl -s -o /dev/null -D - --max-time 15 -H "Host: $domain" -H 'X-Forwarded-Proto: https' \
    "http://127.0.0.1:$http_port/auth/v1/authorize?provider=keycloak&redirect_to=$(envv APP_URL)/app" \
    | tr -d '\r' | awk 'tolower($1) == "location:" { print $2 }')"
  [[ "$location" == "$(envv KEYCLOAK_PUBLIC_URL)/realms/timeline/protocol/openid-connect/auth"* ]] \
    || fail "sign-in goes to '${location%%\?*}', not to the public Keycloak address"
  # Realtime may still be starting after install.sh returns (a minute on 0.1 CPU);
  # browser tabs reconnect the same way.
  local tries=0
  until realtime_join; do
    (( ++tries < 18 )) || fail "a Realtime client could not join a channel for 3 minutes"
    sleep 10
  done
  pass "Motio ${1:0:12} runs: containers, gateway, GoTrue, storage, Keycloak, web, sign-in redirect, Realtime"
}

check_file() {
  local ws got
  ws="$(cat "$work/workspace")"
  got="$(curl -s --max-time 15 -H "Authorization: Bearer $(envv SERVICE_ROLE_KEY)" -H "apikey: $(envv SERVICE_ROLE_KEY)" \
    "http://127.0.0.1:$gateway_port/storage/v1/object/task-media/$ws/upgrade-test.txt")"
  [[ "$got" == "$(cat "$work/file.txt")" ]] || fail "the uploaded file is not the same"
  pass "the uploaded file is the same"
}

expect_same() { # what, expected, actual
  if [[ "$2" != "$3" ]]; then
    diff <(printf '%s\n' "$2") <(printf '%s\n' "$3") | head -20 >&2 || true
    fail "$1 differs"
  fi
  pass "$1 as before"
}

# One websocket client joins a channel, as a browser tab does. On releases
# with the old Realtime this is also what creates its tenant tables.
realtime_join() {
  python3 - "$gateway_port" "$(envv ANON_KEY)" <<'PY'
import base64, json, os, socket, struct, sys, time
port, key = int(sys.argv[1]), sys.argv[2]
sock = socket.create_connection(("127.0.0.1", port), timeout=30)
sock.sendall((f"GET /realtime/v1/websocket?apikey={key}&vsn=1.0.0 HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n"
              "Upgrade: websocket\r\nConnection: Upgrade\r\n"
              f"Sec-WebSocket-Key: {base64.b64encode(os.urandom(16)).decode()}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
if b" 101 " not in sock.recv(4096).split(b"\r\n")[0]:
    sys.exit(1)
data = json.dumps({"topic": "realtime:upgrade-test", "event": "phx_join", "ref": "1",
                   "payload": {"config": {"broadcast": {"self": False}, "presence": {"key": ""},
                                          "postgres_changes": []}, "access_token": key}}).encode()
mask = os.urandom(4)
header = bytes([0x81]) + (bytes([0x80 | len(data)]) if len(data) < 126 else bytes([0xFE]) + struct.pack(">H", len(data)))
sock.sendall(header + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))
buffer, deadline = b"", time.time() + 30
while time.time() < deadline and b"phx_reply" not in buffer:
    chunk = sock.recv(65536)
    if not chunk:
        break
    buffer += chunk
sys.exit(0 if b'"status":"ok"' in buffer else 1)
PY
}

postgres_major() { sql -c 'show server_version_num' | cut -c1-2; }

# --- run --------------------------------------------------------------------

# Cleaning up removes every container, volume and image whose name starts with
# the instance: only ever for an instance this test created (its folder holds
# the mark), never for one that happens to share the prefix.
owner_mark=".selfhost-upgrade-test"
if [[ ! -f "$work/$owner_mark" ]]; then
  [[ ! -e "$work" ]] || { echo "$work exists and is not a folder of this test." >&2; exit 2; }
  if [[ -n "$(docker ps -aq --filter "name=^${instance}-")$(docker volume ls -q --filter "name=^${instance}_")" ]]; then
    echo "Docker already has containers or volumes named ${instance}…: pick another --instance." >&2
    exit 2
  fi
fi
mkdir -p "$work"
touch "$work/$owner_mark"
trap finish EXIT
set -E
trap 'fail "unexpected error (line $LINENO): $BASH_COMMAND"' ERR
say "Self-hosted upgrade test: $from → ${to_commit:0:12} (instance $instance, ports $gateway_port/$keycloak_port/$http_port)"
remove_install  # what a run with --keep left
find "$work" -mindepth 1 -maxdepth 1 ! -name "$owner_mark" -exec rm -rf {} +
mkdir -p "$logs"
git -C "$repo" tag -f "$test_tag" "$to_commit" >/dev/null
git clone --quiet "$repo" "$app"
git -C "$app" checkout --quiet --detach "refs/tags/$from"
if [[ "$slow_realtime" == "true" ]]; then
  cat > "$app/infra/docker-compose.selfhost.local.yml" <<'YML'
# Upgrade test: a slow machine for Realtime.
services:
  realtime:
    deploy:
      resources:
        limits:
          cpus: "0.1"
YML
fi

# Installers up to 0.10.68 could stop on a new volume when the database
# answered before its setup had finished; the old release gets a second go.
step_name="install-$from"
say "install-$from: install.sh --domain $domain --mode proxy --instance $instance …"
if ! (cd "$app" && infra/scripts/install.sh --domain "$domain" --email ops@example.com --mode proxy \
      --http-port "$http_port" --instance "$instance" --gateway-port "$gateway_port" --keycloak-port "$keycloak_port") \
      > "$logs/install-$from.log" 2>&1; then
  echo "  the install of $from stopped (log: $logs/install-$from.log); once more with install.sh up"
  run "install-$from-again" up
fi
step_name="data"
seed
check_running "$from_commit"
from_major="$(postgres_major)"
before_update="$(fingerprint)"
counts_before="$(counts)"
acl_before="$(default_acl)"
pass "PostgreSQL $from_major, $counts_before"

run update update --version "$test_tag"
step_name="after the update"
check_running "$to_commit"
expect_same "row counts" "$counts_before" "$(counts)"
check_file
if [[ "$from_major" == "15" ]]; then
  grep -q '^\[pg-upgrade\]   identical:' "$logs/update.log" || fail "the move to PostgreSQL 17 did not report identical data"
  [[ "$(postgres_major)" == "17" ]] || fail "PostgreSQL is $(postgres_major) after the move"
  expect_same "default privileges in public" "$acl_before" "$(default_acl)"
else
  ! grep -q '^\[pg-upgrade\] Moving' "$logs/update.log" || fail "the database was moved again"
  pass "no move: the database was already PostgreSQL $from_major"
fi
mark "Written after the update"

run rollback rollback --yes
step_name="after the rollback"
check_running "$from_commit"
[[ "$(postgres_major)" == "$from_major" ]] || fail "PostgreSQL is $(postgres_major) after the rollback, expected $from_major"
expect_same "data (public, storage)" "$before_update" "$(fingerprint)"
expect_same "row counts" "$counts_before" "$(counts)"
[[ "$(marked "Written after the update")" == "0" ]] || fail "a task written after the update is still there"
pass "what was written after the update is gone"
check_file

run update-again update --version "$test_tag"
step_name="after the second update"
check_running "$to_commit"
expect_same "row counts" "$counts_before" "$(counts)"
check_file

if [[ "$from_major" == "15" ]]; then
  # The set an installer up to 0.10.66 could write: the release of the set
  # runs PostgreSQL 15, its database copy is PostgreSQL 17.
  run backup-for-bad-set backup
  step_name="a set its release cannot start"
  pg17_set="$(grep -E '^  Backup set: ' "$logs/backup-for-bad-set.log" | awk '{print $3}')"
  pg15_set="$(cd "$app" && ls -d infra/backups/install/pre-update-* | head -n1)"
  cp -a "$app/$pg15_set" "$work/bad-set"
  cp "$app/$pg17_set/database.tar.gz" "$work/bad-set/database.tar.gz"
  if (cd "$app" && infra/scripts/install.sh restore "$work/bad-set" --yes) > "$logs/bad-set.log" 2>&1; then
    fail "the restore of a PostgreSQL 17 copy into a PostgreSQL 15 release went ahead"
  fi
  grep -q 'This backup set cannot be restored' "$logs/bad-set.log" || { cat "$logs/bad-set.log" >&2; fail "refused for another reason"; }
  pass "refused before anything was stopped"
  check_running "$to_commit"
  rm -rf "$work/bad-set" "${app:?}/$pg17_set"
fi

run backup backup
step_name="backup and restore"
set_dir="$(grep -E '^  Backup set: ' "$logs/backup.log" | awk '{print $3}')"
[[ -n "$set_dir" ]] || fail "no backup set in the output of install.sh backup"
before_restore="$(fingerprint)"
mark "Written after the backup"
run restore restore "$set_dir" --yes
step_name="after the restore"
check_running "$to_commit"
expect_same "data (public, storage)" "$before_restore" "$(fingerprint)"
[[ "$(marked "Written after the backup")" == "0" ]] || fail "a task written after the backup is still there"
pass "what was written after the backup is gone"
check_file
