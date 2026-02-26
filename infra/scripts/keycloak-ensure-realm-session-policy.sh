#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  cd "$root_dir"
fi

env_file="${1:-.env}"
kc_base_url="${KEYCLOAK_ADMIN_BASE_URL:-http://127.0.0.1:8081}"
desired_remember_me="${KEYCLOAK_REALM_REMEMBER_ME:-true}"
desired_sso_idle_timeout="${KEYCLOAK_REALM_SSO_SESSION_IDLE_TIMEOUT:-1800}"
desired_sso_max_lifespan="${KEYCLOAK_REALM_SSO_SESSION_MAX_LIFESPAN:-36000}"
desired_sso_idle_timeout_remember_me="${KEYCLOAK_REALM_SSO_SESSION_IDLE_TIMEOUT_REMEMBER_ME:-86400}"
desired_sso_max_lifespan_remember_me="${KEYCLOAK_REALM_SSO_SESSION_MAX_LIFESPAN_REMEMBER_ME:-604800}"

if [[ ! -f "$env_file" ]]; then
  echo "Missing env file: $env_file" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to ensure Keycloak realm session policy." >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to ensure Keycloak realm session policy." >&2
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

normalize_bool() {
  local value
  value="$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')"
  case "$value" in
    1|true|yes|on)
      echo "true"
      ;;
    0|false|no|off)
      echo "false"
      ;;
    *)
      fail "Expected boolean value, got '${1:-}'."
      ;;
  esac
}

normalize_seconds() {
  local value="${1:-}"
  if [[ ! "$value" =~ ^[0-9]+$ ]]; then
    fail "Expected non-negative integer seconds value, got '${value}'."
  fi
  echo "$value"
}

desired_remember_me="$(normalize_bool "$desired_remember_me")"
desired_sso_idle_timeout="$(normalize_seconds "$desired_sso_idle_timeout")"
desired_sso_max_lifespan="$(normalize_seconds "$desired_sso_max_lifespan")"
desired_sso_idle_timeout_remember_me="$(normalize_seconds "$desired_sso_idle_timeout_remember_me")"
desired_sso_max_lifespan_remember_me="$(normalize_seconds "$desired_sso_max_lifespan_remember_me")"

admin_user="$(get_env_value KEYCLOAK_ADMIN)"
admin_pass="$(get_env_value KEYCLOAK_ADMIN_PASSWORD)"
realm_from_file="$(get_env_value KEYCLOAK_REALM)"

admin_user="${admin_user:-admin}"
admin_pass="${admin_pass:-admin}"
realm="${realm_from_file:-${KEYCLOAK_REALM:-timeline}}"

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

current_values="$(python3 - "$tmp_realm" <<'PY'
import json
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as fh:
  realm = json.load(fh)

def bool_to_str(value):
  return "true" if bool(value) else "false"

print(bool_to_str(realm.get("rememberMe")))
print(realm.get("ssoSessionIdleTimeout"))
print(realm.get("ssoSessionMaxLifespan"))
print(realm.get("ssoSessionIdleTimeoutRememberMe"))
print(realm.get("ssoSessionMaxLifespanRememberMe"))
PY
)"

current_remember_me="$(printf '%s\n' "$current_values" | sed -n '1p')"
current_sso_idle_timeout="$(printf '%s\n' "$current_values" | sed -n '2p')"
current_sso_max_lifespan="$(printf '%s\n' "$current_values" | sed -n '3p')"
current_sso_idle_timeout_remember_me="$(printf '%s\n' "$current_values" | sed -n '4p')"
current_sso_max_lifespan_remember_me="$(printf '%s\n' "$current_values" | sed -n '5p')"

if [[ "$current_remember_me" == "$desired_remember_me" \
  && "$current_sso_idle_timeout" == "$desired_sso_idle_timeout" \
  && "$current_sso_max_lifespan" == "$desired_sso_max_lifespan" \
  && "$current_sso_idle_timeout_remember_me" == "$desired_sso_idle_timeout_remember_me" \
  && "$current_sso_max_lifespan_remember_me" == "$desired_sso_max_lifespan_remember_me" ]]; then
  echo "Keycloak realm '${realm}' session policy already matches desired values."
  exit 0
fi

python3 - "$tmp_realm" "$tmp_payload" \
  "$desired_remember_me" \
  "$desired_sso_idle_timeout" \
  "$desired_sso_max_lifespan" \
  "$desired_sso_idle_timeout_remember_me" \
  "$desired_sso_max_lifespan_remember_me" <<'PY'
import json
import sys

src = sys.argv[1]
dst = sys.argv[2]
remember_me = sys.argv[3].lower() == "true"
sso_idle_timeout = int(sys.argv[4])
sso_max_lifespan = int(sys.argv[5])
sso_idle_timeout_remember_me = int(sys.argv[6])
sso_max_lifespan_remember_me = int(sys.argv[7])

with open(src, "r", encoding="utf-8") as fh:
  payload = json.load(fh)

payload["rememberMe"] = remember_me
payload["ssoSessionIdleTimeout"] = sso_idle_timeout
payload["ssoSessionMaxLifespan"] = sso_max_lifespan
payload["ssoSessionIdleTimeoutRememberMe"] = sso_idle_timeout_remember_me
payload["ssoSessionMaxLifespanRememberMe"] = sso_max_lifespan_remember_me

with open(dst, "w", encoding="utf-8") as fh:
  json.dump(payload, fh)
PY

if ! put_code="$(curl -sS -o /dev/null -w "%{http_code}" \
  -X PUT "${kc_base_url}/admin/realms/${realm}" \
  -H "Authorization: Bearer ${token}" \
  -H "Content-Type: application/json" \
  --data-binary "@${tmp_payload}")"; then
  fail "Failed to update Keycloak realm session policy (curl error)."
fi

if [[ "$put_code" != "204" ]]; then
  fail "Failed to update Keycloak realm session policy (HTTP ${put_code})."
fi

if ! curl -fsS -o "$tmp_verify" -H "Authorization: Bearer ${token}" \
  "${kc_base_url}/admin/realms/${realm}"; then
  fail "Failed to verify Keycloak realm session policy via admin API."
fi

verify_values="$(python3 - "$tmp_verify" <<'PY'
import json
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as fh:
  realm = json.load(fh)

def bool_to_str(value):
  return "true" if bool(value) else "false"

print(bool_to_str(realm.get("rememberMe")))
print(realm.get("ssoSessionIdleTimeout"))
print(realm.get("ssoSessionMaxLifespan"))
print(realm.get("ssoSessionIdleTimeoutRememberMe"))
print(realm.get("ssoSessionMaxLifespanRememberMe"))
PY
)"

verify_remember_me="$(printf '%s\n' "$verify_values" | sed -n '1p')"
verify_sso_idle_timeout="$(printf '%s\n' "$verify_values" | sed -n '2p')"
verify_sso_max_lifespan="$(printf '%s\n' "$verify_values" | sed -n '3p')"
verify_sso_idle_timeout_remember_me="$(printf '%s\n' "$verify_values" | sed -n '4p')"
verify_sso_max_lifespan_remember_me="$(printf '%s\n' "$verify_values" | sed -n '5p')"

if [[ "$verify_remember_me" != "$desired_remember_me" \
  || "$verify_sso_idle_timeout" != "$desired_sso_idle_timeout" \
  || "$verify_sso_max_lifespan" != "$desired_sso_max_lifespan" \
  || "$verify_sso_idle_timeout_remember_me" != "$desired_sso_idle_timeout_remember_me" \
  || "$verify_sso_max_lifespan_remember_me" != "$desired_sso_max_lifespan_remember_me" ]]; then
  fail "Keycloak realm session policy update did not take effect."
fi

echo "Keycloak realm '${realm}' session policy was updated."
