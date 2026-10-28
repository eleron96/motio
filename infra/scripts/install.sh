#!/usr/bin/env bash
set -euo pipefail

# Install, update or restart a self-hosted Motio on one Linux server with Docker.
# Full guide: docs/self-hosting.md.
#
#   infra/scripts/install.sh --domain planner.example.com --email you@example.com
#   infra/scripts/install.sh --domain planner.example.com --email you@example.com --mode proxy --http-port 8088
#   infra/scripts/install.sh update [--version v0.11.0]
#   infra/scripts/install.sh up          # re-apply config and (re)start everything
#   infra/scripts/install.sh --env-only --domain … --email …   # only write .env, start nothing
#
# Run it from the root of a Motio checkout (git clone of the repository). It never
# touches another install on the same machine: the compose project, volumes and
# loopback ports are its own (MOTIO_INSTANCE, MOTIO_GATEWAY_PORT, MOTIO_KEYCLOAK_PORT).

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root_dir"

env_file="${MOTIO_ENV_FILE:-.env}"
compose=(infra/scripts/selfhost-compose.sh)

usage() {
  sed -n '4,14p' "$0" | sed 's/^# \{0,1\}//'
  cat <<'EOF'

Options (install):
  --domain HOST          public host name, e.g. planner.example.com (required)
  --email EMAIL          your email: Let's Encrypt contact and sender of mail (required)
  --mode tls|proxy       tls: this server gets the certificate itself, ports 80/443 (default)
                         proxy: plain HTTP on 127.0.0.1:--http-port behind your own proxy
  --http-port PORT       local port for --mode proxy (default 8088)
  --public-url URL       public address if it is not https://<domain> (e.g. behind a proxy on a port)
  --version TAG          release tag to install, e.g. v0.11.0 (default: the current checkout)
  --instance NAME        compose project / volume prefix (default motio)
  --gateway-port PORT    loopback port for the API gateway (default 8080)
  --keycloak-port PORT   loopback port for Keycloak (default 8081)
  --smtp-host HOST --smtp-port PORT --smtp-user USER --smtp-pass PASS --smtp-from EMAIL
                         outgoing mail (optional; without it no emails are sent)
EOF
}

log() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33mWarning:\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[31mError:\033[0m %s\n' "$*" >&2; exit 1; }

get_env_value() {
  local line
  line="$(grep -E "^${1}=" "$env_file" | head -n1 || true)"
  printf '%s' "${line#*=}"
}

# ─────────────────────────── preflight ───────────────────────────

preflight() {
  if [[ "$env_only" == "true" ]]; then
    for tool in python3 openssl; do
      command -v "$tool" >/dev/null 2>&1 || fail "$tool is required."
    done
    return 0
  fi
  command -v docker >/dev/null 2>&1 || fail "Docker is required: https://docs.docker.com/engine/install/"
  docker info >/dev/null 2>&1 || fail "Docker is not running (or this user may not use it)."
  local version
  version="$(docker compose version --short 2>/dev/null || true)"
  [[ -n "$version" ]] || fail "Docker Compose v2 is required (docker compose …)."
  python3 - "$version" <<'PY' || fail "Docker Compose ${version} is too old: 2.24 or newer is required."
import sys
parts = [int(p) for p in sys.argv[1].lstrip("v").split("-")[0].split(".")[:2]]
sys.exit(0 if parts >= [2, 24] else 1)
PY
  for tool in python3 openssl curl git; do
    command -v "$tool" >/dev/null 2>&1 || fail "$tool is required."
  done
  local mem_kb
  mem_kb="$(awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)"
  if (( mem_kb > 0 && mem_kb < 3000000 )); then
    warn "less than 3 GB of RAM: building the web app may run out of memory."
  fi
}

# ─────────────────────────── version ───────────────────────────

checkout_version() {
  local version="$1"
  [[ -z "$version" ]] && return 0
  if ! git diff --quiet || ! git diff --cached --quiet; then
    fail "the checkout has local changes; commit or stash them before switching to $version."
  fi
  log "Switching to $version"
  git fetch --tags --quiet origin
  git rev-parse --verify --quiet "refs/tags/$version" >/dev/null || fail "no release tag $version."
  git checkout --quiet --detach "refs/tags/$version"
}

# ─────────────────────────── .env ───────────────────────────

# Writes a complete .env for this install from .env.example: generated secrets,
# every public URL derived from one address, our own hosts and analytics off.
generate_env() {
  local domain="$1" email="$2" mode="$3" http_port="$4" public_url="$5" instance="$6"
  local gateway_port="$7" keycloak_port="$8"
  local smtp_host="$9" smtp_port="${10}" smtp_user="${11}" smtp_pass="${12}" smtp_from="${13}"

  log "Generating $env_file"
  python3 - "$env_file" "$domain" "$email" "$mode" "$http_port" "$public_url" "$instance" \
    "$gateway_port" "$keycloak_port" "$smtp_host" "$smtp_port" "$smtp_user" "$smtp_pass" "$smtp_from" <<'PY'
import base64, hashlib, hmac, json, os, re, secrets, subprocess, sys, tempfile, time
from urllib.parse import urlparse

(env_path, domain, email, mode, http_port, public_url, instance,
 gateway_port, keycloak_port, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from) = sys.argv[1:15]

url = (public_url or f"https://{domain}").rstrip("/")
parsed = urlparse(url)
host = parsed.netloc  # host[:port], what oauth2-proxy whitelists
secure = parsed.scheme == "https"

def rand(n):
    return secrets.token_hex(n)

def b64url(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

def jwt(secret, role):
    now = int(time.time())
    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = b64url(json.dumps({"role": role, "iss": "supabase", "iat": now,
                                 "exp": now + 10 * 365 * 24 * 3600}, separators=(",", ":")).encode())
    signing_input = f"{header}.{payload}".encode()
    signature = b64url(hmac.new(secret.encode(), signing_input, hashlib.sha256).digest())
    return f"{header}.{payload}.{signature}"

def vapid_pair():
    """Web Push keys: raw P-256 public point and private scalar, base64url (web-push format)."""
    with tempfile.TemporaryDirectory() as tmp:
        key = os.path.join(tmp, "vapid.pem")
        subprocess.run(["openssl", "ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", key],
                       check=True, capture_output=True)
        text = subprocess.run(["openssl", "ec", "-in", key, "-noout", "-text"],
                              check=True, capture_output=True, text=True).stdout
    def block(name):
        match = re.search(name + r":\s*\n((?:\s+[0-9a-f:]+\n)+)", text)
        return bytes.fromhex(re.sub(r"[^0-9a-f]", "", match.group(1)))
    private = block("priv")[-32:].rjust(32, b"\0")
    public = block("pub")
    if len(public) != 65 or public[0] != 4:
        raise SystemExit("unexpected VAPID public key format from openssl")
    return b64url(public), b64url(private)

db_password = rand(24)
jwt_secret = rand(32)
client_secret = rand(24)
vapid_public, vapid_private = vapid_pair()
admin_password = secrets.token_urlsafe(18)
# The reserve admin is a service account: it opens the super-admin console, not a
# planner. The person installing signs up with their own email like everyone else.
bare_host = parsed.hostname or domain
reserve_email = f"admin@{bare_host}" if "." in bare_host else "admin@motio.local"
realm = f"{url}/realms/timeline"
internal_realm = "http://keycloak:8080/realms/timeline"

values = {
    "MOTIO_INSTANCE": instance,
    "MOTIO_MODE": mode,
    "MOTIO_DOMAIN": domain,
    "MOTIO_SITE_ADDRESS": domain if mode == "tls" else ":80",
    "MOTIO_HTTP_BIND": "80" if mode == "tls" else f"127.0.0.1:{http_port}",
    "MOTIO_ACME_EMAIL": email,
    "MOTIO_GATEWAY_PORT": gateway_port,
    "MOTIO_KEYCLOAK_PORT": keycloak_port,

    "POSTGRES_PASSWORD": db_password,
    "POSTGRES_USER": "postgres",
    "POSTGRES_DB": "postgres",
    "POSTGRES_MAX_CONNECTIONS": "150",
    "POSTGRES_SHARED_BUFFERS": "256MB",
    "POSTGRES_EFFECTIVE_CACHE_SIZE": "1GB",
    "POSTGRES_WORK_MEM": "8MB",
    "POSTGRES_MAINTENANCE_WORK_MEM": "64MB",
    "POSTGRES_MAX_WAL_SIZE": "1GB",

    "JWT_SECRET": jwt_secret,
    "ANON_KEY": jwt(jwt_secret, "anon"),
    "SERVICE_ROLE_KEY": jwt(jwt_secret, "service_role"),
    "REALTIME_DB_ENC_KEY": rand(8),

    "SITE_URL": url,
    "URI_ALLOW_LIST": f"{url}/**",
    "API_EXTERNAL_URL": url,
    "APP_URL": url,

    "GOTRUE_SMTP_HOST": smtp_host,
    # GoTrue refuses to start with an empty port, even when no mail is sent.
    "GOTRUE_SMTP_PORT": smtp_port or "587",
    "GOTRUE_SMTP_SECURE": "true" if (smtp_port or "587") == "465" else "false",
    "GOTRUE_SMTP_USER": smtp_user,
    "GOTRUE_SMTP_PASS": smtp_pass,
    "GOTRUE_SMTP_ADMIN_EMAIL": smtp_from or (email if smtp_host else ""),
    "GOTRUE_SMTP_SENDER_NAME": "Motio",
    "GOTRUE_EXTERNAL_KEYCLOAK_ENABLED": "true",
    "GOTRUE_EXTERNAL_KEYCLOAK_CLIENT_ID": "timeline-supabase",
    "GOTRUE_EXTERNAL_KEYCLOAK_SECRET": client_secret,
    "GOTRUE_EXTERNAL_KEYCLOAK_URL": internal_realm,
    "GOTRUE_EXTERNAL_KEYCLOAK_REDIRECT_URI": f"{url}/auth/v1/callback",

    "KEYCLOAK_ADMIN": "admin",
    "KEYCLOAK_ADMIN_PASSWORD": rand(16),
    "KEYCLOAK_DB_PASSWORD": rand(16),
    "KEYCLOAK_INTERNAL_URL": "http://keycloak:8080",
    "KEYCLOAK_PUBLIC_URL": url,
    "KEYCLOAK_HOSTNAME_STRICT": "true",
    "KEYCLOAK_ADMIN_BASE_URL": f"http://127.0.0.1:{keycloak_port}",
    "KEYCLOAK_JAVA_OPTS_APPEND": "-Xms256m -Xmx768m",
    "KEYCLOAK_REALM_AUDIT_ENABLED": "false",

    "OAUTH2_PROXY_OIDC_ISSUER_URL": realm,
    "OAUTH2_PROXY_LOGIN_URL": f"{realm}/protocol/openid-connect/auth",
    "OAUTH2_PROXY_REDEEM_URL": f"{internal_realm}/protocol/openid-connect/token",
    "OAUTH2_PROXY_PROFILE_URL": f"{internal_realm}/protocol/openid-connect/userinfo",
    "OAUTH2_PROXY_OIDC_JWKS_URL": f"{internal_realm}/protocol/openid-connect/certs",
    "OAUTH2_PROXY_CLIENT_ID": "timeline-supabase",
    "OAUTH2_PROXY_CLIENT_SECRET": client_secret,
    "OAUTH2_PROXY_REDIRECT_URL": f"{url}/oauth2/callback",
    "OAUTH2_PROXY_BACKEND_LOGOUT_URL": f"{internal_realm}/protocol/openid-connect/logout?id_token_hint={{id_token}}",
    "OAUTH2_PROXY_WHITELIST_DOMAINS": host,
    "OAUTH2_PROXY_COOKIE_SECRET": rand(16),
    "OAUTH2_PROXY_COOKIE_SECURE": "true" if secure else "false",

    "RESERVE_ADMIN_EMAIL": reserve_email,
    "RESERVE_ADMIN_PASSWORD": admin_password,

    "PGRST_DB_URI": f"postgres://authenticator:{db_password}@db:5432/postgres",
    "GOTRUE_DB_DATABASE_URL": f"postgresql://supabase_auth_admin:{db_password}@db:5432/postgres",
    "SUPABASE_DB_URL": f"postgresql://postgres:{db_password}@db:5432/postgres",
    "SUPABASE_INTERNAL_URL": "http://gateway:8080",

    "VITE_SUPABASE_URL": url,
    "VITE_SUPABASE_ANON_KEY": jwt(jwt_secret, "anon"),
    "VITE_RESERVE_ADMIN_EMAIL": reserve_email,
    "VITE_AUTH_MODE": "keycloak",
    "VITE_KEYCLOAK_PUBLIC_URL": url,
    "VITE_PUBLIC_SITE_URL": f"{parsed.scheme}://{host}",
    "VITE_PLAUSIBLE_DOMAIN": "",
    "VITE_PLAUSIBLE_SRC": "",
    "VITE_GLITCHTIP_DSN": "",
    "GLITCHTIP_DSN": "",

    "VITE_FEATURE_TIME_OFF": "true",
    "VITE_FEATURE_WORKLOAD_HEATMAP": "true",
    "VITE_FEATURE_PROJECT_CARD": "true",
    "VITE_FEATURE_PROJECT_CARD_MOBILE": "true",
    "VITE_FEATURE_PEOPLE_SUGGEST": "true",
    "VITE_FEATURE_PUSH": "true",
    "VITE_FEATURE_KANBAN": "false",
    "VITE_FEATURE_ACCOUNT_DELETION": "false",
    "VITE_FEATURE_WORKSPACE_API": "false",

    "VAPID_PUBLIC_KEY": vapid_public,
    "VAPID_PRIVATE_KEY": vapid_private,
    "VAPID_SUBJECT": f"mailto:{email}",
    "VITE_PUSH_VAPID_PUBLIC_KEY": vapid_public,

    "MAILER_DRY_RUN": "0" if smtp_host else "1",
    "BACKUP_CORS_ORIGIN": url,
    "AUTO_PRE_MIGRATION_BACKUP": "true",
}

with open(".env.example", encoding="utf-8") as fh:
    template = fh.read().splitlines()

seen = set()
out = ["# Generated by infra/scripts/install.sh — keep this file private (it holds every secret).", ""]
for line in template:
    match = re.match(r"^([A-Z0-9_]+)=", line)
    if match and match.group(1) in values:
        key = match.group(1)
        out.append(f"{key}={values[key]}")
        seen.add(key)
    else:
        out.append(line)
missing = [key for key in values if key not in seen]
if missing:
    out += ["", "# Self-hosted install"] + [f"{key}={values[key]}" for key in missing]

fd = os.open(env_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, "w", encoding="utf-8") as fh:
    fh.write("\n".join(out) + "\n")
PY
}

# Adds keys that a newer release introduced in .env.example and this .env lacks,
# with the example's default. Existing values are never changed.
add_missing_env_keys() {
  python3 - "$env_file" <<'PY'
import re, sys
env_path = sys.argv[1]
with open(env_path, encoding="utf-8") as fh:
    current = fh.read()
present = set(re.findall(r"^([A-Z0-9_]+)=", current, flags=re.M))
added = []
with open(".env.example", encoding="utf-8") as fh:
    for line in fh:
        match = re.match(r"^([A-Z0-9_]+)=", line)
        if match and match.group(1) not in present:
            added.append(line.rstrip("\n"))
            present.add(match.group(1))
if added:
    with open(env_path, "a", encoding="utf-8") as fh:
        fh.write("\n# Added by install.sh update\n" + "\n".join(added) + "\n")
    print("New settings added to .env with their defaults:")
    for line in added:
        print("  " + line.split("=", 1)[0])
PY
}

# ─────────────────────────── bring the stack up ───────────────────────────

wait_for_url() {
  local url="$1" what="$2" timeout="${3:-300}" started
  started="$(date +%s)"
  until [[ "$(curl -s -o /dev/null -w '%{http_code}' "$url" || true)" == "200" ]]; do
    if (( $(date +%s) - started > timeout )); then
      fail "$what did not come up within ${timeout}s. See: infra/scripts/selfhost-compose.sh logs"
    fi
    sleep 3
  done
}

bring_up() {
  local postgres_password postgres_user postgres_db keycloak_port gateway_port service_key
  postgres_password="$(get_env_value POSTGRES_PASSWORD)"
  postgres_user="$(get_env_value POSTGRES_USER)"
  postgres_db="$(get_env_value POSTGRES_DB)"
  keycloak_port="$(get_env_value MOTIO_KEYCLOAK_PORT)"
  gateway_port="$(get_env_value MOTIO_GATEWAY_PORT)"
  service_key="$(get_env_value SERVICE_ROLE_KEY)"

  infra/scripts/check-prod-secrets.sh "$env_file"

  log "Checking the compose configuration"
  # Refuse to start if anything would attach to volumes of another install.
  if "${compose[@]}" config 2>/dev/null | grep -qE '^\s+external: true'; then
    fail "the compose configuration still references an external volume; refusing to start."
  fi

  log "Starting the database"
  "${compose[@]}" up -d db
  local started
  started="$(date +%s)"
  until "${compose[@]}" exec -T db pg_isready -U "$postgres_user" -d "$postgres_db" >/dev/null 2>&1; do
    (( $(date +%s) - started > 300 )) && fail "the database did not become ready."
    sleep 2
  done

  # The supabase/postgres image creates its internal roles with its own default
  # passwords on first start; align them with POSTGRES_PASSWORD (same as the
  # production and testing deploys).
  "${compose[@]}" exec -T db psql -U supabase_admin -d "$postgres_db" -v ON_ERROR_STOP=1 -q -c "
    ALTER ROLE postgres WITH PASSWORD '${postgres_password}';
    ALTER ROLE supabase_admin WITH PASSWORD '${postgres_password}';
    ALTER ROLE supabase_auth_admin WITH PASSWORD '${postgres_password}';
    ALTER ROLE authenticator WITH PASSWORD '${postgres_password}';
    CREATE SCHEMA IF NOT EXISTS _realtime;" >/dev/null

  log "Starting Keycloak and the backend"
  "${compose[@]}" up -d keycloak-db keycloak auth rest functions backup realtime storage gateway
  wait_for_url "http://127.0.0.1:${keycloak_port}/realms/master/.well-known/openid-configuration" "Keycloak" 420

  log "Applying Keycloak settings"
  export KEYCLOAK_ADMIN_BASE_URL="http://127.0.0.1:${keycloak_port}"
  local script
  for script in client-secret client-urls realm-ssl-required realm-branding realm-frontend-url \
    realm-session-policy realm-bruteforce realm-passwordpolicy realm-user-profile realm-locales realm-smtp; do
    infra/scripts/keycloak-ensure-"$script".sh "$env_file"
  done

  # The migrations build on the auth and storage schemas, which GoTrue and
  # storage-api create on their first start.
  log "Waiting for the auth and storage services"
  started="$(date +%s)"
  until [[ "$("${compose[@]}" exec -T db psql -U supabase_admin -d "$postgres_db" -tAc \
    "select to_regclass('auth.identities') is not null and to_regclass('storage.buckets') is not null" 2>/dev/null | tr -d '[:space:]')" == "t" ]]; do
    if (( $(date +%s) - started > 300 )); then
      "${compose[@]}" logs --tail=20 auth storage || true
      fail "the auth and storage services did not finish their setup."
    fi
    sleep 3
  done

  log "Running database migrations"
  "${compose[@]}" run --rm migrate

  log "Creating the reserve admin account"
  wait_for_url "http://127.0.0.1:${gateway_port}/health" "the API gateway" 120
  local status_code=""
  for _attempt in $(seq 1 30); do
    status_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -X POST \
      -H 'Content-Type: application/json' -H "Authorization: Bearer ${service_key}" \
      -d '{"action":"bootstrap.sync"}' "http://127.0.0.1:${gateway_port}/functions/v1/admin" || true)"
    [[ "$status_code" == "200" ]] && break
    sleep 3
  done
  [[ "$status_code" == "200" ]] || warn "could not confirm the reserve admin account (HTTP ${status_code}); see: infra/scripts/selfhost-compose.sh logs functions"

  log "Building the web app (a few minutes the first time)"
  "${compose[@]}" up -d --build web oauth2-proxy

  # gateway and caddy mount single config files: a changed file (new release)
  # is only seen by a new container, and nginx resolves upstream addresses at
  # start (AGENTS.md §9.1). Recreate both last.
  "${compose[@]}" up -d --force-recreate --no-deps gateway caddy
}

print_summary() {
  local url admin mode
  url="$(get_env_value APP_URL)"
  admin="$(get_env_value RESERVE_ADMIN_EMAIL)"
  mode="$(get_env_value MOTIO_MODE)"
  cat <<EOF

Motio is running at ${url}

  Next: open it, choose "Create an account" and sign up with your own email.
  You get your own workspace; invite the team from its settings.

  Super-admin console: ${url}/app/admin — sign in as ${admin}
                       (password: RESERVE_ADMIN_PASSWORD in .env)
  Keycloak console:    ${url}/admin — user "admin", KEYCLOAK_ADMIN_PASSWORD in .env
  Registration is open to anyone who can reach ${url}. Once your team has
  accounts you can close it in Keycloak: realm "timeline" → Realm settings →
  Login → User registration.

EOF
  if [[ "$mode" == "proxy" ]]; then
    echo "  Point your reverse proxy at http://$(get_env_value MOTIO_HTTP_BIND) for ${url}."
    echo "  It must pass the Host header and X-Forwarded-For / X-Forwarded-Proto."
  fi
  if [[ -z "$(get_env_value GOTRUE_SMTP_HOST)" ]]; then
    echo "  No SMTP configured: Motio sends no email (invitations of new people and password"
    echo "  resets need it). Add the GOTRUE_SMTP_* settings to .env and run: install.sh up"
  fi
  echo "  Logs: infra/scripts/selfhost-compose.sh logs -f"
  echo "  Guide: docs/self-hosting.md"
}

# The application schemas only, like the production pre-migration backup:
# internal schemas (_realtime, …) belong to supabase_admin and hold nothing to keep.
backup_database() {
  local postgres_user postgres_db file schemas schema
  postgres_user="$(get_env_value POSTGRES_USER)"
  postgres_db="$(get_env_value POSTGRES_DB)"
  schemas="$(get_env_value BACKUP_SCHEMAS)"
  local schema_args=()
  for schema in ${schemas//,/ }; do
    schema_args+=(-n "$schema")
  done
  [[ "${#schema_args[@]}" -gt 0 ]] || schema_args=(-n public -n auth -n storage)
  mkdir -p infra/backups
  file="infra/backups/pre-update-$(date +%Y%m%d-%H%M%S).dump"
  log "Backing up the database to $file"
  if ! "${compose[@]}" exec -T db pg_dump --format=custom --no-owner "${schema_args[@]}" \
    -U "$postgres_user" -d "$postgres_db" > "$file.partial"; then
    rm -f "$file.partial"
    fail "the database backup failed; nothing was changed."
  fi
  mv "$file.partial" "$file"
}

# ─────────────────────────── commands ───────────────────────────

command_name="install"
case "${1:-}" in
  install|update|up) command_name="$1"; shift ;;
  -h|--help) usage; exit 0 ;;
esac

domain="" email="" mode="tls" http_port="8088" public_url="" version="" instance="motio"
gateway_port="8080" keycloak_port="8081"
smtp_host="" smtp_port="" smtp_user="" smtp_pass="" smtp_from=""
env_only="false"

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --domain) domain="$2"; shift 2 ;;
    --email) email="$2"; shift 2 ;;
    --mode) mode="$2"; shift 2 ;;
    --http-port) http_port="$2"; shift 2 ;;
    --public-url) public_url="$2"; shift 2 ;;
    --version) version="$2"; shift 2 ;;
    --instance) instance="$2"; shift 2 ;;
    --gateway-port) gateway_port="$2"; shift 2 ;;
    --keycloak-port) keycloak_port="$2"; shift 2 ;;
    --smtp-host) smtp_host="$2"; shift 2 ;;
    --smtp-port) smtp_port="$2"; shift 2 ;;
    --smtp-user) smtp_user="$2"; shift 2 ;;
    --smtp-pass) smtp_pass="$2"; shift 2 ;;
    --smtp-from) smtp_from="$2"; shift 2 ;;
    --env-only) env_only="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "unknown option: $1 (see --help)" ;;
  esac
done

preflight

case "$command_name" in
  install)
    if [[ -f "$env_file" ]]; then
      log "$env_file exists — keeping it (secrets and settings stay as they are)"
    else
      [[ -n "$domain" ]] || fail "--domain is required (see --help)."
      [[ "$email" == *@*.* ]] || fail "--email is required (see --help)."
      [[ "$mode" == "tls" || "$mode" == "proxy" ]] || fail "--mode must be tls or proxy."
      [[ "$instance" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || fail "--instance may use lowercase letters, digits, - and _."
      for port in "$http_port" "$gateway_port" "$keycloak_port"; do
        [[ "$port" =~ ^[0-9]+$ ]] || fail "ports must be numbers."
      done
      if [[ "$mode" == "tls" && -n "$public_url" && "$public_url" != https://* ]]; then
        fail "--mode tls serves https; drop --public-url or use --mode proxy."
      fi
      checkout_version "$version"
      generate_env "$domain" "$email" "$mode" "$http_port" "$public_url" "$instance" \
        "$gateway_port" "$keycloak_port" "$smtp_host" "$smtp_port" "$smtp_user" "$smtp_pass" "$smtp_from"
    fi
    if [[ "$env_only" == "true" ]]; then
      echo "Wrote $env_file. Review it, then run: infra/scripts/install.sh up"
      exit 0
    fi
    bring_up
    print_summary
    ;;
  update)
    [[ -f "$env_file" ]] || fail "no $env_file here — this is not an installed Motio (run install first)."
    backup_database
    checkout_version "$version"
    add_missing_env_keys
    bring_up
    print_summary
    ;;
  up)
    [[ -f "$env_file" ]] || fail "no $env_file here — run install first."
    bring_up
    print_summary
    ;;
esac
