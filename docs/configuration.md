# Configuration

Environment variables live in `.env` (never committed). Template:
[`.env.example`](../.env.example).

See also: [Operations](operations.md) · [Troubleshooting](troubleshooting.md)

---

## Required variables for production

```
RESERVE_ADMIN_EMAIL
RESERVE_ADMIN_PASSWORD
KEYCLOAK_ADMIN
KEYCLOAK_ADMIN_PASSWORD
GOTRUE_EXTERNAL_KEYCLOAK_CLIENT_ID
GOTRUE_EXTERNAL_KEYCLOAK_SECRET
OAUTH2_PROXY_CLIENT_ID
OAUTH2_PROXY_CLIENT_SECRET
OAUTH2_PROXY_COOKIE_SECRET
```

Pre-deploy check:

```bash
make check-prod-secrets
make check-prod-secrets-remote   # check .env on the remote server
```

> The production deploy is **blocked** if OIDC secrets are empty or use dev/default
> values.

---

## Auth · Keycloak · oauth2-proxy

- `GOTRUE_EXTERNAL_KEYCLOAK_*` — OIDC provider for Supabase Auth.
- `KEYCLOAK_INTERNAL_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_ADMIN_REALM`,
  `KEYCLOAK_ADMIN_CLIENT_ID` — Edge Functions' access to the Keycloak Admin API.
- `KEYCLOAK_ADMIN_BASE_URL` — base URL for infra scripts
  (`http://127.0.0.1:8081` by default).
- `KEYCLOAK_MANAGED_CLIENT_IDS` — comma-separated clientIds for the realm baseline
  export.
- `KEYCLOAK_REALM_AUDIT_FILE` — path to the managed realm JSON for the drift audit.
- `KEYCLOAK_REALM_AUDIT_ENABLED` · `KEYCLOAK_REALM_AUDIT_FAIL_ON_DRIFT` — control the
  audit behavior in `up-prod`.
- `OAUTH2_PROXY_*` — proxying sign-in to the frontend.
- `OAUTH2_PROXY_BACKEND_LOGOUT_URL` — Keycloak end-session URL with
  `id_token_hint={id_token}`.
- `OAUTH2_PROXY_WHITELIST_DOMAINS` — allowlist for the `rd` redirect after
  `/oauth2/sign_out`.

## Supabase · Postgres

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_DB_URL`, `SUPABASE_INTERNAL_URL`
- `PGRST_DB_URI`, `GOTRUE_DB_DATABASE_URL`
- `POSTGRES_WAL_LEVEL` — must be `logical` for Supabase Realtime CDC.

## Backup / Restore

- `BACKUP_CRON`
- `BACKUP_RETENTION_COUNT`
- `BACKUP_SCHEMAS` (default `public,auth,storage`)
- `BACKUP_MAX_UPLOAD_MB`
- `BACKUP_RESTORE_DB_URL` *(optional)*
- `BACKUP_AUTH_DB_USER`, `BACKUP_AUTH_HOST`

## Liquibase

- `AUTO_PRE_MIGRATION_BACKUP`
- `AUTO_KEYCLOAK_PRE_SYNC_BACKUP`
- `LIQUIBASE_LOG_LEVEL`
- `MIGRATION_MAX_WAIT_SECONDS`

## Task media quotas

- `TASK_MEDIA_MAX_FILE_BYTES` — `5MB` by default.
- `TASK_MEDIA_USER_QUOTA_BYTES` — `200MB` by default.
- `TASK_MEDIA_WORKSPACE_QUOTA_BYTES` — `2GB` by default.
- `TASK_MEDIA_TOKEN_TTL_SECONDS` — `315360000` (10 years) by default. The token is
  baked into the URL inside the task description HTML and is not refreshed on the
  client, so keep the TTL long: a short value silently breaks images in older tasks.
