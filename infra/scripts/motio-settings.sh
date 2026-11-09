#!/usr/bin/env bash
set -euo pipefail

# Server settings from the command line: the same switches as Admin → Settings.
#
#   motio-settings.sh                      # list: value, where it comes from, what it does
#   motio-settings.sh set <key> on|off     # store a value
#   motio-settings.sh reset <key>          # back to the default (every default is off)
#   motio-settings.sh sql set <key> on     # only print the SQL (used by tests)
#
# Self-hosted: infra/scripts/install.sh settings … runs this. The owner's
# servers: make settings CONTOUR=testing|prod [SET=key=on] [RESET=key].
#
# Run from the root of a Motio checkout. MOTIO_SETTINGS_COMPOSE is the compose
# command of this install (default: infra/scripts/selfhost-compose.sh), the
# values go to the instance_settings table (migration 0176) through psql in the
# db container, so this works even while the backend functions are down. The
# server picks a change up within 30 seconds, people at their next visit.

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root_dir"

registry="infra/supabase/functions/_shared/instanceSettingsRegistry.ts"
env_file="${MOTIO_ENV_FILE:-.env}"
read -r -a compose <<<"${MOTIO_SETTINGS_COMPOSE:-infra/scripts/selfhost-compose.sh}"

fail() { printf '\033[31mError:\033[0m %s\n' "$*" >&2; exit 1; }

command -v python3 >/dev/null 2>&1 || fail "python3 is required."
[[ -f "$registry" ]] || fail "run this from the root of a Motio checkout ($registry not found)."

# Every check and every line of SQL comes from here: the registry decides which
# keys exist, so nothing typed on the command line reaches the database as is.
settings_py() {
  python3 -I - "$registry" "$env_file" "$@" <<'PY'
import json, re, sys

registry_path, env_path, mode, *args = sys.argv[1:]

source = open(registry_path, encoding="utf-8").read()
block = source[source.index("// registry:begin"):source.index("// registry:end")]
settings = json.loads(block[block.index("["):block.rindex("]") + 1])
by_key = {s["key"]: s for s in settings}

env = {}
try:
    for line in open(env_path, encoding="utf-8"):
        match = re.match(r"^([A-Z0-9_]+)=(.*)$", line.rstrip("\n"))
        if match:
            env.setdefault(match.group(1), match.group(2))
except FileNotFoundError:
    pass

def pinned(setting):
    name = setting.get("env")
    return bool(name) and env.get(name, "").strip().lower() == "true"

def need_key(key):
    if key not in by_key:
        sys.exit("unknown setting: %s\nknown: %s" % (key, ", ".join(by_key)))
    return by_key[key]

# The admin console's activity log (migration 0181) shows command-line changes
# too; a database from before that migration simply has no log.
def audit_sql(key, value):
    return (
        "do $$ begin if to_regclass('public.admin_audit_log') is not null then "
        "insert into public.admin_audit_log (actor_id, action, details) values "
        "(null, 'settings.update', jsonb_build_object('key', '%s', 'value', '%s'::jsonb, 'via', 'cli')); "
        "end if; end $$;" % (key, value)
    )

def parse_value(raw):
    value = raw.strip().lower()
    if value in ("on", "true", "yes", "1"):
        return True
    if value in ("off", "false", "no", "0"):
        return False
    sys.exit("value must be on or off, not %r" % raw)

if mode == "set":
    if len(args) != 2:
        sys.exit("usage: set <key> on|off")
    setting = need_key(args[0])
    value = parse_value(args[1])
    if pinned(setting):
        sys.exit("%s=true in %s decides %s; change it there." % (setting["env"], env_path, setting["key"]))
    print(
        "insert into public.instance_settings (key, value, updated_at, updated_by) "
        "values ('%s', '%s'::jsonb, now(), null) "
        "on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = null;"
        % (setting["key"], "true" if value else "false")
    )
    print(audit_sql(setting["key"], "true" if value else "false"))
elif mode == "reset":
    if len(args) != 1:
        sys.exit("usage: reset <key>")
    setting = need_key(args[0])
    if pinned(setting):
        sys.exit("%s=true in %s decides %s; change it there." % (setting["env"], env_path, setting["key"]))
    print("delete from public.instance_settings where key = '%s';" % setting["key"])
    print(audit_sql(setting["key"], "null"))
elif mode == "list":
    stored = {}
    for line in (args[0] if args else "").splitlines():
        parts = line.split("\t")
        if len(parts) >= 2 and parts[1] in ("true", "false"):
            stored[parts[0]] = (parts[1] == "true", parts[2] if len(parts) > 2 else "")
    rows = []
    for s in settings:
        if pinned(s):
            value, where = True, "%s=true in .env" % s["env"]
        elif s["key"] in stored:
            value, when = stored[s["key"]]
            where = "set %s" % when if when else "set"
        else:
            value, where = s["default"], "default"
        rows.append((s["key"], "on" if value else "off", where, s["description"]))
    width = max(len(r[0]) for r in rows)
    where_width = max(len(r[2]) for r in rows)
    for key, value, where, description in rows:
        print("%-*s  %-3s  %-*s  %s" % (width, key, value, where_width, where, description))
else:
    sys.exit("unknown mode: %s" % mode)
PY
}

run_sql() {
  local db
  db="$(grep -E '^POSTGRES_DB=' "$env_file" 2>/dev/null | head -n1 | cut -d= -f2- || true)"
  "${compose[@]}" exec -T db psql -U supabase_admin -d "${db:-postgres}" -v ON_ERROR_STOP=1 -q -At -F $'\t' -c "$1"
}

usage() { sed -n '4,9p' "$0" | sed 's/^# \{0,1\}//'; }

case "${1:-list}" in
  list)
    rows="$(run_sql "select key, value::text, to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC' from public.instance_settings order by key;" 2>&1)" \
      || fail "could not read the settings (is Motio running and up to date? install.sh up applies the migrations): ${rows}"
    settings_py list "$rows"
    ;;
  set)
    [[ "$#" -eq 3 ]] || fail "usage: set <key> on|off"
    sql="$(settings_py set "$2" "$3")" || exit 1
    run_sql "$sql" >/dev/null
    echo "$2 is $3. The server picks it up within 30 seconds, people the next time they open Motio."
    ;;
  reset)
    [[ "$#" -eq 2 ]] || fail "usage: reset <key>"
    sql="$(settings_py reset "$2")" || exit 1
    run_sql "$sql" >/dev/null
    echo "$2 is back to its default."
    ;;
  sql)
    shift
    settings_py "$@"
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage
    exit 1
    ;;
esac
