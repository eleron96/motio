#!/usr/bin/env bash
set -euo pipefail

# Keeps the password fields on Keycloak's registration form. From Keycloak 26.7,
# with registration and "Verify email" both on, the form no longer asks for a
# password: the person verifies the email first and sets the password later.
# Motio's sign-up has always asked for it on the form, so this sets the
# "Always set password on register form" option of the Password Validation
# step in the realm's registration flow.
#
# KEYCLOAK_REALM_REGISTER_PASSWORD_ON_FORM=false switches to Keycloak's newer
# behaviour instead. Keycloak older than 26.7 has no such option and needs
# nothing: the script reports that and exits 0.

if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  cd "$root_dir"
fi

env_file="${1:-.env}"
kc_base_url="${KEYCLOAK_ADMIN_BASE_URL:-http://127.0.0.1:8081}"
config_key="always_set_password_on_register_form"
config_alias="motio-register-password-on-form"

if [[ ! -f "$env_file" ]]; then
  echo "Missing env file: $env_file" >&2
  exit 1
fi

for tool in curl python3; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "$tool is required to ensure the Keycloak registration password option." >&2
    exit 1
  fi
done

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
    1|true|yes|on) echo "true" ;;
    0|false|no|off) echo "false" ;;
    *) fail "Expected boolean value, got '${1:-}'." ;;
  esac
}

desired="$(get_env_value KEYCLOAK_REALM_REGISTER_PASSWORD_ON_FORM)"
desired="$(normalize_bool "${KEYCLOAK_REALM_REGISTER_PASSWORD_ON_FORM:-${desired:-true}}")"

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
[[ "$wait_ok" -eq 1 ]] || fail "Keycloak is not reachable at ${kc_base_url} (well-known did not return 200)."

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

if ! token_code="$(curl -sS -o "$tmp_dir/token.json" -w "%{http_code}" \
  -X POST "${kc_base_url}/realms/master/protocol/openid-connect/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode grant_type=password \
  --data-urlencode client_id=admin-cli \
  --data-urlencode username="${admin_user}" \
  --data-urlencode password="${admin_pass}")"; then
  fail "Keycloak admin token request failed (curl error)."
fi
token="$(python3 -c 'import json,sys
try: print(json.load(open(sys.argv[1])).get("access_token",""))
except Exception: print("")' "$tmp_dir/token.json")"
[[ -n "$token" ]] || fail "Failed to obtain Keycloak admin token (HTTP ${token_code}). Check KEYCLOAK_ADMIN/KEYCLOAK_ADMIN_PASSWORD."

api_get() {
  curl -fsS -o "$2" -H "Authorization: Bearer ${token}" "${kc_base_url}/admin/realms/${realm}$1"
}

api_get "" "$tmp_dir/realm.json" || fail "Failed to read Keycloak realm '${realm}'."
flow_alias="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("registrationFlow") or "registration")' "$tmp_dir/realm.json")"
flow_path="$(python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$flow_alias")"

api_get "/authentication/flows/${flow_path}/executions" "$tmp_dir/executions.json" \
  || fail "Failed to read the registration flow '${flow_alias}' of realm '${realm}'."

# One line: <execution id>\t<configurable>\t<config id or empty>
execution="$(python3 - "$tmp_dir/executions.json" <<'PY'
import json, sys
for e in json.load(open(sys.argv[1])):
    if e.get("providerId") == "registration-password-action":
        print("\t".join([e["id"], "true" if e.get("configurable") else "false", e.get("authenticationConfig") or ""]))
        break
PY
)"

if [[ -z "$execution" ]]; then
  echo "Keycloak realm '${realm}': registration flow '${flow_alias}' has no Password Validation step, nothing to do."
  exit 0
fi

IFS=$'\t' read -r execution_id configurable config_id <<< "$execution"

if [[ "$configurable" != "true" ]]; then
  echo "Keycloak realm '${realm}': this Keycloak keeps the password on the registration form by itself (no option to set)."
  exit 0
fi

if [[ -n "$config_id" ]]; then
  api_get "/authentication/config/${config_id}" "$tmp_dir/config.json" \
    || fail "Failed to read the Password Validation config of realm '${realm}'."
  current="$(python3 -c 'import json,sys; print((json.load(open(sys.argv[1])).get("config") or {}).get(sys.argv[2], "false"))' "$tmp_dir/config.json" "$config_key")"
  if [[ "$(normalize_bool "$current")" == "$desired" ]]; then
    echo "Keycloak realm '${realm}' registration password-on-form already matches: ${desired}."
    exit 0
  fi
  python3 - "$tmp_dir/config.json" "$tmp_dir/payload.json" "$config_key" "$desired" <<'PY'
import json, sys
cfg = json.load(open(sys.argv[1]))
cfg.setdefault("config", {})[sys.argv[3]] = sys.argv[4]
json.dump(cfg, open(sys.argv[2], "w"))
PY
  code="$(curl -sS -o /dev/null -w "%{http_code}" -X PUT \
    "${kc_base_url}/admin/realms/${realm}/authentication/config/${config_id}" \
    -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" \
    --data-binary "@$tmp_dir/payload.json")"
  [[ "$code" == "204" ]] || fail "Failed to update the Password Validation config (HTTP ${code})."
else
  python3 - "$tmp_dir/payload.json" "$config_alias" "$config_key" "$desired" <<'PY'
import json, sys
json.dump({"alias": sys.argv[2], "config": {sys.argv[3]: sys.argv[4]}}, open(sys.argv[1], "w"))
PY
  code="$(curl -sS -o /dev/null -w "%{http_code}" -X POST \
    "${kc_base_url}/admin/realms/${realm}/authentication/executions/${execution_id}/config" \
    -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" \
    --data-binary "@$tmp_dir/payload.json")"
  [[ "$code" == "201" ]] || fail "Failed to create the Password Validation config (HTTP ${code})."
fi

echo "Keycloak realm '${realm}' registration password-on-form set to: ${desired}."
