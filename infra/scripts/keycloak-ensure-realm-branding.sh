#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  cd "$root_dir"
fi

env_file="${1:-.env}"
kc_base_url="${KEYCLOAK_ADMIN_BASE_URL:-http://127.0.0.1:8081}"
desired_display_name="${KEYCLOAK_REALM_DISPLAY_NAME:-Motio - Timeline Planner}"
desired_display_name_html="${KEYCLOAK_REALM_DISPLAY_NAME_HTML:-<strong>Motio - Timeline Planner</strong>}"
desired_email_theme="${KEYCLOAK_REALM_EMAIL_THEME:-timeline}"

if [[ ! -f "$env_file" ]]; then
  echo "Missing env file: $env_file" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to ensure Keycloak realm branding." >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to ensure Keycloak realm branding." >&2
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
print(realm.get("displayName") or "")
print(realm.get("displayNameHtml") or "")
print(realm.get("emailTheme") or "")
PY
)"

current_display_name="$(printf '%s\n' "$current_values" | sed -n '1p')"
current_display_name_html="$(printf '%s\n' "$current_values" | sed -n '2p')"
current_email_theme="$(printf '%s\n' "$current_values" | sed -n '3p')"

if [[ "$current_display_name" == "$desired_display_name" \
  && "$current_display_name_html" == "$desired_display_name_html" \
  && "$current_email_theme" == "$desired_email_theme" ]]; then
  echo "Keycloak realm '${realm}' branding already matches desired values."
  exit 0
fi

python3 - "$tmp_realm" "$tmp_payload" "$desired_display_name" "$desired_display_name_html" "$desired_email_theme" <<'PY'
import json
import sys

src, dst, display_name, display_name_html, email_theme = sys.argv[1:]
with open(src, "r", encoding="utf-8") as fh:
  payload = json.load(fh)
payload["displayName"] = display_name
payload["displayNameHtml"] = display_name_html
payload["emailTheme"] = email_theme
with open(dst, "w", encoding="utf-8") as fh:
  json.dump(payload, fh)
PY

if ! put_code="$(curl -sS -o /dev/null -w "%{http_code}" \
  -X PUT "${kc_base_url}/admin/realms/${realm}" \
  -H "Authorization: Bearer ${token}" \
  -H "Content-Type: application/json" \
  --data-binary "@${tmp_payload}")"; then
  fail "Failed to update Keycloak realm branding (curl error)."
fi

if [[ "$put_code" != "204" ]]; then
  fail "Failed to update Keycloak realm branding (HTTP ${put_code})."
fi

if ! curl -fsS -o "$tmp_verify" -H "Authorization: Bearer ${token}" \
  "${kc_base_url}/admin/realms/${realm}"; then
  fail "Failed to verify Keycloak realm branding via admin API."
fi

verify_values="$(python3 - "$tmp_verify" <<'PY'
import json
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as fh:
  realm = json.load(fh)
print(realm.get("displayName") or "")
print(realm.get("displayNameHtml") or "")
print(realm.get("emailTheme") or "")
PY
)"

verify_display_name="$(printf '%s\n' "$verify_values" | sed -n '1p')"
verify_display_name_html="$(printf '%s\n' "$verify_values" | sed -n '2p')"
verify_email_theme="$(printf '%s\n' "$verify_values" | sed -n '3p')"

if [[ "$verify_display_name" != "$desired_display_name" \
  || "$verify_display_name_html" != "$desired_display_name_html" \
  || "$verify_email_theme" != "$desired_email_theme" ]]; then
  fail "Keycloak realm branding update did not take effect."
fi

echo "Keycloak realm '${realm}' branding was updated."
