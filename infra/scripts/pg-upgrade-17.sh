#!/usr/bin/env bash
set -euo pipefail

# Moves the Supabase database from PostgreSQL 15 to 17, once: before the
# PostgreSQL 17 database starts for the first time. prod-compose.sh,
# test-compose.sh and install.sh call it before they start the db service;
# when there is nothing to move it does nothing.
#
# A logical copy into a new volume (<old volume>_pg17). The PostgreSQL 15
# volume is only read and stays as it was: it is the rollback.
#   1. Stop everything that uses the database (Keycloak and web keep running).
#   2. Start PostgreSQL 15 on the old volume and let the new GoTrue, Storage and
#      Realtime bring their schemas up to date there.
#   3. Fingerprint it (catalog, row count and checksum of every table) and dump
#      it with the PostgreSQL 17 tools.
#   4. Start PostgreSQL 17 on the new volume, let the same services create their
#      schemas, then load: roles, the public schema, the data of auth and
#      storage, publications, Motio's triggers and policies on service tables.
#   5. Fingerprint again: any difference stops the upgrade.
# Leaves PostgreSQL 17 running and the other services stopped. Dumps and
# fingerprints stay in infra/backups/pg-upgrade/<time>/ (mode 700).
#
#   infra/scripts/pg-upgrade-17.sh <env-file> <compose-file> [more compose files]
#   infra/scripts/pg-upgrade-17.sh --selfhost     (the compose files of install.sh)

if [[ "${1:-}" == "--selfhost" ]]; then
  env_file="${MOTIO_ENV_FILE:-.env}"
  compose=(infra/scripts/selfhost-compose.sh)
else
  env_file="${1:?env file}"
  shift
  compose_args=()
  for file in "$@"; do compose_args+=(-f "$file"); done
  [[ ${#compose_args[@]} -gt 0 ]] || { echo "Usage: $0 <env-file> <compose-file>... | --selfhost" >&2; exit 1; }
  compose=(docker compose "${compose_args[@]}" --env-file "$env_file")
fi
export COMPOSE_MENU=0

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
helper=(python3 "$here/pg-upgrade-17.py")
source_image="${PG_UPGRADE_SOURCE_IMAGE:-supabase/postgres:15.1.0.117}"
marker="motio-upgraded-from-pg15"
db_name="$(grep -E '^POSTGRES_DB=' "$env_file" | tail -n1 | cut -d= -f2- || true)"
db_name="${db_name:-postgres}"
db_password="$(grep -E '^POSTGRES_PASSWORD=' "$env_file" | tail -n1 | cut -d= -f2- || true)"

log() { printf '[pg-upgrade] %s\n' "$*" >&2; }

eval "$("${compose[@]}" config --format json | "${helper[@]}" layout)"
old_volume="${new_volume%_pg17}"
[[ "$old_volume" != "$new_volume" ]] || { log "the db volume name ($new_volume) does not end in _pg17."; exit 1; }

volume_file() { # volume, file in it -> contents (empty when absent)
  docker volume inspect "$1" >/dev/null 2>&1 || return 0
  docker run --rm -v "$1":/d:ro --entrypoint cat "$image17" "/d/$2" 2>/dev/null || true
}

# Where PostgreSQL 15 last stopped: changes once anything runs on it again.
old_state() {
  docker run --rm -v "$old_volume":/d:ro --entrypoint /usr/lib/postgresql/15/bin/pg_controldata "$source_image" /d \
    | awk -F': *' '/^Database system identifier|^Latest checkpoint location/ { printf "%s ", $2 }'
}

old_version="$(volume_file "$old_volume" PG_VERSION)"
new_version="$(volume_file "$new_volume" PG_VERSION)"
if [[ "$old_version" != "15" ]]; then
  exit 0  # a new install, or already PostgreSQL 17 from the start
fi
moved_from="$(volume_file "$new_volume" "$marker")"
stale_copy=false
if [[ "$new_version" == "17" && -n "$moved_from" ]]; then
  if [[ "$moved_from" == "$(old_state)" ]]; then
    exit 0  # moved earlier
  fi
  # PostgreSQL 15 ran again after the move (a rollback to the previous
  # release): its data is the current one, the PostgreSQL 17 copy is stale.
  stale_copy=true
fi

stamp="$(date +%Y%m%d-%H%M%S)"
dir="infra/backups/pg-upgrade/$stamp"
mkdir -p "$dir"
chmod 700 infra/backups/pg-upgrade "$dir"
dir_abs="$(cd "$dir" && pwd)"
source_container="${project}-pg15-upgrade-source"
target_container=""

stop_source() {
  docker stop -t 120 "$source_container" >/dev/null 2>&1 || true
  docker rm -f "$source_container" >/dev/null 2>&1 || true
}

cleanup() {
  local status=$?
  stop_source
  if (( status != 0 )); then
    [[ -n "$target_container" ]] && docker stop "$target_container" >/dev/null 2>&1 || true
    cat >&2 <<EOF

[pg-upgrade] The move to PostgreSQL 17 stopped (see above). Nothing was lost:
  the PostgreSQL 15 data is untouched in the volume ${old_volume}, and the
  copy is in ${dir}. Running the deploy again starts the move from scratch.
  To keep running on PostgreSQL 15, deploy the previous release
  (self-hosted: infra/scripts/install.sh rollback).
EOF
  fi
}
trap cleanup EXIT

log "Moving the database from PostgreSQL 15 ($old_volume) to 17 ($new_volume)."
log "Stopping the services that use the database."
stop_list=()
for service in $services; do
  # Keycloak and the web front do not use this database and keep running.
  case "$service" in keycloak|keycloak-db|web|oauth2-proxy|caddy) ;; *) stop_list+=("$service") ;; esac
done
"${compose[@]}" stop "${stop_list[@]}"

# The move starts from an empty PostgreSQL 17 volume. One that exists is a
# failed earlier attempt, a stale copy (see above) or a database started by
# hand: it is archived, then removed.
if docker volume inspect "$new_volume" >/dev/null 2>&1; then
  "${compose[@]}" rm -sf db >/dev/null
  if [[ "$stale_copy" == "true" ]]; then
    log "PostgreSQL 15 was used after the earlier move: moving again from it."
  else
    log "Replacing the PostgreSQL 17 volume of an unfinished earlier attempt."
  fi
  if [[ -n "$new_version" ]]; then
    log "  its contents go to $dir/earlier-pg17.tar.gz"
    docker run --rm -v "$new_volume":/v:ro -v "$dir_abs":/out debian:12-slim \
      tar --numeric-owner -czf /out/earlier-pg17.tar.gz -C /v .
  fi
  docker volume rm "$new_volume" >/dev/null
fi

wait_ready() { # container
  local started
  started="$(date +%s)"
  until docker exec "$1" pg_isready -U supabase_admin -d "$db_name" >/dev/null 2>&1; do
    (( $(date +%s) - started > 300 )) && { docker logs --tail 30 "$1" >&2; log "$1 did not start."; return 1; }
    sleep 2
  done
}

source_sql() { docker exec -i -u postgres "$source_container" psql -X -q -v ON_ERROR_STOP=1 -U supabase_admin -d "$db_name" "$@"; }
target_sql() { docker exec -i "$target_container" psql -X -q -v ON_ERROR_STOP=1 -U supabase_admin -d "$db_name" "$@"; }
container_sql() { if [[ "$1" == "$source_container" ]]; then shift; source_sql "$@"; else shift; target_sql "$@"; fi; }

# One line: the migration state of GoTrue, Storage and Realtime ("-" = not yet).
service_versions() { # container
  container_sql "$1" -tA <<'SQL'
select concat_ws(' ',
  case when to_regclass('auth.schema_migrations') is null then '-' else
    (xpath('/row/v/text()', query_to_xml('select max(version) || ''/'' || count(*) as v from auth.schema_migrations', false, true, '')))[1]::text end,
  case when to_regclass('storage.migrations') is null then '-' else
    (xpath('/row/v/text()', query_to_xml('select count(*) as v from storage.migrations', false, true, '')))[1]::text end,
  case when to_regclass('realtime.schema_migrations') is null then '-' else
    (xpath('/row/v/text()', query_to_xml('select count(*) as v from realtime.schema_migrations', false, true, '')))[1]::text end,
  case when to_regclass('_realtime.schema_migrations') is null then '-' else
    (xpath('/row/v/text()', query_to_xml('select count(*) as v from _realtime.schema_migrations', false, true, '')))[1]::text end)
SQL
}

# Starts GoTrue, Storage and Realtime on whichever database answers as "db",
# waits until their migrations stand still for 15 s, stops them. Prints the state.
run_service_migrations() { # container
  local started last="" same=0 current service state
  "${compose[@]}" up -d --no-deps --force-recreate auth storage realtime >/dev/null 2>&1
  started="$(date +%s)"
  while (( same < 5 )); do
    (( $(date +%s) - started > 420 )) && { "${compose[@]}" logs --tail 20 auth storage realtime >&2; log "the services did not finish their migrations."; return 1; }
    sleep 3
    for service in auth storage realtime; do
      state="$(docker inspect -f '{{.State.Status}}' "$("${compose[@]}" ps -aq "$service")" 2>/dev/null || echo missing)"
      [[ "$state" == "running" ]] || { "${compose[@]}" logs --tail 20 "$service" >&2; log "$service is $state."; return 1; }
    done
    current="$(service_versions "$1")"
    if [[ "$current" == "$last" && "$current" != *-* ]]; then same=$((same + 1)); else same=0; fi
    last="$current"
  done
  "${compose[@]}" stop auth storage realtime >/dev/null 2>&1
  printf '%s\n' "$last"
}

roles_json() { # container
  container_sql "$1" -tA <<'SQL'
select json_build_object(
  'database', current_database(),
  'roles', (select json_agg(json_build_object(
      'name', a.rolname, 'super', a.rolsuper, 'inherit', a.rolinherit, 'createrole', a.rolcreaterole,
      'createdb', a.rolcreatedb, 'login', a.rolcanlogin, 'replication', a.rolreplication,
      'bypassrls', a.rolbypassrls, 'connlimit', a.rolconnlimit, 'password', a.rolpassword,
      'validuntil', a.rolvaliduntil::text,
      'settings', (select json_agg(json_build_object('db', d.datname, 'config', s.setconfig))
                   from pg_db_role_setting s left join pg_database d on d.oid = s.setdatabase
                   where s.setrole = a.oid and s.setdatabase in (0, (select oid from pg_database where datname = current_database()))),
      'memberof', (select json_agg(g.rolname) from pg_auth_members m join pg_roles g on g.oid = m.roleid where m.member = a.oid))
    order by a.rolname) from pg_authid a where a.rolname !~ '^pg_'),
  'database_grants', (select json_agg(json_build_object('grantee', g.rolname, 'priv', x.privilege_type))
    from pg_database d, aclexplode(d.datacl) x join pg_roles g on g.oid = x.grantee
    where d.datname = current_database()))
SQL
}

# --- PostgreSQL 15: bring the services up to date, fingerprint, dump ---------

log "Starting PostgreSQL 15 on $old_volume."
docker rm -f "$source_container" >/dev/null 2>&1 || true
# The services find the database as "db" on the stack's network; a stack that
# has not run on this machine yet has no network.
docker network inspect "$network" >/dev/null 2>&1 \
  || "${compose[@]}" up --no-start --no-deps keycloak-db >/dev/null 2>&1
docker run -d --name "$source_container" --network "$network" --network-alias db \
  -v "$old_volume":/var/lib/postgresql/data "$source_image" \
  postgres -c listen_addresses='*' -c wal_level=logical -c max_connections=150 \
  -c shared_preload_libraries=pg_stat_statements >/dev/null
wait_ready "$source_container"

log "Letting GoTrue, Storage and Realtime update their schemas on PostgreSQL 15."
source_versions="$(run_service_migrations "$source_container")"
log "  service migrations: $source_versions"

log "Fingerprinting PostgreSQL 15."
source_sql -f - < "$here/pg-upgrade-17-catalog.sql" > "$dir/catalog.pg15"
source_sql -f - < "$here/pg-upgrade-17-data.sql" | sort > "$dir/data.pg15"
roles_json "$source_container" > "$dir/roles.pg15.json"
chmod 600 "$dir/roles.pg15.json"  # password hashes
log "  $(grep -c . "$dir/data.pg15") tables and sequences."

log "Dumping PostgreSQL 15 with the PostgreSQL 17 tools."
pg17() {
  docker run --rm --network "container:$source_container" --user "$(id -u):$(id -g)" \
    -e PGPASSWORD="$db_password" -v "$dir_abs":/dump --entrypoint "$1" "$image17" "${@:2}"
}
pg17 pg_dump -h 127.0.0.1 -U supabase_admin -d "$db_name" -Fc -n public -f /dump/public.dump
pg17 pg_dump -h 127.0.0.1 -U supabase_admin -d "$db_name" -Fc -n auth -n storage -n realtime -f /dump/services.dump
stop_source
moved_state="$(old_state)"
log "PostgreSQL 15 stopped; its volume is not touched again."

# --- PostgreSQL 17: create, let the services set up, load --------------------

if [[ "$new_volume_external" == "true" ]]; then
  docker volume create "$new_volume" >/dev/null
fi
log "Creating the PostgreSQL 17 database in $new_volume."
"${compose[@]}" up -d --no-deps db >/dev/null 2>&1
target_container="$("${compose[@]}" ps -q db)"
started="$(date +%s)"
until docker logs "$target_container" 2>&1 | grep -q 'init process complete'; do
  (( $(date +%s) - started > 300 )) && { docker logs --tail 30 "$target_container" >&2; log "PostgreSQL 17 did not finish its setup."; exit 1; }
  sleep 2
done
wait_ready "$target_container"
if docker logs "$target_container" 2>&1 | grep -E '^psql:.*ERROR|FATAL' | grep -v 'pg_stat_statements must be loaded'; then
  log "PostgreSQL 17 reported errors during its setup."
  exit 1
fi

log "Carrying over roles, passwords and extensions."
roles_json "$target_container" > "$dir/roles.pg17.json"
target_sql -f - < "$here/pg-upgrade-17-catalog.sql" > "$dir/catalog.pg17-empty"
{
  echo "begin;"
  "${helper[@]}" roles "$dir/roles.pg15.json" "$dir/roles.pg17.json"
  "${helper[@]}" extensions "$dir/catalog.pg15" "$dir/catalog.pg17-empty"
  echo "commit;"
} > "$dir/roles.sql"
chmod 600 "$dir/roles.pg17.json" "$dir/roles.sql"
target_sql -f - < "$dir/roles.sql" >/dev/null

log "Letting GoTrue, Storage and Realtime create their schemas on PostgreSQL 17."
target_versions="$(run_service_migrations "$target_container")"
log "  service migrations: $target_versions"
if [[ "$target_versions" != "$source_versions" ]]; then
  log "the service schemas differ: PostgreSQL 15 has '$source_versions', 17 has '$target_versions'."
  exit 1
fi

docker exec "$target_container" mkdir -p /tmp/pg-upgrade
docker cp "$dir/public.dump" "$target_container:/tmp/pg-upgrade/public.dump"
docker cp "$dir/services.dump" "$target_container:/tmp/pg-upgrade/services.dump"
target_restore() { docker exec "$target_container" pg_restore -U supabase_admin -d "$db_name" --exit-on-error "$@"; }
toc() { # dump file in the container -> its table of contents
  docker exec "$target_container" pg_restore -l "/tmp/pg-upgrade/$1"
}
toc public.dump | "${helper[@]}" toc-public /dev/stdin > "$dir/public.list"
toc services.dump > "$dir/services.toc"
"${helper[@]}" toc-service-data "$dir/services.toc" > "$dir/service-data.list"
docker cp "$dir/public.list" "$target_container:/tmp/pg-upgrade/public.list"
docker cp "$dir/service-data.list" "$target_container:/tmp/pg-upgrade/service-data.list"

# The services start empty; anything they wrote would collide with the copy.
nonempty="$(target_sql -tA <<'SQL'
select string_agg(format('%s', c.oid::regclass), ', ')
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('auth', 'storage') and c.relkind = 'r'
  and c.relname not in ('schema_migrations', 'migrations')
  and (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %s', c.oid::regclass), false, true, '')))[1]::text::int > 0
SQL
)"
[[ -z "$nonempty" ]] || { log "the new database already has rows in: $nonempty"; exit 1; }

# The new database grants anon, authenticated… on every new object in public
# by default. pg_dump writes each object's privileges relative to the bare
# PostgreSQL default, so those extra grants would stay on functions and tables
# Motio has revoked them from. Clear them first; the dump brings back the
# default privileges of PostgreSQL 15 afterwards.
target_sql >/dev/null <<'SQL'
do $$
declare r record;
begin
  for r in
    select pg_get_userbyid(d.defaclrole) as owner,
           case d.defaclobjtype when 'r' then 'tables' when 'S' then 'sequences'
                                when 'f' then 'functions' when 'T' then 'types' end as kind,
           case when x.grantee = 0 then 'public' else quote_ident(pg_get_userbyid(x.grantee)) end as grantee
    from pg_default_acl d cross join aclexplode(d.defaclacl) x
    where d.defaclnamespace = 'public'::regnamespace
  loop
    execute format('alter default privileges for role %I in schema public revoke all on %s from %s',
                   r.owner, r.kind, r.grantee);
  end loop;
end $$;
SQL
log "Loading the public schema."
target_restore -L /tmp/pg-upgrade/public.list --section=pre-data /tmp/pg-upgrade/public.dump
log "Loading the data of auth and storage."
target_restore -L /tmp/pg-upgrade/service-data.list --data-only --disable-triggers /tmp/pg-upgrade/services.dump
log "Loading the data of the public schema."
target_restore -L /tmp/pg-upgrade/public.list --section=data --disable-triggers /tmp/pg-upgrade/public.dump
log "Creating indexes, constraints, triggers and access rules."
target_restore -L /tmp/pg-upgrade/public.list --section=post-data /tmp/pg-upgrade/public.dump

# pg_dump leaves out which tables a publication sends when it dumps one schema.
"${helper[@]}" publications "$dir/catalog.pg15" > "$dir/publications.sql"
target_sql -f - < "$dir/publications.sql" >/dev/null

target_sql -tA > "$dir/objects.pg17" <<'SQL'
select 'trigger|' || n.nspname || ' ' || c.relname || ' ' || t.tgname
from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal
union all
select 'policy|' || schemaname || ' ' || tablename || ' ' || policyname from pg_policies
SQL
"${helper[@]}" toc-service-extras "$dir/services.toc" "$dir/objects.pg17" > "$dir/service-extras.list"
if [[ -s "$dir/service-extras.list" ]]; then
  log "Adding Motio's triggers and access rules on service tables ($(grep -c . "$dir/service-extras.list"))."
  docker cp "$dir/service-extras.list" "$target_container:/tmp/pg-upgrade/service-extras.list"
  target_restore -L /tmp/pg-upgrade/service-extras.list /tmp/pg-upgrade/services.dump
fi
docker exec "$target_container" rm -rf /tmp/pg-upgrade
target_sql -c 'analyze' >/dev/null

# --- Compare ------------------------------------------------------------------

log "Fingerprinting PostgreSQL 17 and comparing."
target_sql -f - < "$here/pg-upgrade-17-catalog.sql" > "$dir/catalog.pg17"
target_sql -f - < "$here/pg-upgrade-17-data.sql" | sort > "$dir/data.pg17"
if ! diff -q "$dir/data.pg15" "$dir/data.pg17" >/dev/null; then
  log "the data differs (table|rows|checksum, 15 → 17):"
  diff "$dir/data.pg15" "$dir/data.pg17" | grep '^[<>]' | head -40 >&2
  exit 1
fi
if ! "${helper[@]}" compare "$dir/catalog.pg15" "$dir/catalog.pg17" > "$dir/compare.txt"; then
  log "the database structure differs:"
  head -60 "$dir/compare.txt" >&2
  exit 1
fi
log "  identical: $(grep -c . "$dir/data.pg17") tables and sequences, structure, access rules."

# Marks the move as done, with the state of PostgreSQL 15 it was copied from.
printf '%s' "$moved_state" | docker exec -i "$target_container" sh -c \
  "cat > /var/lib/postgresql/data/$marker && chown postgres:postgres /var/lib/postgresql/data/$marker"
log "Done: PostgreSQL 17 is running on $new_volume. PostgreSQL 15 data stays in $old_volume."
