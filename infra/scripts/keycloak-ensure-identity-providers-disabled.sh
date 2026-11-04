#!/usr/bin/env bash
set -euo pipefail

# Switches off external sign-in providers by alias, in the app realm and in
# master (the Keycloak admin console). Off means enabled=false: the provider's
# settings and the accounts linked to it stay, so switching it back on is one
# click or an empty list here. A provider that does not exist is skipped.
#
# KEYCLOAK_DISABLED_IDENTITY_PROVIDERS — comma-separated aliases, empty by
# default (nothing changes). prod-compose.sh sets it to "google" for
# motio.nikog.net. The script never switches a provider on.

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

for tool in curl python3; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "$tool is required to ensure Keycloak identity providers." >&2
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

disabled_list="$(get_env_value KEYCLOAK_DISABLED_IDENTITY_PROVIDERS)"
disabled_list="${KEYCLOAK_DISABLED_IDENTITY_PROVIDERS:-$disabled_list}"
aliases=()
IFS=',' read -r -a raw_aliases <<< "$disabled_list"
for alias in "${raw_aliases[@]}"; do
  alias="$(printf '%s' "$alias" | tr -d '[:space:]')"
  [[ -n "$alias" ]] && aliases+=("$alias")
done

if [[ ${#aliases[@]} -eq 0 ]]; then
  echo "Keycloak identity providers: none listed to switch off."
  exit 0
fi

admin_user="$(get_env_value KEYCLOAK_ADMIN)"
admin_pass="$(get_env_value KEYCLOAK_ADMIN_PASSWORD)"
realm_from_file="$(get_env_value KEYCLOAK_REALM)"
admin_user="${admin_user:-admin}"
admin_pass="${admin_pass:-admin}"
app_realm="${realm_from_file:-${KEYCLOAK_REALM:-timeline}}"

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

realms=("$app_realm")
[[ "$app_realm" != "master" ]] && realms+=("master")

for realm in "${realms[@]}"; do
  for alias in "${aliases[@]}"; do
    url="${kc_base_url}/admin/realms/${realm}/identity-provider/instances/${alias}"
    code="$(curl -sS -o "$tmp_dir/idp.json" -w "%{http_code}" -H "Authorization: Bearer ${token}" "$url")"
    if [[ "$code" == "404" ]]; then
      echo "Keycloak realm '${realm}': no identity provider '${alias}', nothing to switch off."
      continue
    fi
    [[ "$code" == "200" ]] || fail "Failed to read identity provider '${alias}' in realm '${realm}' (HTTP ${code})."

    enabled="$(python3 -c 'import json,sys; print("true" if json.load(open(sys.argv[1])).get("enabled") else "false")' "$tmp_dir/idp.json")"
    if [[ "$enabled" == "false" ]]; then
      echo "Keycloak realm '${realm}': identity provider '${alias}' is already off."
      continue
    fi

    python3 - "$tmp_dir/idp.json" "$tmp_dir/payload.json" <<'PY'
import json, sys
idp = json.load(open(sys.argv[1]))
idp["enabled"] = False
json.dump(idp, open(sys.argv[2], "w"))
PY
    put_code="$(curl -sS -o /dev/null -w "%{http_code}" -X PUT "$url" \
      -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" \
      --data-binary "@$tmp_dir/payload.json")"
    [[ "$put_code" == "204" ]] || fail "Failed to switch off identity provider '${alias}' in realm '${realm}' (HTTP ${put_code})."
    echo "Keycloak realm '${realm}': identity provider '${alias}' switched off."
  done
done
