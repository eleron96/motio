#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  cd "$root_dir"
fi

env_file="${1:-.env}"
kc_base_url="${KEYCLOAK_ADMIN_BASE_URL:-http://127.0.0.1:8081}"
desired_ssl_required="${KEYCLOAK_REALM_SSL_REQUIRED:-external}"

if [[ ! -f "$env_file" ]]; then
  echo "Missing env file: $env_file" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to ensure Keycloak realm sslRequired." >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to ensure Keycloak realm sslRequired." >&2
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

# Keep backwards compatibility: if admin creds aren't specified in .env, fall back to Keycloak defaults.
admin_user="${admin_user:-admin}"
admin_pass="${admin_pass:-admin}"
realm="${realm_from_file:-${KEYCLOAK_REALM:-timeline}}"

case "$(printf '%s' "$desired_ssl_required" | tr '[:upper:]' '[:lower:]')" in
  none|external|all)
    desired_ssl_required="$(printf '%s' "$desired_ssl_required" | tr '[:upper:]' '[:lower:]')"
    ;;
  *)
    fail "Unsupported KEYCLOAK_REALM_SSL_REQUIRED: '${desired_ssl_required}' (expected none|external|all)."
    ;;
esac

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

tmp_realm="$(mktemp)"
tmp_payload="$(mktemp)"

cleanup() {
  rm -f "$tmp_realm" "$tmp_payload"
}
trap cleanup EXIT

if ! curl -fsS -o "$tmp_realm" -H "Authorization: Bearer ${token}" \
  "${kc_base_url}/admin/realms/${realm}"; then
  fail "Failed to query Keycloak admin API for realm '${realm}'."
fi

current_ssl_required="$(python3 - "$tmp_realm" <<'PY'
import json,sys
path=sys.argv[1]
try:
  with open(path,'r',encoding='utf-8') as f:
    obj=json.load(f)
except Exception:
  print("")
  sys.exit(0)
val=(obj.get("sslRequired") or "").strip()
print(val)
PY
)"

if [[ -z "$current_ssl_required" ]]; then
  fail "Keycloak realm '${realm}' sslRequired is missing; cannot proceed safely."
fi

if [[ "$(printf '%s' "$current_ssl_required" | tr '[:upper:]' '[:lower:]')" == "$desired_ssl_required" ]]; then
  echo "Keycloak realm '${realm}' sslRequired already matches: ${desired_ssl_required}."
  exit 0
fi

python3 - "$tmp_realm" "$tmp_payload" "$desired_ssl_required" <<'PY'
import json,sys
src, dst, desired = sys.argv[1], sys.argv[2], sys.argv[3]
with open(src,'r',encoding='utf-8') as f:
  obj=json.load(f)
obj["sslRequired"] = desired
with open(dst,'w',encoding='utf-8') as f:
  json.dump(obj,f)
PY

if ! put_code="$(curl -sS -o /dev/null -w "%{http_code}" \
  -X PUT "${kc_base_url}/admin/realms/${realm}" \
  -H "Authorization: Bearer ${token}" \
  -H "Content-Type: application/json" \
  --data-binary "@${tmp_payload}")"; then
  fail "Failed to update Keycloak realm sslRequired (curl error)."
fi

if [[ "$put_code" != "204" ]]; then
  fail "Failed to update Keycloak realm sslRequired (HTTP ${put_code})."
fi

tmp_verify="$(mktemp)"
if ! curl -fsS -o "$tmp_verify" -H "Authorization: Bearer ${token}" \
  "${kc_base_url}/admin/realms/${realm}"; then
  rm -f "$tmp_verify"
  fail "Failed to verify Keycloak realm sslRequired via admin API."
fi

verify_ssl_required="$(python3 - "$tmp_verify" <<'PY'
import json,sys
path=sys.argv[1]
try:
  with open(path,'r',encoding='utf-8') as f:
    obj=json.load(f)
except Exception:
  print("")
  sys.exit(0)
val=(obj.get("sslRequired") or "").strip()
print(val)
PY
)"
rm -f "$tmp_verify"

if [[ "$(printf '%s' "$verify_ssl_required" | tr '[:upper:]' '[:lower:]')" != "$desired_ssl_required" ]]; then
  fail "Keycloak realm sslRequired update did not take effect (expected '${desired_ssl_required}', got '${verify_ssl_required}')."
fi

echo "Keycloak realm '${realm}' sslRequired was updated: ${current_ssl_required} -> ${desired_ssl_required}."

