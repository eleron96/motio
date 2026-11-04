#!/usr/bin/env python3
"""Helpers for pg-upgrade-17.sh: reads compose config, dump tables of
contents and database fingerprints; writes SQL and restore lists.

  layout                        compose config JSON on stdin -> shell variables
  roles SOURCE.json TARGET.json roles and database grants to carry over (SQL)
  extensions SOURCE TARGET      extensions to create on the target (SQL)
  publications SOURCE           tables the publications send (SQL)
  toc-public TOC                public schema entries to restore
  toc-service-data TOC          auth and storage table data to restore
  toc-service-extras TOC OBJS   triggers and policies on service tables that
                                the target does not have yet
  compare SOURCE TARGET         catalog fingerprints: exit 1 on a difference
"""
import json
import re
import shlex
import sys

# Supabase extensions the PostgreSQL 17 image no longer ships or keeps off by
# default; Motio does not use them (pgjwt, pgsodium, vault) or never did (graphql).
SKIPPED_EXTENSIONS = {"plpgsql", "pgjwt", "pgsodium", "supabase_vault", "pg_graphql", "pg_stat_statements"}
SKIPPED_ROLE_PREFIXES = ("pgsodium_",)
# Settings whose value is a list: written to ALTER ROLE ... SET as is.
LIST_SETTINGS = {"search_path", "session_preload_libraries", "local_preload_libraries",
                 "shared_preload_libraries", "temp_tablespaces"}
# Schemas of service-owned objects that go away with their extension.
GONE_SCHEMAS = ("pgsodium.", "pgsodium_masks.", "vault.", "graphql.", "graphql_public.")


def ident(name):
    return '"' + name.replace('"', '""') + '"'


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def layout():
    config = json.load(sys.stdin)
    volume = config["volumes"]["supabase_db_data"]
    networks = config.get("networks") or {}
    default_network = (networks.get("default") or {}).get("name") or f'{config["name"]}_default'
    values = {
        "project": config["name"],
        "new_volume": volume.get("name") or "supabase_db_data",
        "new_volume_external": "true" if volume.get("external") else "false",
        "image17": config["services"]["db"]["image"],
        "network": default_network,
        "services": " ".join(sorted(config["services"])),
    }
    for key, value in values.items():
        print(f"{key}={shlex.quote(value)}")


def role_attributes(role):
    flags = [
        "SUPERUSER" if role["super"] else "NOSUPERUSER",
        "INHERIT" if role["inherit"] else "NOINHERIT",
        "CREATEROLE" if role["createrole"] else "NOCREATEROLE",
        "CREATEDB" if role["createdb"] else "NOCREATEDB",
        "LOGIN" if role["login"] else "NOLOGIN",
        "REPLICATION" if role["replication"] else "NOREPLICATION",
        "BYPASSRLS" if role["bypassrls"] else "NOBYPASSRLS",
        f'CONNECTION LIMIT {role["connlimit"]}',
    ]
    if role.get("validuntil"):
        flags.append(f'VALID UNTIL {literal(role["validuntil"])}')
    return " ".join(flags)


def settings_of(role):
    """{database or None: {name: value}}"""
    result = {}
    for entry in role.get("settings") or []:
        bucket = result.setdefault(entry["db"], {})
        for item in entry["config"] or []:
            name, _, value = item.partition("=")
            bucket[name] = value
    return result


def roles(source_path, target_path):
    source = json.load(open(source_path))
    target = json.load(open(target_path))
    target_roles = {role["name"]: role for role in target["roles"]}
    out = ["-- Roles, passwords, role settings and database grants from PostgreSQL 15."]
    created = []
    for role in source["roles"]:
        name = role["name"]
        if name.startswith(SKIPPED_ROLE_PREFIXES):
            continue
        if name not in target_roles:
            out.append(f"CREATE ROLE {ident(name)} WITH {role_attributes(role)};")
            created.append(name)
    known = set(target_roles) | set(created)
    for role in source["roles"]:
        name = role["name"]
        if name not in known:
            continue
        if role.get("password"):
            out.append(f'ALTER ROLE {ident(name)} WITH PASSWORD {literal(role["password"])};')
        target_settings = settings_of(target_roles.get(name, {}))
        for database, values in settings_of(role).items():
            scope = f" IN DATABASE {ident(database)}" if database else ""
            for setting, value in values.items():
                if target_settings.get(database, {}).get(setting) == value:
                    continue
                shown = value if setting in LIST_SETTINGS else literal(value)
                out.append(f"ALTER ROLE {ident(name)}{scope} SET {setting} TO {shown};")
    for role in source["roles"]:
        for group in role.get("memberof") or []:
            if (role["name"] in created or group in created) and role["name"] in known and group in known:
                out.append(f"GRANT {ident(group)} TO {ident(role['name'])};")
    target_grants = {(g["grantee"], g["priv"]) for g in target.get("database_grants") or []}
    for grant in source.get("database_grants") or []:
        if grant["grantee"] in known and (grant["grantee"], grant["priv"]) not in target_grants:
            out.append(f'GRANT {grant["priv"]} ON DATABASE {ident(source["database"])} TO {ident(grant["grantee"])};')
    print("\n".join(out))


def catalog_lines(path):
    with open(path) as handle:
        return [line.rstrip("\n") for line in handle if line.strip()]


def extensions(source_path, target_path):
    def installed(path):
        return {line.split("|")[1]: line.split("|")[3]
                for line in catalog_lines(path) if line.startswith("ext|")}
    target = installed(target_path)
    for name, schema in sorted(installed(source_path).items()):
        if name not in target and name not in SKIPPED_EXTENSIONS:
            print(f"CREATE EXTENSION IF NOT EXISTS {ident(name)} WITH SCHEMA {ident(schema)};")


def publications(source_path):
    for line in catalog_lines(source_path):
        if not line.startswith("pubtable|"):
            continue
        _, publication, table = line.split("|")[:3]
        # Realtime manages its own publication of message partitions.
        if publication == "supabase_realtime_messages_publication":
            continue
        schema, _, name = table.partition(".")
        print(f"""do $$ begin
  if exists (select 1 from pg_publication where pubname = {literal(publication)})
     and not exists (select 1 from pg_publication_tables where pubname = {literal(publication)}
                     and schemaname = {literal(schema)} and tablename = {literal(name)}) then
    alter publication {ident(publication)} add table {ident(schema)}.{ident(name)};
  end if;
end $$;""")


def toc_entries(path):
    """(line, type, schema, rest) for every entry of a pg_restore -l list."""
    entry = re.compile(r"^\d+; \d+ \d+ (.+)$")
    types = ("TABLE DATA", "SEQUENCE SET", "SEQUENCE OWNED BY", "DEFAULT ACL", "PUBLICATION TABLE",
             "ROW SECURITY", "FK CONSTRAINT", "MATERIALIZED VIEW DATA", "DEFAULT")
    with open(path) as handle:
        for line in handle:
            line = line.rstrip("\n")
            match = entry.match(line)
            if not match:
                continue
            body = match.group(1)
            kind = next((t for t in types if body.startswith(t + " ")), body.split(" ", 1)[0])
            parts = body[len(kind) + 1:].split(" ", 1)
            yield line, kind, parts[0], parts[1] if len(parts) > 1 else ""


def toc_public(path):
    for line, kind, schema, rest in toc_entries(path):
        # The public schema itself already exists in the new database.
        if kind in ("SCHEMA", "COMMENT") and schema == "-" and rest.split(" ")[-2:-1] == ["public"]:
            continue
        if kind == "COMMENT" and rest.startswith("SCHEMA public "):
            continue
        print(line)


def toc_service_data(path):
    skip = {("auth", "schema_migrations"), ("storage", "migrations")}
    for line, kind, schema, rest in toc_entries(path):
        if kind not in ("TABLE DATA", "SEQUENCE SET") or schema not in ("auth", "storage"):
            continue
        if (schema, rest.split(" ", 1)[0]) in skip:
            continue
        print(line)


def toc_service_extras(path, objects_path):
    present = set(catalog_lines(objects_path))
    for line, kind, schema, rest in toc_entries(path):
        if kind not in ("TRIGGER", "POLICY"):
            continue
        tag = rest.rsplit(" ", 1)[0]  # drop the owner
        if f"{kind.lower()}|{schema} {tag}" not in present:
            print(line)


ACL_ITEM = re.compile(r"^([^=]*)=([A-Za-z*]*)/(.+)$")


def normalize_acl(match):
    items = match.group(1).split(",")
    parsed = [ACL_ITEM.match(item) for item in items]
    if not all(parsed):
        return match.group(0)  # not a privilege list
    # PostgreSQL 17 adds MAINTAIN (m) to "all privileges"; the order of the
    # entries only reflects the order of the grants.
    return "{" + ",".join(sorted(f"{p.group(1)}={re.sub(r'm[*]?', '', p.group(2))}/{p.group(3)}"
                                 for p in parsed)) + "}"


def normalize(line):
    return re.sub(r"\{([^{}]*)\}", normalize_acl, line)


def compare(source_path, target_path):
    source = {normalize(line) for line in catalog_lines(source_path)}
    target = {normalize(line) for line in catalog_lines(target_path)}
    source_roles = {line.split("|")[1] for line in source if line.startswith("role|")}
    target_roles = {line.split("|")[1] for line in target if line.startswith("role|")}

    def strict(line):
        section, _, rest = line.partition("|")
        key = rest.split("|", 1)[0]
        if key.startswith(GONE_SCHEMAS):
            return False
        if key.startswith("public."):
            return True
        if section in ("policy", "trigger"):
            return True
        if section == "pubtable":
            return key == "supabase_realtime"
        if section == "defacl":
            return rest.split("|")[1] == "public"
        if section == "schema":
            return key == "public"
        if section == "ext":
            return key not in SKIPPED_EXTENSIONS
        return False

    problems = []
    for line in sorted(source - target):
        if strict(line):
            problems.append(f"  missing after the upgrade: {line[:300]}")
    for line in sorted(target - source):
        if strict(line) and not line.startswith("ext|"):
            problems.append(f"  only after the upgrade:    {line[:300]}")
    # Roles that only Motio creates must come over exactly.
    for name in sorted(source_roles - target_roles):
        if not name.startswith(SKIPPED_ROLE_PREFIXES):
            problems.append(f"  role missing after the upgrade: {name}")
    for line in sorted(source):
        if line.startswith("role|") and line not in target:
            name = line.split("|")[1]
            if name in source_roles and name not in BUILTIN_ROLES and not name.startswith(SKIPPED_ROLE_PREFIXES):
                problems.append(f"  role differs after the upgrade: {line}")
    if problems:
        print("\n".join(problems))
        sys.exit(1)


# Roles the Supabase image creates and manages itself; their memberships and
# settings may differ between image versions.
BUILTIN_ROLES = {
    "anon", "authenticated", "authenticator", "dashboard_user", "pgbouncer", "postgres", "service_role",
    "supabase_admin", "supabase_auth_admin", "supabase_etl_admin", "supabase_functions_admin",
    "supabase_privileged_role", "supabase_read_only_user", "supabase_realtime_admin",
    "supabase_replication_admin", "supabase_storage_admin",
}


if __name__ == "__main__":
    command, args = sys.argv[1], sys.argv[2:]
    {
        "layout": layout,
        "roles": roles,
        "extensions": extensions,
        "publications": publications,
        "toc-public": toc_public,
        "toc-service-data": toc_service_data,
        "toc-service-extras": toc_service_extras,
        "compare": compare,
    }[command](*args)
