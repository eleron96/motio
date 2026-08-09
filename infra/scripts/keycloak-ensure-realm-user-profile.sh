#!/usr/bin/env bash
set -euo pipefail

# Ensures the Keycloak user profile does NOT require first/last name.
# Registration only needs an email and a password; the display name is set
# later inside the app (profiles.display_name), so forcing a name on the
# Keycloak sign-up form is friction for nothing.
# Mirrors keycloak-ensure-realm-passwordpolicy.sh: settings live here (applied
# every deploy), NOT only in the realm JSON (which seeds on first import).

if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  cd "$root_dir"
fi

env_file="${1:-.env}"
kc_base_url="${KEYCLOAK_ADMIN_BASE_URL:-http://127.0.0.1:8081}"
# Space-separated user-profile attributes that must stay optional.
# Only firstName/lastName by default — email keeps its required flag.
desired_optional_attributes="${KEYCLOAK_REALM_OPTIONAL_USER_ATTRIBUTES:-firstName lastName}"

if [[ ! -f "$env_file" ]]; then
  echo "Missing env file: $env_file" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to ensure Keycloak user profile." >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to ensure Keycloak user profile." >&2
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
rm -f "$tmp_token_resp"

if [[ -z "$token" ]]; then
  fail "Failed to obtain Keycloak admin token (HTTP ${tmp_token_code}). Check KEYCLOAK_ADMIN/KEYCLOAK_ADMIN_PASSWORD."
fi

tmp_profile="$(mktemp)"
tmp_payload="$(mktemp)"

cleanup() {
  rm -f "$tmp_profile" "$tmp_payload"
}
trap cleanup EXIT

if ! curl -fsS -o "$tmp_profile" -H "Authorization: Bearer ${token}" \
  "${kc_base_url}/admin/realms/${realm}/users/profile"; then
  fail "Failed to query Keycloak user profile for realm '${realm}'."
fi

# Prints the attributes that still carry a "required" block, one per line.
read_required() {
  python3 - "$1" "$desired_optional_attributes" <<'PY'
import json
import sys

path = sys.argv[1]
wanted = sys.argv[2].split()

with open(path, "r", encoding="utf-8") as fh:
  profile = json.load(fh)

for attribute in profile.get("attributes") or []:
  if attribute.get("name") in wanted and attribute.get("required") is not None:
    print(attribute.get("name"))
PY
}

still_required="$(read_required "$tmp_profile")"

if [[ -z "$still_required" ]]; then
  echo "Keycloak realm '${realm}' user profile already optional for: ${desired_optional_attributes}."
  exit 0
fi

python3 - "$tmp_profile" "$tmp_payload" "$desired_optional_attributes" <<'PY'
import json
import sys

src, dst = sys.argv[1], sys.argv[2]
wanted = sys.argv[3].split()

with open(src, "r", encoding="utf-8") as fh:
  profile = json.load(fh)

for attribute in profile.get("attributes") or []:
  if attribute.get("name") in wanted:
    attribute.pop("required", None)

with open(dst, "w", encoding="utf-8") as fh:
  json.dump(profile, fh)
PY

if ! put_code="$(curl -sS -o /dev/null -w "%{http_code}" \
  -X PUT "${kc_base_url}/admin/realms/${realm}/users/profile" \
  -H "Authorization: Bearer ${token}" \
  -H "Content-Type: application/json" \
  --data-binary "@${tmp_payload}")"; then
  fail "Failed to update Keycloak user profile (curl error)."
fi

if [[ "$put_code" != "200" && "$put_code" != "204" ]]; then
  fail "Failed to update Keycloak user profile (HTTP ${put_code})."
fi

if ! curl -fsS -o "$tmp_profile" -H "Authorization: Bearer ${token}" \
  "${kc_base_url}/admin/realms/${realm}/users/profile"; then
  fail "Failed to verify Keycloak user profile via admin API."
fi

verify_required="$(read_required "$tmp_profile")"

if [[ -n "$verify_required" ]]; then
  fail "Keycloak user profile update did not take effect (still required: $(echo "$verify_required" | tr '\n' ' '))."
fi

echo "Keycloak realm '${realm}' user profile: dropped required flag from $(echo "$still_required" | tr '\n' ' ' | sed -e 's/ *$//')."
