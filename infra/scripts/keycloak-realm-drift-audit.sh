#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  cd "$root_dir"
fi

env_file="${1:-.env}"
desired_file_arg="${2:-}"

if [[ ! -f "$env_file" ]]; then
  echo "Missing env file: $env_file" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required for Keycloak realm drift audit." >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required for Keycloak realm drift audit." >&2
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

resolve_path() {
  local path="$1"
  if [[ "$path" = /* ]]; then
    echo "$path"
  else
    echo "$root_dir/$path"
  fi
}

realm="$(get_env_value KEYCLOAK_REALM)"
admin_user="$(get_env_value KEYCLOAK_ADMIN)"
admin_pass="$(get_env_value KEYCLOAK_ADMIN_PASSWORD)"
base_url_from_file="$(get_env_value KEYCLOAK_ADMIN_BASE_URL)"
desired_file_from_env="$(get_env_value KEYCLOAK_REALM_AUDIT_FILE)"

realm="${realm:-timeline}"
admin_user="${admin_user:-admin}"
admin_pass="${admin_pass:-admin}"
kc_base_url="${KEYCLOAK_ADMIN_BASE_URL:-${base_url_from_file:-http://127.0.0.1:8081}}"
kc_base_url="${kc_base_url%/}"

desired_file="${desired_file_arg:-$desired_file_from_env}"
if [[ -z "$desired_file" ]]; then
  desired_file="infra/keycloak/realm/timeline-realm.prod.json"
fi

desired_file_abs="$(resolve_path "$desired_file")"
fallback_file_abs="$(resolve_path "infra/keycloak/realm/timeline-realm.json")"
if [[ ! -f "$desired_file_abs" ]]; then
  if [[ "$desired_file_abs" != "$fallback_file_abs" && -f "$fallback_file_abs" ]]; then
    echo "Warning: realm audit file not found: $desired_file_abs. Falling back to $fallback_file_abs." >&2
    desired_file_abs="$fallback_file_abs"
  else
    fail "Realm audit file not found: $desired_file_abs"
  fi
fi

tmp_token_resp="$(mktemp)"
cleanup() {
  rm -f "$tmp_token_resp"
}
trap cleanup EXIT

if ! token_http_code="$(curl -sS -o "$tmp_token_resp" -w "%{http_code}" \
  -X POST "${kc_base_url}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode grant_type=password \
  --data-urlencode client_id=admin-cli \
  --data-urlencode username="${admin_user}" \
  --data-urlencode password="${admin_pass}")"; then
  fail "Failed to request Keycloak admin token (curl error)."
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
print(payload.get("error_description") or payload.get("error") or "unknown")
PY
)"
  fail "Failed to obtain Keycloak admin token (HTTP ${token_http_code}, error=${err})."
fi

python3 - "$desired_file_abs" "$kc_base_url" "$realm" "$token" <<'PY'
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

desired_path = Path(sys.argv[1])
base_url = sys.argv[2].rstrip("/")
realm = sys.argv[3]
token = sys.argv[4]


def fetch_json(path: str):
  url = f"{base_url}{path}"
  request = urllib.request.Request(
    url,
    headers={
      "Authorization": f"Bearer {token}",
      "Accept": "application/json",
    },
  )
  try:
    with urllib.request.urlopen(request, timeout=20) as response:
      body = response.read().decode("utf-8")
  except urllib.error.HTTPError as exc:
    body = exc.read().decode("utf-8", errors="replace")
    raise RuntimeError(f"HTTP {exc.code} for {url}: {body[:300]}") from exc
  except Exception as exc:
    raise RuntimeError(f"Request failed for {url}: {exc}") from exc

  try:
    return json.loads(body)
  except json.JSONDecodeError as exc:
    raise RuntimeError(f"Non-JSON response from {url}: {body[:300]}") from exc


def normalize_list(value):
  if not isinstance(value, list):
    return []
  return sorted({str(item) for item in value})


def normalize_attributes(current, desired):
  desired_attrs = desired if isinstance(desired, dict) else {}
  current_attrs = current if isinstance(current, dict) else {}
  keys = sorted(desired_attrs.keys())
  return (
    {key: desired_attrs.get(key) for key in keys},
    {key: current_attrs.get(key) for key in keys},
  )


def pretty(value):
  return json.dumps(value, ensure_ascii=False, sort_keys=True)


try:
  desired = json.loads(desired_path.read_text(encoding="utf-8"))
except Exception as exc:
  print(f"Failed to read desired realm file {desired_path}: {exc}", file=sys.stderr)
  raise SystemExit(1)

quoted_realm = urllib.parse.quote(realm, safe="")
current_realm = fetch_json(f"/admin/realms/{quoted_realm}")
client_summaries = fetch_json(f"/admin/realms/{quoted_realm}/clients?max=1000")

client_id_to_uuid = {}
for item in client_summaries if isinstance(client_summaries, list) else []:
  client_id = item.get("clientId")
  client_uuid = item.get("id")
  if client_id and client_uuid and client_id not in client_id_to_uuid:
    client_id_to_uuid[client_id] = client_uuid

realm_keys = [
  "realm",
  "enabled",
  "sslRequired",
  "displayName",
  "displayNameHtml",
  "loginTheme",
  "registrationAllowed",
  "registrationEmailAsUsername",
  "loginWithEmailAllowed",
  "duplicateEmailsAllowed",
  "editUsernameAllowed",
  "verifyEmail",
  "resetPasswordAllowed",
  "rememberMe",
  "internationalizationEnabled",
  "supportedLocales",
  "defaultLocale",
]

client_keys = [
  "clientId",
  "name",
  "enabled",
  "protocol",
  "publicClient",
  "standardFlowEnabled",
  "directAccessGrantsEnabled",
  "serviceAccountsEnabled",
  "fullScopeAllowed",
  "attributes",
  "rootUrl",
  "baseUrl",
  "redirectUris",
  "webOrigins",
]

diffs = []
for key in realm_keys:
  if key not in desired:
    continue

  desired_value = desired.get(key)
  current_value = current_realm.get(key)
  if key == "supportedLocales":
    desired_value = normalize_list(desired_value)
    current_value = normalize_list(current_value)

  if desired_value != current_value:
    diffs.append(
      f"realm.{key}: desired={pretty(desired_value)} current={pretty(current_value)}"
    )

desired_clients = desired.get("clients") if isinstance(desired.get("clients"), list) else []
for desired_client in desired_clients:
  if not isinstance(desired_client, dict):
    continue

  client_id = desired_client.get("clientId")
  if not client_id:
    diffs.append("clients.<missing-clientId>: desired client entry has no clientId")
    continue

  client_uuid = client_id_to_uuid.get(client_id)
  if not client_uuid:
    diffs.append(f"clients.{client_id}: missing on server")
    continue

  current_client = fetch_json(
    f"/admin/realms/{quoted_realm}/clients/{urllib.parse.quote(client_uuid, safe='')}"
  )

  for key in client_keys:
    if key not in desired_client:
      continue

    desired_value = desired_client.get(key)
    current_value = current_client.get(key)

    if key in ("redirectUris", "webOrigins"):
      desired_value = normalize_list(desired_value)
      current_value = normalize_list(current_value)
    elif key == "attributes":
      desired_value, current_value = normalize_attributes(current_value, desired_value)

    if desired_value != current_value:
      diffs.append(
        f"clients.{client_id}.{key}: desired={pretty(desired_value)} current={pretty(current_value)}"
      )

if diffs:
  print(f"Keycloak realm drift detected ({len(diffs)} differences).")
  print(f"Managed config: {desired_path}")
  for item in diffs:
    print(f"- {item}")
  raise SystemExit(10)

print("Keycloak realm drift audit passed: no drift in managed fields.")
print(f"Managed config: {desired_path}")
PY

