#!/usr/bin/env bash
set -euo pipefail

# Ensures the Keycloak realm offers the UI languages of the app (login page,
# account emails): en, ru, de by default. The app passes the user's language to
# Keycloak as ui_locales, so a locale missing here falls back to the default.
# Mirrors keycloak-ensure-realm-passwordpolicy.sh: settings live here (applied
# every deploy), NOT in the realm JSON (which only seeds on first import).
# defaultLocale is kept unless it is not among the supported locales.

if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  cd "$root_dir"
fi

env_file="${1:-.env}"
kc_base_url="${KEYCLOAK_ADMIN_BASE_URL:-http://127.0.0.1:8081}"
desired_locales="${KEYCLOAK_REALM_SUPPORTED_LOCALES:-en,ru,de}"

if [[ ! -f "$env_file" ]]; then
  echo "Missing env file: $env_file" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to ensure Keycloak realm locales." >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to ensure Keycloak realm locales." >&2
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
import json, sys
try:
  with open(sys.argv[1], "r", encoding="utf-8") as fh:
    print(json.load(fh).get("access_token", ""))
except Exception:
  print("")
PY
)"
rm -f "$tmp_token_resp"

if [[ -z "$token" ]]; then
  fail "Failed to obtain Keycloak admin token (HTTP ${tmp_token_code}). Check KEYCLOAK_ADMIN/KEYCLOAK_ADMIN_PASSWORD."
fi

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

# Prints "ok" when the realm already matches; otherwise writes the updated realm
# representation to the payload file and prints "update".
plan="$(python3 - "$tmp_realm" "$tmp_payload" "$desired_locales" <<'PY'
import json, sys
src, dst, raw = sys.argv[1], sys.argv[2], sys.argv[3]
desired = [code.strip() for code in raw.split(",") if code.strip()]
if not desired:
  raise SystemExit("KEYCLOAK_REALM_SUPPORTED_LOCALES is empty")
with open(src, "r", encoding="utf-8") as fh:
  realm = json.load(fh)
default = realm.get("defaultLocale") or desired[0]
if default not in desired:
  default = desired[0]
if (realm.get("internationalizationEnabled") is True
    and list(realm.get("supportedLocales") or []) == desired
    and realm.get("defaultLocale") == default):
  print("ok")
  raise SystemExit(0)
realm["internationalizationEnabled"] = True
realm["supportedLocales"] = desired
realm["defaultLocale"] = default
with open(dst, "w", encoding="utf-8") as fh:
  json.dump(realm, fh)
print("update")
PY
)"

if [[ "$plan" == "ok" ]]; then
  echo "Keycloak realm '${realm}' locales already match: ${desired_locales}."
  exit 0
fi

if ! put_code="$(curl -sS -o /dev/null -w "%{http_code}" \
  -X PUT "${kc_base_url}/admin/realms/${realm}" \
  -H "Authorization: Bearer ${token}" \
  -H "Content-Type: application/json" \
  --data-binary "@${tmp_payload}")"; then
  fail "Failed to update Keycloak realm locales (curl error)."
fi

if [[ "$put_code" != "204" ]]; then
  fail "Failed to update Keycloak realm locales (HTTP ${put_code})."
fi

if ! curl -fsS -o "$tmp_realm" -H "Authorization: Bearer ${token}" \
  "${kc_base_url}/admin/realms/${realm}"; then
  fail "Failed to re-query realm after the locale update."
fi

applied="$(python3 - "$tmp_realm" <<'PY'
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as fh:
  print(",".join(json.load(fh).get("supportedLocales") or []))
PY
)"

if [[ "$applied" != "$(printf '%s' "$desired_locales" | tr -d ' ')" ]]; then
  fail "Realm locales did not apply cleanly (got '${applied}', wanted '${desired_locales}')."
fi

echo "Keycloak realm '${realm}' locales set to: ${applied}"
