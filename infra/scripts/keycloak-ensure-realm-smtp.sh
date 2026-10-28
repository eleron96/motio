#!/usr/bin/env bash
set -euo pipefail

# Self-hosted installs only (infra/scripts/install.sh): gives the realm the same
# SMTP account the app mails from (GOTRUE_SMTP_*), so Keycloak can send
# invitation, verification and password-reset emails, and requires email
# verification at sign-up. Without GOTRUE_SMTP_HOST no mail can go out, so
# verification is switched off instead — otherwise nobody could finish signing
# up. Not called by the motio.nikog.net or testing deploys, whose realm mail is
# set up by hand.

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

plan="$(python3 - "$tmp_realm" "$tmp_payload" \
  "$(get_env_value GOTRUE_SMTP_HOST)" "$(get_env_value GOTRUE_SMTP_PORT)" \
  "$(get_env_value GOTRUE_SMTP_USER)" "$(get_env_value GOTRUE_SMTP_PASS)" \
  "$(get_env_value GOTRUE_SMTP_ADMIN_EMAIL)" "$(get_env_value GOTRUE_SMTP_SENDER_NAME)" <<'PY'
import json, sys
src, dst, host, port, user, password, sender, sender_name = sys.argv[1:9]
with open(src, "r", encoding="utf-8") as fh:
  realm = json.load(fh)
if not host:
  # No mail server: sign-up must not wait for a verification email.
  if realm.get("verifyEmail") is False:
    print("ok")
    raise SystemExit(0)
  realm["verifyEmail"] = False
  with open(dst, "w", encoding="utf-8") as fh:
    json.dump(realm, fh)
  print("update")
  raise SystemExit(0)
port = port or "587"
desired = {
  "host": host,
  "port": port,
  "from": sender,
  "fromDisplayName": sender_name or "Motio",
  "auth": "true" if user else "false",
  "user": user,
  "password": password,
  # 465 is implicit TLS; anything else (587, 25) upgrades with STARTTLS.
  "ssl": "true" if port == "465" else "false",
  "starttls": "false" if port == "465" else "true",
}
current = realm.get("smtpServer") or {}
# Keycloak masks the stored password as "**********" when reading it back.
comparable = {k: v for k, v in desired.items() if k != "password"}
if (all(str(current.get(k, "")) == v for k, v in comparable.items()) and current.get("password")
    and realm.get("verifyEmail") is True):
  print("ok")
  raise SystemExit(0)
realm["smtpServer"] = desired
realm["verifyEmail"] = True
with open(dst, "w", encoding="utf-8") as fh:
  json.dump(realm, fh)
print("update")
PY
)"

if [[ "$plan" == "ok" ]]; then
  echo "Keycloak realm '${realm}' mail settings already match .env."
  exit 0
fi

if ! put_code="$(curl -sS -o /dev/null -w "%{http_code}" \
  -X PUT "${kc_base_url}/admin/realms/${realm}" \
  -H "Authorization: Bearer ${token}" \
  -H "Content-Type: application/json" \
  --data-binary "@${tmp_payload}")"; then
  fail "Failed to update Keycloak realm SMTP (curl error)."
fi

if [[ "$put_code" != "204" ]]; then
  fail "Failed to update Keycloak realm SMTP (HTTP ${put_code})."
fi

echo "Keycloak realm '${realm}' mail settings applied from .env."
