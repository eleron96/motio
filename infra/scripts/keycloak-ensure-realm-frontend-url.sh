#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  cd "$root_dir"
fi

env_file="${1:-.env}"
kc_base_url="${KEYCLOAK_ADMIN_BASE_URL:-http://127.0.0.1:8081}"

if [[ ! -f "$env_file" ]]; then
  echo "Missing env file: $env_file" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to ensure Keycloak realm frontend URL." >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to ensure Keycloak realm frontend URL." >&2
  exit 1
fi

get_env_value() {
  local key="$1"
  local line
  line="$(grep -E "^${key}=" "$env_file" | head -n1 || true)"
  echo "${line#*=}"
}

fail() {
  echo "$1" >&2
  exit 1
}

admin_user="$(get_env_value KEYCLOAK_ADMIN)"
admin_pass="$(get_env_value KEYCLOAK_ADMIN_PASSWORD)"
realm_from_file="$(get_env_value KEYCLOAK_REALM)"
desired_frontend_url="$(get_env_value KEYCLOAK_REALM_FRONTEND_URL)"
site_url="$(get_env_value SITE_URL)"
app_url="$(get_env_value APP_URL)"

admin_user="${admin_user:-admin}"
admin_pass="${admin_pass:-admin}"
realm="${realm_from_file:-${KEYCLOAK_REALM:-timeline}}"

desired_frontend_url="$(python3 - "$desired_frontend_url" "$site_url" "$app_url" <<'PY'
import sys
from urllib.parse import urlsplit

explicit, site_url, app_url = sys.argv[1:4]

def normalize(raw: str) -> str:
    value = (raw or "").strip().rstrip("/")
    if not value:
        return ""
    parsed = urlsplit(value)
    if not parsed.scheme or not parsed.netloc:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}"

for candidate in (explicit, site_url, app_url):
    normalized = normalize(candidate)
    if normalized:
        print(normalized)
        raise SystemExit(0)

print("")
PY
)"

[[ -n "$desired_frontend_url" ]] || fail "KEYCLOAK_REALM_FRONTEND_URL or SITE_URL or APP_URL is required in $env_file"

wait_ok=0
for _attempt in {1..60}; do
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
import json
import sys

path = sys.argv[1]
try:
  with open(path, "r", encoding="utf-8") as fh:
    payload = json.load(fh)
except Exception:
  print("")
  raise SystemExit(0)
print(payload.get("access_token", ""))
PY
)"

if [[ -z "$token" ]]; then
  err="$(python3 - "$tmp_token_resp" <<'PY'
import json
import sys

path = sys.argv[1]
try:
  with open(path, "r", encoding="utf-8") as fh:
    payload = json.load(fh)
except Exception:
  print("non_json_response")
  raise SystemExit(0)
print(payload.get("error", "unknown"))
PY
)"
  rm -f "$tmp_token_resp"
  fail "Failed to obtain Keycloak admin token (HTTP ${tmp_token_code}, error=${err}). Check KEYCLOAK_ADMIN/KEYCLOAK_ADMIN_PASSWORD."
fi
rm -f "$tmp_token_resp"

tmp_realm="$(mktemp)"
tmp_payload="$(mktemp)"
tmp_verify="$(mktemp)"

cleanup() {
  rm -f "$tmp_realm" "$tmp_payload" "$tmp_verify"
}
trap cleanup EXIT

if ! curl -fsS -o "$tmp_realm" -H "Authorization: Bearer ${token}" \
  "${kc_base_url}/admin/realms/${realm}"; then
  fail "Failed to query Keycloak admin API for realm '${realm}'."
fi

current_frontend_url="$(python3 - "$tmp_realm" <<'PY'
import json
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as fh:
  payload = json.load(fh)
attributes = payload.get("attributes") or {}
print((attributes.get("frontendUrl") or "").strip().rstrip("/"))
PY
)"

if [[ "$current_frontend_url" == "$desired_frontend_url" ]]; then
  echo "Keycloak realm '${realm}' frontendUrl already matches: ${desired_frontend_url}."
  exit 0
fi

python3 - "$tmp_realm" "$tmp_payload" "$desired_frontend_url" <<'PY'
import json
import sys

src, dst, frontend_url = sys.argv[1:]
with open(src, "r", encoding="utf-8") as fh:
  payload = json.load(fh)
attributes = payload.get("attributes") or {}
attributes["frontendUrl"] = frontend_url
payload["attributes"] = attributes
with open(dst, "w", encoding="utf-8") as fh:
  json.dump(payload, fh)
PY

if ! put_code="$(curl -sS -o /dev/null -w "%{http_code}" \
  -X PUT "${kc_base_url}/admin/realms/${realm}" \
  -H "Authorization: Bearer ${token}" \
  -H "Content-Type: application/json" \
  --data-binary "@${tmp_payload}")"; then
  fail "Failed to update Keycloak realm frontendUrl (curl error)."
fi

if [[ "$put_code" != "204" ]]; then
  fail "Failed to update Keycloak realm frontendUrl (HTTP ${put_code})."
fi

if ! curl -fsS -o "$tmp_verify" -H "Authorization: Bearer ${token}" \
  "${kc_base_url}/admin/realms/${realm}"; then
  fail "Failed to verify Keycloak realm frontendUrl via admin API."
fi

verify_frontend_url="$(python3 - "$tmp_verify" <<'PY'
import json
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as fh:
  payload = json.load(fh)
attributes = payload.get("attributes") or {}
print((attributes.get("frontendUrl") or "").strip().rstrip("/"))
PY
)"

if [[ "$verify_frontend_url" != "$desired_frontend_url" ]]; then
  fail "Keycloak realm frontendUrl update did not take effect."
fi

echo "Keycloak realm '${realm}' frontendUrl was updated to ${desired_frontend_url}."
