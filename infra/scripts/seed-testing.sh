#!/usr/bin/env bash
set -euo pipefail

# Fills the TESTING stand (46.149.69.61) with test data: the "Motio QA
# Playground" workspace, built from the /demo seed and shared by the QA
# accounts of the testing Keycloak. Rerun at any time for a fresh playground
# with dates around today; nothing outside that workspace is touched, apart
# from the QA accounts' display names.
#
# Keycloak is only read: the QA accounts (and their passwords) must already
# exist there. Refuses the production server.

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
host="${1:-root@46.149.69.61}"
remote_dir="/opt/motio-test"

prod_ip="94.141.162.237"
if [[ "$host" == *"$prod_ip"* ]]; then
  echo "ERROR: seed-testing.sh must not target the production server ($prod_ip)." >&2
  exit 1
fi

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

cd "$root_dir"
npx --no-install esbuild infra/scripts/seed-testing/build-seed-sql.ts \
  --bundle --platform=node --format=esm --log-level=warning \
  --outfile="$work_dir/build-seed-sql.mjs"
node "$work_dir/build-seed-sql.mjs" > "$work_dir/seed.sql"
qa_emails="$(node "$work_dir/build-seed-sql.mjs" --emails | tr '\n' ' ')"

echo "Seed target (TESTING): ${host}:${remote_dir}"

# 1. Each QA account needs a Supabase user linked to its Keycloak identity, the
#    way the admin console creates users. Without the link the first sign-in
#    would create a new, empty user instead of landing in the playground.
ssh "$host" "REMOTE_DIR='$remote_dir' QA_EMAILS='$qa_emails' bash -s" <<'REMOTE'
set -euo pipefail
cd "$REMOTE_DIR"

env_get() { grep -E "^$1=" .env | head -n1 | cut -d= -f2- || true; }
sq() { docker exec infra-db-1 psql -U supabase_admin -d postgres -At -v ON_ERROR_STOP=1 -c "$1" </dev/null; }
kq() { docker exec infra-keycloak-db-1 psql -U keycloak -d keycloak -At -v ON_ERROR_STOP=1 -c "$1" </dev/null; }

service_key="$(env_get SERVICE_ROLE_KEY)"
realm="$(env_get KEYCLOAK_REALM)"
realm="${realm:-timeline}"
issuer="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' infra-auth-1 \
  | grep -E '^GOTRUE_EXTERNAL_KEYCLOAK_URL=' | cut -d= -f2- || true)"
issuer="${issuer:-keycloak}"

for email in $QA_EMAILS; do
  keycloak_id="$(kq "select u.id from user_entity u join realm r on r.id = u.realm_id where r.name = '$realm' and lower(u.email) = lower('$email')")"
  if [[ -z "$keycloak_id" ]]; then
    echo "ERROR: $email is not in the testing Keycloak (realm $realm)." >&2
    exit 1
  fi

  user_id="$(sq "select id from auth.users where lower(email) = lower('$email')")"
  state="exists"
  if [[ -z "$user_id" ]]; then
    user_id="$(curl -sS -m 30 -X POST http://localhost:8080/auth/v1/admin/users \
      -H "apikey: $service_key" -H "Authorization: Bearer $service_key" \
      -H 'Content-Type: application/json' \
      -d "{\"email\":\"$email\",\"email_confirm\":true,\"app_metadata\":{\"provider\":\"keycloak\",\"providers\":[\"keycloak\"]}}" \
      | python3 -c 'import json, sys; print(json.load(sys.stdin).get("id", ""))')"
    if [[ -z "$user_id" ]]; then
      echo "ERROR: could not create the Supabase user for $email." >&2
      exit 1
    fi
    state="created"
  fi

  sq "select public.link_keycloak_identity('$user_id', '$keycloak_id', '$email', null, '$issuer')" >/dev/null
  echo "  $email: Supabase user $state, linked to Keycloak"
done
REMOTE

# 2. The playground itself, as one transaction: a failure leaves the previous
#    playground in place.
ssh "$host" "docker exec -i infra-db-1 psql -U supabase_admin -d postgres -At -q -v ON_ERROR_STOP=1 --single-transaction" \
  < "$work_dir/seed.sql"

echo "Testing seed finished: sign in as qa.alice / qa.bob / qa.carol / qa.dave @motio.test."
