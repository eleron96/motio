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

`prod-compose.sh` runs `infra/scripts/check-prod-secrets.sh` on every deploy by
itself, so the deploy is **blocked** if OIDC secrets are empty or use dev/default
values. To look into a suspected secrets problem by hand:

```bash
make check-prod-secrets
make check-prod-secrets-remote   # check .env on the remote server
```

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
- `BACKUP_RETENTION_COUNT` — database dumps kept **on the server** (`infra/backups`).
- `BACKUP_SCHEMAS` (default `public,auth,storage`)
- `BACKUP_MAX_UPLOAD_MB`
- `BACKUP_RESTORE_DB_URL` *(optional)*
- `BACKUP_AUTH_DB_USER`, `BACKUP_AUTH_HOST`
- `STORAGE_BACKUP_RETENTION_COUNT` — daily archives of uploaded files to keep.
- `KEYCLOAK_BACKUP_RETENTION_COUNT` — Keycloak database backups to keep.
- `METABASE_DB_URL` — Metabase app database (`postgresql://metabase:<password>@metabase-db:5432/metabase`,
  password URL-encoded). When set, dashboards and saved questions are dumped daily to `metabase/` in S3;
  empty disables it.
- `METABASE_BACKUP_RETENTION_COUNT` — Metabase database backups to keep.
- `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` —
  any S3-compatible bucket for off-server copies.
- `BACKUP_S3_KEEP_DAILY` / `BACKUP_S3_KEEP_WEEKLY` / `BACKUP_S3_KEEP_MONTHLY` (defaults
  14 / 8 / 12) — how database dumps (Supabase, Keycloak, Metabase) are rotated in S3: the
  newest N days, plus the newest dump of each of the last N weeks and N months that have
  one. That is about 34 dumps per database reaching a year back, instead of 90 dailies
  reaching three months. Never fewer than 5. The `*_RETENTION_COUNT` values above only
  govern the copies on the server.
- `BACKUP_HEARTBEAT_URL` — uptime monitor (GlitchTip *Heartbeat* monitor, healthchecks.io, …)
  that backup-service POSTs to after a nightly run where every step succeeded. Each failed
  step is reported to GlitchTip on its own; a missing ping is what catches a run that never
  happened (container down). Empty disables it.

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

---

## Feature flags

`VITE_FEATURE_*` are read when the `web` image is **built** on the server. They
are not in the repository, so check the server's `.env` before assuming a feature
is off. Missing or empty means **off**. To flip a flag, edit the server `.env`
and rebuild `web`; no release is needed.

| Flag | Turns on |
|---|---|
| `VITE_FEATURE_PROJECT_CARD` | the project card on the Projects page and the Contacts tab |
| `VITE_FEATURE_PROJECT_CARD_MOBILE` | the same project card on phones (needs `PROJECT_CARD`) |
| `VITE_FEATURE_PEOPLE_SUGGEST` | suggestions of people already entered elsewhere in the workspace when adding a contact or an external team member (needs `PROJECT_CARD`) |
| `VITE_FEATURE_WORKLOAD_HEATMAP` | the workload heatmap board on the dashboard; each workspace still opts in with its own switch in workspace settings (off by default) |
| `VITE_FEATURE_TIME_OFF` | marking days off on the timeline |
| `VITE_FEATURE_KANBAN` | the board view (beta), an optional view next to the timeline: each person still turns it on in account settings → Appearance; `/demo` does not force it on, but follows the flag like the app |
| `VITE_FEATURE_PUSH` | browser push notifications (needs the VAPID keys below) |
| `VITE_FEATURE_ACCOUNT_DELETION` | account self-deletion in account settings |

The `/demo` sandbox always shows the project card, contacts, heatmap and time off,
whatever the flags say.

## Push notifications

- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — the key pair the `push`
  Edge Function signs with. Generate a pair with `npx web-push generate-vapid-keys`;
  use separate keys per server.
- `VITE_PUSH_VAPID_PUBLIC_KEY` — the same public key, built into `web`.
- `PUSH_TICK_CRON` — how often backup-service asks the `push` function to send
  queued notifications (`*/1 * * * *` by default).

Without both keys the function reports push as not configured, and nothing is sent.

## Email (`mailer`)

The `mailer` Edge Function sends the welcome email and email broadcasts. Every
`MAILER_SMTP_*` / `MAILER_FROM_*` variable falls back to its `GOTRUE_SMTP_*`
counterpart, so one SMTP account is enough.

- `MAILER_SMTP_HOST`, `MAILER_SMTP_PORT`, `MAILER_SMTP_USER`, `MAILER_SMTP_PASS`
- `MAILER_FROM_EMAIL`, `MAILER_FROM_NAME`
- `MAILER_WELCOME_ENABLED` — welcome email after the first sign-in (`true` by default).
- `MAILER_DRY_RUN` — `1` logs messages instead of sending them.

## Error tracking

- `GLITCHTIP_DSN` — server-side errors (Edge Functions, backup-service).
- `VITE_GLITCHTIP_DSN` — browser errors, built into `web`.

Empty means error reporting is off.

## Background jobs (backup-service)

backup-service runs every scheduled job with `node-cron`. Defaults:

| Variable | Default | Job |
|---|---|---|
| `BACKUP_CRON` | `0 3 * * *` | daily database, storage and Keycloak backup |
| `PUSH_TICK_CRON` | `*/1 * * * *` | send queued push notifications |
| `BROADCAST_TICK_CRON` | `*/1 * * * *` | send scheduled email broadcasts |
| `EXPORT_WORKER_CRON` | `*/5 * * * *` | build requested data exports |
| `EXPORT_CLEANUP_CRON` | `0 5 * * *` | remove expired exports (`EXPORT_CLEANUP_BATCH_LIMIT` per run, `100`) |
| `PURGE_CRON` | `0 4 * * *` | purge accounts whose deletion grace period is over (`PURGE_CRON_ENABLED`, `true`) |
| `ACCOUNT_DELETION_HEALTH_CRON` | `15 * * * *` | health check of the account-deletion pipeline |

## Testing server only

- The testing server uses a Keycloak shared with its neighbour (see
  [Operations](operations.md)): `KEYCLOAK_ADMIN_BASE_URL=http://127.0.0.1:8081/auth`,
  `KEYCLOAK_INTERNAL_URL=http://ids-checker-keycloak:8080/auth`, and the
  `GOTRUE_EXTERNAL_KEYCLOAK_URL` / `OAUTH2_PROXY_*_URL` internal addresses use the
  same base; `KEYCLOAK_ADMIN`/`KEYCLOAK_ADMIN_PASSWORD` are that Keycloak's master
  admin.

- `SEED_TESTING_EXTRA_MEMBERS` — `email:role,email:role`; real people
  `make seed-testing` adds to the QA playground workspace (see
  [Operations](operations.md)). Personal addresses stay in the server `.env`,
  never in the repository.
