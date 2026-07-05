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

## `Warning: could not confirm Keycloak sync bootstrap`

Migrations applied, but `bootstrap.sync` did not return `200`. The usual cause is
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

## `volume supabase_db_data declared as external, but could not be found`

```bash
docker volume create supabase_db_data
```

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
