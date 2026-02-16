#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  cd "$root_dir"
fi

env_file="${1:-.env}"
output_file="${2:-infra/keycloak/realm/timeline-realm.prod.json}"

if [[ ! -f "$env_file" ]]; then
  echo "Missing env file: $env_file" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required for Keycloak realm export." >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required for Keycloak realm export." >&2
  exit 1
fi

get_env_value() {
  local key="$1"
  local line
  line="$(grep -E "^${key}=" "$env_file" | head -n1 || true)"
  echo "${line#*=}"
}

resolve_path() {
  local path="$1"
  if [[ "$path" = /* ]]; then
    echo "$path"
  else
    echo "$root_dir/$path"
  fi
}

fail() {
  echo "$1" >&2
  exit 1
}

realm="$(get_env_value KEYCLOAK_REALM)"
admin_user="$(get_env_value KEYCLOAK_ADMIN)"
admin_pass="$(get_env_value KEYCLOAK_ADMIN_PASSWORD)"
base_url_from_file="$(get_env_value KEYCLOAK_ADMIN_BASE_URL)"
managed_client_ids_raw="$(get_env_value KEYCLOAK_MANAGED_CLIENT_IDS)"

realm="${realm:-timeline}"
admin_user="${admin_user:-admin}"
admin_pass="${admin_pass:-admin}"
kc_base_url="${KEYCLOAK_ADMIN_BASE_URL:-${base_url_from_file:-http://127.0.0.1:8081}}"
kc_base_url="${kc_base_url%/}"

if [[ -z "$managed_client_ids_raw" ]]; then
  app_client_id="$(get_env_value KEYCLOAK_APP_CLIENT_ID)"
  gotrue_client_id="$(get_env_value GOTRUE_EXTERNAL_KEYCLOAK_CLIENT_ID)"
  oauth_client_id="$(get_env_value OAUTH2_PROXY_CLIENT_ID)"
  managed_client_ids_raw="${app_client_id},${gotrue_client_id},${oauth_client_id}"
fi

if [[ -z "$managed_client_ids_raw" ]]; then
  fail "Unable to resolve managed client IDs. Set KEYCLOAK_MANAGED_CLIENT_IDS in ${env_file}."
fi

output_file_abs="$(resolve_path "$output_file")"
mkdir -p "$(dirname "$output_file_abs")"

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

python3 - "$output_file_abs" "$kc_base_url" "$realm" "$token" "$managed_client_ids_raw" <<'PY'
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

output_path = Path(sys.argv[1])
base_url = sys.argv[2].rstrip("/")
realm = sys.argv[3]
token = sys.argv[4]
managed_client_ids_raw = sys.argv[5]


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


def sanitize_client_attributes(value):
  attrs = value if isinstance(value, dict) else {}
  result = {}
  for key, attr_value in attrs.items():
    if not isinstance(key, str):
      continue
    if key == "realm_client":
      continue
    if key.startswith("client.secret."):
      continue
    result[key] = attr_value
  return dict(sorted(result.items(), key=lambda item: item[0]))


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

quoted_realm = urllib.parse.quote(realm, safe="")
current_realm = fetch_json(f"/admin/realms/{quoted_realm}")
client_summaries = fetch_json(f"/admin/realms/{quoted_realm}/clients?max=1000")

client_id_to_uuid = {}
for item in client_summaries if isinstance(client_summaries, list) else []:
  client_id = item.get("clientId")
  client_uuid = item.get("id")
  if client_id and client_uuid and client_id not in client_id_to_uuid:
    client_id_to_uuid[client_id] = client_uuid

managed_client_ids = []
for raw in managed_client_ids_raw.split(","):
  client_id = raw.strip()
  if client_id and client_id not in managed_client_ids:
    managed_client_ids.append(client_id)

if not managed_client_ids:
  raise RuntimeError("No managed client IDs resolved for Keycloak export.")

export_payload = {}
for key in realm_keys:
  if key not in current_realm:
    continue
  value = current_realm.get(key)
  if key == "supportedLocales":
    value = normalize_list(value)
  export_payload[key] = value

export_clients = []
for client_id in managed_client_ids:
  client_uuid = client_id_to_uuid.get(client_id)
  if not client_uuid:
    raise RuntimeError(f"Managed client not found in Keycloak realm: {client_id}")

  current_client = fetch_json(
    f"/admin/realms/{quoted_realm}/clients/{urllib.parse.quote(client_uuid, safe='')}"
  )
  export_client = {}
  for key in client_keys:
    if key not in current_client:
      continue
    value = current_client.get(key)
    if key in ("redirectUris", "webOrigins"):
      value = normalize_list(value)
    elif key == "attributes":
      value = sanitize_client_attributes(value)
    export_client[key] = value
  export_clients.append(export_client)

export_payload["clients"] = sorted(
  export_clients,
  key=lambda item: item.get("clientId", ""),
)

output_path.write_text(
  json.dumps(export_payload, ensure_ascii=False, indent=2) + "\n",
  encoding="utf-8",
)
print(f"Exported Keycloak realm baseline: {output_path}")
print(f"Managed clients: {', '.join(managed_client_ids)}")
PY

