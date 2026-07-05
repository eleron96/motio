#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  cd "$root_dir"
fi

env_file="${1:-.env}"
kc_base_url="${KEYCLOAK_ADMIN_BASE_URL:-http://127.0.0.1:8081}"
desired_brute_force_protected="${KEYCLOAK_REALM_BRUTE_FORCE_PROTECTED:-true}"
desired_permanent_lockout="${KEYCLOAK_REALM_PERMANENT_LOCKOUT:-false}"
desired_failure_factor="${KEYCLOAK_REALM_FAILURE_FACTOR:-30}"
desired_wait_increment_seconds="${KEYCLOAK_REALM_WAIT_INCREMENT_SECONDS:-60}"
desired_max_failure_wait_seconds="${KEYCLOAK_REALM_MAX_FAILURE_WAIT_SECONDS:-900}"
desired_max_delta_time_seconds="${KEYCLOAK_REALM_MAX_DELTA_TIME_SECONDS:-43200}"
desired_minimum_quick_login_wait_seconds="${KEYCLOAK_REALM_MINIMUM_QUICK_LOGIN_WAIT_SECONDS:-60}"
desired_quick_login_check_milliseconds="${KEYCLOAK_REALM_QUICK_LOGIN_CHECK_MILLISECONDS:-1000}"

if [[ ! -f "$env_file" ]]; then
  echo "Missing env file: $env_file" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to ensure Keycloak realm brute-force policy." >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to ensure Keycloak realm brute-force policy." >&2
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

normalize_int() {
  local value="${1:-}"
  if [[ ! "$value" =~ ^[0-9]+$ ]]; then
    fail "Expected non-negative integer value, got '${value}'."
  fi
  echo "$value"
}

desired_brute_force_protected="$(normalize_bool "$desired_brute_force_protected")"
desired_permanent_lockout="$(normalize_bool "$desired_permanent_lockout")"
desired_failure_factor="$(normalize_int "$desired_failure_factor")"
desired_wait_increment_seconds="$(normalize_int "$desired_wait_increment_seconds")"
desired_max_failure_wait_seconds="$(normalize_int "$desired_max_failure_wait_seconds")"
desired_max_delta_time_seconds="$(normalize_int "$desired_max_delta_time_seconds")"
desired_minimum_quick_login_wait_seconds="$(normalize_int "$desired_minimum_quick_login_wait_seconds")"
desired_quick_login_check_milliseconds="$(normalize_int "$desired_quick_login_check_milliseconds")"

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

cleanup() {
  rm -f "$tmp_realm" "$tmp_payload"
}
trap cleanup EXIT

if ! curl -fsS -o "$tmp_realm" -H "Authorization: Bearer ${token}" \
  "${kc_base_url}/admin/realms/${realm}"; then
  fail "Failed to query Keycloak admin API for realm '${realm}'."
fi

read_current() {
  python3 - "$tmp_realm" <<'PY'
import json
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as fh:
  realm = json.load(fh)

def bool_to_str(value):
  return "true" if bool(value) else "false"

print(bool_to_str(realm.get("bruteForceProtected")))
print(bool_to_str(realm.get("permanentLockout")))
print(realm.get("failureFactor"))
print(realm.get("waitIncrementSeconds"))
print(realm.get("maxFailureWaitSeconds"))
print(realm.get("maxDeltaTimeSeconds"))
print(realm.get("minimumQuickLoginWaitSeconds"))
print(realm.get("quickLoginCheckMilliSeconds"))
PY
}

current_values="$(read_current)"
current_brute_force_protected="$(printf '%s\n' "$current_values" | sed -n '1p')"
current_permanent_lockout="$(printf '%s\n' "$current_values" | sed -n '2p')"
current_failure_factor="$(printf '%s\n' "$current_values" | sed -n '3p')"
current_wait_increment_seconds="$(printf '%s\n' "$current_values" | sed -n '4p')"
current_max_failure_wait_seconds="$(printf '%s\n' "$current_values" | sed -n '5p')"
current_max_delta_time_seconds="$(printf '%s\n' "$current_values" | sed -n '6p')"
current_minimum_quick_login_wait_seconds="$(printf '%s\n' "$current_values" | sed -n '7p')"
current_quick_login_check_milliseconds="$(printf '%s\n' "$current_values" | sed -n '8p')"

if [[ "$current_brute_force_protected" == "$desired_brute_force_protected" \
  && "$current_permanent_lockout" == "$desired_permanent_lockout" \
  && "$current_failure_factor" == "$desired_failure_factor" \
  && "$current_wait_increment_seconds" == "$desired_wait_increment_seconds" \
  && "$current_max_failure_wait_seconds" == "$desired_max_failure_wait_seconds" \
  && "$current_max_delta_time_seconds" == "$desired_max_delta_time_seconds" \
  && "$current_minimum_quick_login_wait_seconds" == "$desired_minimum_quick_login_wait_seconds" \
  && "$current_quick_login_check_milliseconds" == "$desired_quick_login_check_milliseconds" ]]; then
  echo "Keycloak realm '${realm}' brute-force policy already matches desired values."
  exit 0
fi

python3 - "$tmp_realm" "$tmp_payload" \
  "$desired_brute_force_protected" \
  "$desired_permanent_lockout" \
  "$desired_failure_factor" \
  "$desired_wait_increment_seconds" \
  "$desired_max_failure_wait_seconds" \
  "$desired_max_delta_time_seconds" \
  "$desired_minimum_quick_login_wait_seconds" \
  "$desired_quick_login_check_milliseconds" <<'PY'
import json
import sys

src = sys.argv[1]
dst = sys.argv[2]
brute_force_protected = sys.argv[3].lower() == "true"
permanent_lockout = sys.argv[4].lower() == "true"
failure_factor = int(sys.argv[5])
wait_increment_seconds = int(sys.argv[6])
max_failure_wait_seconds = int(sys.argv[7])
max_delta_time_seconds = int(sys.argv[8])
minimum_quick_login_wait_seconds = int(sys.argv[9])
quick_login_check_milliseconds = int(sys.argv[10])

with open(src, "r", encoding="utf-8") as fh:
  payload = json.load(fh)

payload["bruteForceProtected"] = brute_force_protected
payload["permanentLockout"] = permanent_lockout
payload["failureFactor"] = failure_factor
payload["waitIncrementSeconds"] = wait_increment_seconds
payload["maxFailureWaitSeconds"] = max_failure_wait_seconds
payload["maxDeltaTimeSeconds"] = max_delta_time_seconds
payload["minimumQuickLoginWaitSeconds"] = minimum_quick_login_wait_seconds
payload["quickLoginCheckMilliSeconds"] = quick_login_check_milliseconds

with open(dst, "w", encoding="utf-8") as fh:
  json.dump(payload, fh)
PY

if ! put_code="$(curl -sS -o /dev/null -w "%{http_code}" \
  -X PUT "${kc_base_url}/admin/realms/${realm}" \
  -H "Authorization: Bearer ${token}" \
  -H "Content-Type: application/json" \
  --data-binary "@${tmp_payload}")"; then
  fail "Failed to update Keycloak realm brute-force policy (curl error)."
fi

if [[ "$put_code" != "204" ]]; then
  fail "Failed to update Keycloak realm brute-force policy (HTTP ${put_code})."
fi

if ! curl -fsS -o "$tmp_realm" -H "Authorization: Bearer ${token}" \
  "${kc_base_url}/admin/realms/${realm}"; then
  fail "Failed to verify Keycloak realm brute-force policy via admin API."
fi

verify_values="$(read_current)"
verify_brute_force_protected="$(printf '%s\n' "$verify_values" | sed -n '1p')"
verify_permanent_lockout="$(printf '%s\n' "$verify_values" | sed -n '2p')"
verify_failure_factor="$(printf '%s\n' "$verify_values" | sed -n '3p')"
verify_wait_increment_seconds="$(printf '%s\n' "$verify_values" | sed -n '4p')"
verify_max_failure_wait_seconds="$(printf '%s\n' "$verify_values" | sed -n '5p')"
verify_max_delta_time_seconds="$(printf '%s\n' "$verify_values" | sed -n '6p')"
verify_minimum_quick_login_wait_seconds="$(printf '%s\n' "$verify_values" | sed -n '7p')"
verify_quick_login_check_milliseconds="$(printf '%s\n' "$verify_values" | sed -n '8p')"

if [[ "$verify_brute_force_protected" != "$desired_brute_force_protected" \
  || "$verify_permanent_lockout" != "$desired_permanent_lockout" \
  || "$verify_failure_factor" != "$desired_failure_factor" \
  || "$verify_wait_increment_seconds" != "$desired_wait_increment_seconds" \
  || "$verify_max_failure_wait_seconds" != "$desired_max_failure_wait_seconds" \
  || "$verify_max_delta_time_seconds" != "$desired_max_delta_time_seconds" \
  || "$verify_minimum_quick_login_wait_seconds" != "$desired_minimum_quick_login_wait_seconds" \
  || "$verify_quick_login_check_milliseconds" != "$desired_quick_login_check_milliseconds" ]]; then
  fail "Keycloak realm brute-force policy update did not take effect."
fi

echo "Keycloak realm '${realm}' brute-force policy was updated."
