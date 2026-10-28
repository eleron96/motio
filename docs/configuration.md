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
- `KEYCLOAK_REALM_SUPPORTED_LOCALES` — languages the realm offers on the sign-in page
  and in account emails, applied by `keycloak-ensure-realm-locales.sh` on every deploy
  (`en,ru,de` by default, the same as the app).
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
- `STORAGE_BACKUP_RETENTION_COUNT` — manual archives of uploaded files (`POST /backup/storage-backups`)
  kept on the server.
- `BACKUP_FILES_DELETED_GRACE_DAYS` (default 90) — uploaded files (avatars, task media) are copied
  to S3 one by one under `files/`, each file once; when a file is deleted in the app its S3 copy
  is kept this many days, then removed. Data exports (`user-exports`) are not copied.
- `KEYCLOAK_BACKUP_RETENTION_COUNT` — Keycloak database backups to keep.
- `METABASE_DB_URL` — Metabase app database (`postgresql://metabase:<password>@metabase-db:5432/metabase`,
  password URL-encoded). When set, dashboards and saved questions are dumped daily to `metabase/` in S3;
  empty disables it.
- `METABASE_BACKUP_RETENTION_COUNT` — Metabase database backups to keep.
- `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` —
  any S3-compatible bucket for off-server copies.
- `BACKUP_AGE_RECIPIENT` — [age](https://age-encryption.org) public key (`age1…`). When
  set, every object sent to S3 is encrypted with it and stored as `<name>.age`; the server
  holds only this public key and cannot decrypt its own S3 copies. The matching private key
  (`AGE-SECRET-KEY-1…`) must be kept off the server — without it the S3 copies cannot be
  restored. A malformed value stops all S3 uploads (and reports to GlitchTip) rather than
  falling back to plaintext. Local copies in `infra/backups` stay unencrypted. Empty = S3
  copies are plaintext.
- `BACKUP_S3_KEEP_DAILY` / `BACKUP_S3_KEEP_WEEKLY` / `BACKUP_S3_KEEP_MONTHLY` (defaults
  14 / 8 / 12) — how database dumps (Supabase, Keycloak, Metabase) are rotated in S3: the
  newest N days, plus the newest dump of each of the last N weeks and N months that have
  one. That is about 34 dumps per database reaching a year back, instead of 90 dailies
  reaching three months. Never fewer than 5. The `*_RETENTION_COUNT` values above only
  govern the copies on the server.
- `BACKUP_S3_WARN_GB` / `BACKUP_S3_ALARM_GB` (defaults 7 / 9) — the last nightly step sums
  every object in the bucket (logged with a per-family breakdown). From the warning line it
  sends a GlitchTip warning; from the alarm line the step fails (GlitchTip error, no
  heartbeat). Nothing is deleted to make room.
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
| `VITE_FEATURE_WORKSPACE_API` | the API section in workspace settings, where admins create tokens for importing absences ([API](api.md)); hidden in `/demo` |

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

## Site address and analytics

Built into `web` at build time (`vite/siteIdentity.ts`):

- `VITE_PUBLIC_SITE_URL` — the public address of this install, e.g.
  `https://planner.example.com`, no path or trailing slash. It goes into the
  canonical and link-preview tags of `index.html`, `robots.txt` and `sitemap.xml`.
  Empty means `https://motio.nikog.net`.
- `VITE_PLAUSIBLE_DOMAIN`, `VITE_PLAUSIBLE_SRC` — page-view analytics with a
  Plausible-compatible script (`data-domain` and script URL). Set both or neither;
  empty means the page loads no analytics script. A self-hosted install sends
  nothing anywhere by default. If you turn it on behind your own Caddyfile, allow
  the script host in its `Content-Security-Policy`.

The motio.nikog.net deploy (`prod-compose.sh`) fills in its own analytics values when
the server `.env` has no `VITE_PLAUSIBLE_*` keys; a key present in `.env`, even
empty, wins.

## Self-hosted install (`install.sh`)

Written by `infra/scripts/install.sh`; see [Self-hosting](self-hosting.md).

- `MOTIO_INSTANCE` — compose project and volume prefix (`motio`).
- `MOTIO_MODE` — `tls` (Caddy gets the certificate, ports 80/443) or `proxy`
  (behind your own reverse proxy).
- `MOTIO_HTTP_BIND` — where Caddy listens in mode `proxy`, e.g. `127.0.0.1:8088`.
- `MOTIO_PROXY_NETWORK` — mode `proxy` only: the existing Docker network of your
  reverse proxy, e.g. `npm_backend`. Caddy joins it under the name
  `MOTIO_INSTANCE` and publishes no port; empty means `MOTIO_HTTP_BIND` is used.
- `MOTIO_GATEWAY_PORT`, `MOTIO_KEYCLOAK_PORT` — loopback ports of the API gateway
  and Keycloak, used by `install.sh` for setup and `status`.

`infra/docker-compose.selfhost.local.yml`, if present, is applied on top of the
compose files (labels, extra networks); it is not tracked in git.

## Admin → System

- `MOTIO_UPDATE_CHECK` — the System section of the admin console asks GitHub for
  the latest release at most every 6 hours (`true` by default). `false` turns it
  off; nothing about the install is ever sent.

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

A failed job is reported to GlitchTip (tag `job`). The push, broadcast and
data-export jobs call Edge Functions, which every deploy restarts for a few
seconds, so they are reported only after several failed runs in a row (push and
broadcast: 3, data export: 2; the event carries `consecutiveFailures`). A single
failure is still written to the container log.

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

- The testing deploy does not fill in `VITE_PLAUSIBLE_*`, so the testing site loads
  no analytics script and its visits stay out of the public site's statistics.
