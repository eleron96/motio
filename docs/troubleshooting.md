# Troubleshooting

See also: [Operations](operations.md) · [Configuration](configuration.md)

---

## `OAUTH2_PROXY_COOKIE_SECRET is required for oauth2-proxy`

The `OAUTH2_PROXY_COOKIE_SECRET` variable is empty. `make up` usually generates it
automatically; for `make up-prod` set the value in `.env` or let the script generate
it.

## `localhost:5173 → ERR_CONNECTION_REFUSED`

```bash
docker compose -f infra/docker-compose.prod.yml --env-file .env ps
```

`oauth2-proxy` and `web` should be in the `Up` state.

## `Warning: could not confirm reserve admin bootstrap`

Migrations applied, but `bootstrap.sync` (which makes sure the reserve super-admin
account exists) did not return `200`. The usual cause is
wrong `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD`. Check the `functions` log for
`Invalid user credentials`.

## `Invalid user credentials` in admin sync

The admin account in `.env` must match the master admin in Keycloak. After fixing it,
restart: `keycloak`, `functions`, `gateway`.

## `The schema must be one of the following: public`

Somewhere a query still targets a non-public schema via PostgREST. In the current
version user storage is computed through `public.task_media`.

## Bad Request on the Keycloak redirect

Check consistency of:

- `OAUTH2_PROXY_CLIENT_ID`, `OAUTH2_PROXY_REDIRECT_URL`;
- `SITE_URL` / `APP_URL` / `GOTRUE_EXTERNAL_KEYCLOAK_REDIRECT_URI`;
- the output of `keycloak-ensure-client-urls.sh` (redirect URIs);
- the output of `keycloak-ensure-realm-frontend-url.sh` (realm `frontendUrl`).

## `volume supabase_db_data_pg17 declared as external, but could not be found`

On a server that has never run Motio (on one that ran PostgreSQL 15 the deploy
creates it while it moves the data, `docs/operations.md`, «Moving to PostgreSQL 17»):

```bash
docker volume create supabase_db_data_pg17
```

## `the service schemas differ: PostgreSQL 15 has '… 45 …', 17 has '… 91 …'`

A self-hosted update to PostgreSQL 17 by the installer of 0.10.66 stopped on a slow
server. The move let GoTrue, Storage and Realtime update their schemas and took
them as done after 15 s without a change; Realtime pauses for longer than that
before its tenant migrations (`realtime.schema_migrations`), so PostgreSQL 15 was
measured with 45 of them and the empty PostgreSQL 17 with all 91. Nothing was
lost: the PostgreSQL 15 volume is untouched.

Newer installers wait until each service reports its schema up to date. Update to
such a release directly (`install.sh update --version vX.Y.Z`): the move archives
the unfinished PostgreSQL 17 volume of the failed attempt and starts over.

If a later update reached 0.10.66 after such a failure (for example through
0.10.65), its `pre-update-*` set may hold the unfinished PostgreSQL 17 copy instead
of the PostgreSQL 15 data: before a `rollback` on 0.10.66, check the set as
described in «Backup sets», `docs/self-hosting.md`.

## `Warning: Keycloak realm drift detected`

The realm currently on the server does not match the managed JSON (the deploy
continued in audit-only mode when `KEYCLOAK_REALM_AUDIT_FAIL_ON_DRIFT=false`).

Check:

```bash
infra/scripts/keycloak-realm-drift-audit.sh .env
```

Update the baseline:

```bash
infra/scripts/keycloak-export-realm-baseline.sh .env infra/keycloak/realm/timeline-realm.prod.json
```

## Container restarts break the gateway (`connect() failed`)

nginx (gateway) resolves upstream IPs only at container start. After recreating
`rest` / `auth` / `realtime` / `backup` with `--no-deps`, restart the gateway too:

```bash
docker compose ... restart rest auth realtime backup && docker compose ... restart gateway
```

Prefer the full-stack path (`make deploy` / `prod-compose.sh`) over manual restarts.

## `Refusing to deploy: the locale catalogs were out of date`

The pre-deploy gate ran `lingui:extract` / `lingui:compile` and found a diff in
`src/locales`, so nothing was uploaded. The catalogs are already regenerated — review
the diff and commit it:

```bash
git diff -- src/locales
```

If the diff adds sources with ` 2` in the path, the working tree contained stray
duplicates — see the next entry. A diff that merely drops references to files you
deleted is an ordinary stale catalog: commit it.

## Stray `X 2.tsx` / `X 2.sql` duplicates

Artifacts of cloud-syncing the project folder. Symptoms: `typecheck` fails in a file
that "should not exist"; `.po` files gain string sources with ` 2` in the path; the CI
step `i18n catalogs up to date` turns red for no apparent reason.

```bash
find . -name '* 2.*' -not -path './node_modules/*'
```

Delete them, then regenerate and commit the catalogs:

```bash
npm run lingui:extract && npm run lingui:compile
```

Duplicated SQL migrations are harmless to the database: Liquibase follows the explicit
changeSet list in `infra/supabase/liquibase/changelog-master.xml` and never picks them
up.

## `TLS handshake timeout` pulling from `public.ecr.aws` during deploy

The `web` image build pulls its base images from Amazon's public registry, whose
anycast address is sometimes unreachable from the server. Re-running the deploy
does not help: pull the base images on the server first, retrying until they land,
then deploy again.

```bash
ssh root@<prod> 'for img in public.ecr.aws/docker/library/node:24-bookworm-slim public.ecr.aws/docker/library/nginx:1.30-alpine; do for i in $(seq 1 10); do docker pull "$img" && break; sleep 15; done; done'
```

The tags above are the ones `infra/web/Dockerfile` uses today; take the exact names
from the failing build log if they have moved on.

## `502` on every `/functions/v1/*` after recreating `edge-runtime`

Edge Functions fetch their `npm:` dependencies from the npm registry on a cold
start and keep them in a persistent Deno cache (`motio_deno_cache`), so a recreated
container normally starts from the cache. (Until edge-runtime 1.77 they came from
`esm.sh`, whose anycast address the production server could not reach, and the
compose file pinned it via `extra_hosts`.) If the `502` is back, check that the
registry answers from the server and that the cache volume is mounted:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://registry.npmjs.org/@supabase%2Fsupabase-js
docker inspect infra-functions-1 --format '{{json .Mounts}}'
docker logs --since 10m infra-functions-1 2>&1 | tail -20
```

## `git merge` into `main` hangs, or `cannot lock ref 'HEAD'`

Merging the working branch into `main` has stalled on the commit step more than
once. Run it with a generous timeout, `GIT_EDITOR=true` and no terminal on stdin.
If the process was killed, it leaves stale locks behind and the next commit fails
with `cannot lock ref 'HEAD'`. Make sure no git process is still running, then
remove the locks and finish the merge:

```bash
pgrep -fl 'git (merge|commit)' || rm -f .git/HEAD.lock .git/refs/heads/main.lock
```

`MERGE_HEAD` may still be present with a fully merged index: `git commit --no-edit`
completes it. If the merge state is gone, simply run the merge again.

## A migration is `EXECUTED` but its object is missing

`databasechangelog` records that a changeset ran, not that its object survived.
Verify against the catalog before trusting the log:

```bash
docker exec infra-db-1 psql -U supabase_admin -d postgres -c "select tgname from pg_trigger where tgname = '<trigger>'"
```

Write migrations so they can be re-applied safely (`create or replace`, `if not
exists`, `drop ... if exists` first) and fix a missing object with a new migration,
never by editing an old one.

## Testing sign-in sends the browser to `ids-checker-keycloak:8080`

On the testing server Keycloak is shared (see [Operations](operations.md),
"Testing stand"), and GoTrue builds the sign-in redirect from the internal
Keycloak URL. The gateway (`infra/supabase/nginx.conf`) rewrites it to the
public origin with one `proxy_redirect` line per internal address; if
`KEYCLOAK_INTERNAL_URL` / `GOTRUE_EXTERNAL_KEYCLOAK_URL` point somewhere new,
add a matching line. Check the redirect the app actually uses — `/oauth2/start`
does not go through GoTrue:

```bash
curl -s -o /dev/null -D - "https://test.motio.nikog.net/auth/v1/authorize?provider=keycloak&redirect_to=https://test.motio.nikog.net/app" | grep -i '^location'
```

The `Location` must start with `https://test.motio.nikog.net/realms/timeline/`.

## Many `password authentication failed for user "postgres"` in the db log

A burst of these lines in `docker logs infra-db-1` over a short time is a
brute-force attempt (the classic follow-up is `COPY FROM PROGRAM` dropping a
miner into `/tmp`). Check:

```bash
docker exec infra-db-1 psql -U supabase_admin -c "SELECT pid, usename, application_name, client_addr, state, query FROM pg_stat_activity WHERE state = 'active';"
docker exec infra-db-1 ls /tmp   # look for binaries such as init, mysql, bot
```

Respond in this order: rotate the passwords in the database (as `supabase_admin`,
the only role that can change `postgres`), update the server `.env`, restart
`rest`, `auth`, `realtime`, `backup` and then `gateway`; only then dig through
the logs. Remove planted files, block the source IPs in UFW and make sure the
database port is bound to `127.0.0.1`, not `0.0.0.0`.
