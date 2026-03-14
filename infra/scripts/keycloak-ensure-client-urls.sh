#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  cd "$root_dir"
fi

env_file="${1:-.env}"
kc_base_url="${KEYCLOAK_ADMIN_BASE_URL:-http://127.0.0.1:8081}"
realm="timeline"

if [[ ! -f "$env_file" ]]; then
  echo "Missing env file: $env_file" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to ensure Keycloak client URLs." >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to ensure Keycloak client URLs." >&2
  exit 1
fi

get_env_value() {
  local key="$1"
  local line
  line="$(grep -E "^${key}=" "$env_file" | head -n1 || true)"
  echo "${line#*=}"
}

trim_whitespace() {
  local value="${1:-}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

fail() {
  echo "$1" >&2
  exit 1
}

append_unique_client_ids() {
  local raw="${1:-}"
  local candidate
  IFS=',' read -r -a parts <<< "$raw"
  for candidate in "${parts[@]}"; do
    candidate="$(trim_whitespace "$candidate")"
    [[ -n "$candidate" ]] || continue

    local existing
    for existing in "${client_ids[@]:-}"; do
      if [[ "$existing" == "$candidate" ]]; then
        candidate=""
        break
      fi
    done

    [[ -n "$candidate" ]] || continue
    client_ids+=("$candidate")
  done
}

admin_user="$(get_env_value KEYCLOAK_ADMIN)"
admin_pass="$(get_env_value KEYCLOAK_ADMIN_PASSWORD)"
realm_from_file="$(get_env_value KEYCLOAK_REALM)"
managed_client_ids_raw="$(get_env_value KEYCLOAK_MANAGED_CLIENT_IDS)"
app_client_id="$(get_env_value KEYCLOAK_APP_CLIENT_ID)"
gotrue_client_id="$(get_env_value GOTRUE_EXTERNAL_KEYCLOAK_CLIENT_ID)"
oauth_client_id="$(get_env_value OAUTH2_PROXY_CLIENT_ID)"
site_url="$(get_env_value SITE_URL)"
app_url="$(get_env_value APP_URL)"
gotrue_redirect_uri="$(get_env_value GOTRUE_EXTERNAL_KEYCLOAK_REDIRECT_URI)"
oauth_redirect_uri="$(get_env_value OAUTH2_PROXY_REDIRECT_URL)"

admin_user="${admin_user:-admin}"
admin_pass="${admin_pass:-admin}"
realm="${realm_from_file:-${KEYCLOAK_REALM:-timeline}}"

base_url="$(trim_whitespace "${site_url:-${app_url:-}}")"
app_url="$(trim_whitespace "${app_url:-$base_url}")"
gotrue_redirect_uri="$(trim_whitespace "${gotrue_redirect_uri:-}")"
oauth_redirect_uri="$(trim_whitespace "${oauth_redirect_uri:-}")"

[[ -n "$base_url" ]] || fail "SITE_URL or APP_URL is required in $env_file"
[[ -n "$app_url" ]] || fail "APP_URL is required in $env_file"

declare -a client_ids=()
append_unique_client_ids "$managed_client_ids_raw"
append_unique_client_ids "$app_client_id"
append_unique_client_ids "$gotrue_client_id"
append_unique_client_ids "$oauth_client_id"

if (( ${#client_ids[@]} == 0 )); then
  fail "Unable to resolve managed client IDs. Set KEYCLOAK_MANAGED_CLIENT_IDS in $env_file."
fi

wait_ok=0
for attempt in {1..60}; do
  status_code="$(curl -sS -o /dev/null -w "%{http_code}" \
    "${kc_base_url}/realms/master/.well-known/openid-configuration" || true)"
  if [[ "$status_code" == "200" ]]; then
    wait_ok=1
    break
  fi
  sleep 2
done

if [[ "$wait_ok" -ne 1 ]]; then
  fail "Keycloak is not reachable at ${kc_base_url} (well-known did not return 200)."
fi

tmp_token_resp="$(mktemp)"
if ! tmp_token_code="$(curl -sS -o "$tmp_token_resp" -w "%{http_code}" \
  -X POST "${kc_base_url}/realms/master/protocol/openid-connect/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode grant_type=password \
  --data-urlencode client_id=admin-cli \
  --data-urlencode username="${admin_user}" \
  --data-urlencode password="${admin_pass}")"; then
  rm -f "$tmp_token_resp"
  fail "Keycloak admin token request failed (curl error)."
fi

token="$(python3 - "$tmp_token_resp" <<'PY'
import json,sys
path=sys.argv[1]
try:
  with open(path,'r',encoding='utf-8') as f:
    j=json.load(f)
except Exception:
  print("")
  sys.exit(0)
print(j.get("access_token",""))
PY
)"

if [[ -z "$token" ]]; then
  err="$(python3 - "$tmp_token_resp" <<'PY'
import json,sys
path=sys.argv[1]
try:
  with open(path,'r',encoding='utf-8') as f:
    j=json.load(f)
except Exception:
  print("non_json_response")
  sys.exit(0)
print(j.get("error","unknown"))
PY
)"
  rm -f "$tmp_token_resp"
  fail "Failed to obtain Keycloak admin token (HTTP ${tmp_token_code}, error=${err}). Check KEYCLOAK_ADMIN/KEYCLOAK_ADMIN_PASSWORD."
fi
rm -f "$tmp_token_resp"

for client_id in "${client_ids[@]}"; do
  tmp_client_list="$(mktemp)"
  tmp_client="$(mktemp)"
  tmp_payload="$(mktemp)"
  tmp_verify="$(mktemp)"

  cleanup_client_files() {
    rm -f "$tmp_client_list" "$tmp_client" "$tmp_payload" "$tmp_verify"
  }

  if ! curl -fsS -o "$tmp_client_list" -H "Authorization: Bearer ${token}" \
    "${kc_base_url}/admin/realms/${realm}/clients?clientId=${client_id}"; then
    cleanup_client_files
    fail "Failed to query Keycloak admin API for client '${client_id}'."
  fi

  cid="$(python3 - "$tmp_client_list" <<'PY'
import json,sys
path=sys.argv[1]
try:
  with open(path,'r',encoding='utf-8') as f:
    arr=json.load(f)
except Exception:
  print("")
  sys.exit(0)
print(arr[0].get("id","") if arr else "")
PY
)"

  if [[ -z "$cid" ]]; then
    cleanup_client_files
    fail "Keycloak client '${client_id}' not found in realm '${realm}'."
  fi

  if ! curl -fsS -o "$tmp_client" -H "Authorization: Bearer ${token}" \
    "${kc_base_url}/admin/realms/${realm}/clients/${cid}"; then
    cleanup_client_files
    fail "Failed to fetch Keycloak client '${client_id}' via admin API."
  fi

  python3 - "$tmp_client" "$tmp_payload" "$base_url" "$app_url" "$gotrue_redirect_uri" "$oauth_redirect_uri" <<'PY'
import json
import sys
from urllib.parse import urlsplit

src, dst, base_url, app_url, gotrue_redirect_uri, oauth_redirect_uri = sys.argv[1:7]

def trim(value: str) -> str:
    return value.strip().rstrip("/")

def unique(values):
    result = []
    seen = set()
    for raw in values:
        value = trim(raw)
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return sorted(result)

def origin(value: str) -> str:
    parsed = urlsplit(trim(value))
    if not parsed.scheme or not parsed.netloc:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}"

base_url = trim(base_url)
app_url = trim(app_url or base_url)

redirect_uris = unique([
    oauth_redirect_uri,
    f"{app_url}/auth",
    gotrue_redirect_uri,
    f"{base_url}/*",
])

web_origins = unique([
    origin(base_url),
    origin(app_url),
    origin(gotrue_redirect_uri),
    origin(oauth_redirect_uri),
])

with open(src, "r", encoding="utf-8") as f:
    client = json.load(f)

attributes = client.get("attributes") or {}
attributes["post.logout.redirect.uris"] = f"{base_url}/*"

client["rootUrl"] = base_url
client["baseUrl"] = base_url
client["redirectUris"] = redirect_uris
client["webOrigins"] = web_origins
client["attributes"] = attributes

with open(dst, "w", encoding="utf-8") as f:
    json.dump(client, f)
PY

  if ! put_code="$(curl -sS -o /dev/null -w "%{http_code}" \
    -X PUT "${kc_base_url}/admin/realms/${realm}/clients/${cid}" \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    --data-binary "@${tmp_payload}")"; then
    cleanup_client_files
    fail "Failed to update Keycloak client '${client_id}' URLs (curl error)."
  fi

  if [[ "$put_code" != "204" ]]; then
    cleanup_client_files
    fail "Failed to update Keycloak client '${client_id}' URLs (HTTP ${put_code})."
  fi

  if ! curl -fsS -o "$tmp_verify" -H "Authorization: Bearer ${token}" \
    "${kc_base_url}/admin/realms/${realm}/clients/${cid}"; then
    cleanup_client_files
    fail "Failed to verify Keycloak client '${client_id}' via admin API."
  fi

  verification="$(python3 - "$tmp_verify" "$base_url" "$app_url" "$gotrue_redirect_uri" "$oauth_redirect_uri" <<'PY'
import json
import sys
from urllib.parse import urlsplit

path, base_url, app_url, gotrue_redirect_uri, oauth_redirect_uri = sys.argv[1:6]

def trim(value: str) -> str:
    return value.strip().rstrip("/")

def unique(values):
    result = []
    seen = set()
    for raw in values:
        value = trim(raw)
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return sorted(result)

def origin(value: str) -> str:
    parsed = urlsplit(trim(value))
    if not parsed.scheme or not parsed.netloc:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}"

base_url = trim(base_url)
app_url = trim(app_url or base_url)
expected_redirect_uris = unique([
    oauth_redirect_uri,
    f"{app_url}/auth",
    gotrue_redirect_uri,
    f"{base_url}/*",
])
expected_web_origins = unique([
    origin(base_url),
    origin(app_url),
    origin(gotrue_redirect_uri),
    origin(oauth_redirect_uri),
])

with open(path, "r", encoding="utf-8") as f:
    client = json.load(f)

actual = {
    "rootUrl": trim(client.get("rootUrl", "")),
    "baseUrl": trim(client.get("baseUrl", "")),
    "redirectUris": unique(client.get("redirectUris") or []),
    "webOrigins": unique(client.get("webOrigins") or []),
    "postLogoutRedirectUris": trim((client.get("attributes") or {}).get("post.logout.redirect.uris", "")),
}
expected = {
    "rootUrl": base_url,
    "baseUrl": base_url,
    "redirectUris": expected_redirect_uris,
    "webOrigins": expected_web_origins,
    "postLogoutRedirectUris": f"{base_url}/*",
}

if actual != expected:
    print(json.dumps({"actual": actual, "expected": expected}, ensure_ascii=True))
    sys.exit(1)
PY
)" || {
    cleanup_client_files
    fail "Keycloak client '${client_id}' URL update did not take effect: ${verification}"
  }

  cleanup_client_files
  echo "Keycloak client URLs ensured for '${client_id}'."
done
