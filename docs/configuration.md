# Configuration

Environment variables live in `.env` (never committed). Template:
[`.env.example`](../.env.example).

Optional extras that change how Motio behaves are **server settings**, not
environment variables: switches a super admin flips in **Admin → Settings** or from
the command line, kept in the database (`instance_settings`, migration 0176), all
off by default — off is Motio as it was. The list and the defaults are in
`infra/supabase/functions/_shared/instanceSettingsRegistry.ts`; how to change them
is in [Server settings](#server-settings).

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
- `KEYCLOAK_SUPER_ADMIN_FROM_GROUPS`, `KEYCLOAK_WORKSPACES_FROM_GROUPS`,
  `KEYCLOAK_WORKSPACES_FROM_GROUPS_REMOVE` — the older way to turn on the server
  settings `groups.superAdmin`, `groups.workspaces` and `groups.removeOnLeave`:
  `true` turns the setting on and locks it in the admin console; `false` or empty
  leaves it to the console. What each one does:
- `KEYCLOAK_SUPER_ADMIN_FROM_GROUPS` — `true` lets the realm role `app_super_admin`
  count when it comes from a Keycloak group or a composite role, not only when it
  is assigned to the user directly. Default `false`. Leaving the group takes the
  access away on the next check (see [Administrators](self-hosting/admins.md#or-grant-it-through-a-group)).
- `KEYCLOAK_WORKSPACES_FROM_GROUPS` — `true` lets Keycloak groups put people into
  workspaces: a super admin maps a group to a workspace and a role in the admin
  console (**Group access**), and whoever is in the group joins it the next time
  they open Motio. Existing members keep their role. Default `false`: no extra
  request to Keycloak and no admin section ([Workspaces from groups](self-hosting/people.md#workspaces-from-groups)).
- `KEYCLOAK_WORKSPACES_FROM_GROUPS_REMOVE` — with the above, `true` also takes away
  the access a group gave once the person is no longer in any group mapped to that
  workspace (at their next visit). Access given by hand or by an invitation, and the
  owner's, is never taken away. Default `false`: access is only added.
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
- `KEYCLOAK_REALM_REGISTER_PASSWORD_ON_FORM` (default `true`) — the registration form
  asks for the password right away, as it always has. From Keycloak 26.7, with
  "Verify email" on, Keycloak would otherwise ask for it only after the email is
  verified; `false` switches to that. Applied by
  `keycloak-ensure-realm-register-password.sh` on every deploy; older Keycloak needs
  nothing and the script skips.
- `KEYCLOAK_DISABLED_IDENTITY_PROVIDERS` (default empty) — comma-separated aliases of
  external sign-in providers to switch off in the app realm and in `master`, e.g.
  `google`. Off means `enabled=false`: settings and linked accounts stay, so emptying
  the list and switching the provider back on in Keycloak restores it. Applied by
  `keycloak-ensure-identity-providers-disabled.sh`; it never switches a provider on.
  `prod-compose.sh` uses `google` when the key is not set (motio.nikog.net signs in
  with email and password); `none` there keeps every provider.
- `KEYCLOAK_JAVA_OPTS_APPEND` (default `-Xms512m`; `install.sh` writes `-Xms256m`) — extra
  JVM options for Keycloak. Leave out `-Xmx`: Keycloak caps its heap at 70% of the
  container's memory limit, and a heap as large as the limit gets the container killed
  for memory.
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
- `POSTGRES_SHARED_PRELOAD_LIBRARIES` (default `pg_stat_statements`) — libraries loaded at
  database start; the default enables the `pg_stat_statements` view (per-query time and
  calls) for finding slow queries. A change applies only after the database restarts.

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

- `AUTO_PRE_START_SNAPSHOT` (default `true`) — production deploys snapshot the database
  and uploaded files before new service images start (`infra/scripts/prod-snapshot.sh`,
  `infra/backups/snapshots/`, newest 5 kept); `false` skips it.
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
| `VITE_FEATURE_KANBAN` | the board view (beta), an optional view next to the timeline: each person still turns it on in account settings → Appearance; `/demo` does not force it on, but follows the flag like the app |
| `VITE_FEATURE_PUSH` | browser push notifications (needs the VAPID keys below) |
| `VITE_FEATURE_ACCOUNT_DELETION` | account self-deletion in account settings |
| `VITE_FEATURE_WORKSPACE_API` | the API section in workspace settings, where admins create tokens for importing absences ([API](api.md)); hidden in `/demo` |
| `VITE_FEATURE_TASK_LIVE_DRAFTS` | teammates' drafts in an open task card, live and semi-transparent: the subtask or comment someone is typing, and that someone edits the description (desktop only). Shared through a private Realtime channel that only members of the workspace can join; nothing is stored. Off in `/demo`. On a brand-new self-hosted install the channel's access rules land with the first `install.sh update` (Realtime sets up its tables only once someone connects) |

The project card, contacts, people suggestions, the workload heatmap and time off
used to be behind flags of their own; they are always on now. The heatmap still
needs each workspace to opt in with its own switch in workspace settings (off by
default). Old `VITE_FEATURE_TIME_OFF`, `VITE_FEATURE_WORKLOAD_HEATMAP`,
`VITE_FEATURE_PROJECT_CARD`, `VITE_FEATURE_PROJECT_CARD_MOBILE` and
`VITE_FEATURE_PEOPLE_SUGGEST` lines in `.env` do nothing and can be removed.

## Push notifications

- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — the key pair the `push`
  Edge Function signs with. Generate a pair with `npx web-push generate-vapid-keys`;
  use separate keys per server.
- `VITE_PUSH_VAPID_PUBLIC_KEY` — the same public key, built into `web`.
- `PUSH_TICK_CRON` — how often backup-service asks the `push` function to send
  queued notifications (`*/1 * * * *` by default).

Without both keys the function reports push as not configured, and nothing is sent.

The server only sends to the browsers' own push services: Google FCM (Chrome, Android
and other Chromium browsers), Mozilla (Firefox), Apple (Safari on macOS and iOS) and
Microsoft WNS (Edge on Windows). A subscription pointing anywhere else is refused by
the database and skipped by the `push` function, so nobody can make the server send
requests to other addresses. A browser on another push service cannot turn push on;
its host is added in `infra/supabase/functions/_shared/pushEndpoint.ts` and the
matching migration.

## Email (`mailer`)

The `mailer` Edge Function sends the welcome email and email broadcasts. Every
`MAILER_SMTP_*` / `MAILER_FROM_*` variable falls back to its `GOTRUE_SMTP_*`
counterpart, so one SMTP account is enough.

- `MAILER_SMTP_HOST`, `MAILER_SMTP_PORT`, `MAILER_SMTP_USER`, `MAILER_SMTP_PASS`
- `MAILER_FROM_EMAIL`, `MAILER_FROM_NAME`
- `MAILER_WELCOME_ENABLED` — welcome email after the first sign-in (`true` by default).
- `MAILER_DRY_RUN` — `1` logs messages instead of sending them. Without an SMTP
  host Motio sends nothing anyway, so the installer writes `0`; installs made
  without email by older versions have `1`, which `install.sh up`/`status` and
  **Admin → System** point out once an SMTP server is set.

## Site address and analytics

Built into `web` at build time (`vite/siteIdentity.ts`):

- `VITE_PUBLIC_SITE_URL` — the public address of this install, e.g.
  `https://planner.example.com`, no path or trailing slash. It goes into the
  canonical and link-preview tags of `index.html`, `robots.txt` and `sitemap.xml`.
  Empty means `https://motio.nikog.net`.
- `VITE_START_PAGE` — what the site root (`/`) opens: `landing` (default) shows
  the public start page with the demo link, `app` goes straight to sign-in and the
  app. With `app` the source code link moves from the start page to the version
  line in account settings.
- `VITE_PLAUSIBLE_DOMAIN`, `VITE_PLAUSIBLE_SRC` — page-view analytics with a
  Plausible-compatible script (`data-domain` and script URL). Set both or neither;
  empty means the page loads no analytics script. A self-hosted install sends
  nothing anywhere by default. If you turn it on behind your own Caddyfile, allow
  the script host in its `Content-Security-Policy`.

The motio.nikog.net deploy (`prod-compose.sh`) fills in its own analytics values when
the server `.env` has no `VITE_PLAUSIBLE_*` keys; a key present in `.env`, even
empty, wins.

## Self-hosted install (`install.sh`)

Written by `infra/scripts/install.sh`; see the [self-hosting guide](self-hosting/README.md).

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

- `MOTIO_UPDATE_CHECK` — the admin console asks GitHub for the published
  releases at most every 6 hours (`true` by default) and marks its System section
  when a newer one is out. `false` turns it off; nothing about the install is
  ever sent.

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
| — (fixed) | `40 4 * * *` | drop task history older than a year; the latest entry of each task stays |

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

## Server settings

Switches for extras, off by default, changed without a restart: in **Admin →
Settings**, or from the command line.

```bash
infra/scripts/install.sh settings                         # self-hosted: list
infra/scripts/install.sh settings set timeline.density on
infra/scripts/install.sh settings reset timeline.density
make settings CONTOUR=testing [SET=key=on|off] [RESET=key]  # the owner's servers, over ssh
```

| Key | What it allows |
|---|---|
| `groups.workspaces` | Keycloak groups put people into workspaces |
| `groups.removeOnLeave` | leaving a group takes away the access it gave |
| `groups.syncRoles` | moving to another group changes the role that group gave (never a role set by hand) |
| `groups.superAdmin` | the super admin role may come from a Keycloak group |
| `timeline.density` | workspace admins choose the timeline density: normal, small photos, compact (`workspaces.timeline_density`, 0180) |
| `heatmap.personCapacity` | each person's share of a full day in the workload heatmap (`assignees.capacity_percent`, 0178) |
| `workspaces.closures` | days off for the whole workspace (`workspace_closures`, 0179) |
| `dashboards.transfer` | duplicate, export and import dashboards |
| `dashboards.calendarPeriods` | widget periods: this or next calendar week or month |

The server reads the table with a 30-second cache; whoami hands the app-side values
to every signed-in person, so people get a change the next time they open Motio.
When the table cannot be read, every setting is its default.
