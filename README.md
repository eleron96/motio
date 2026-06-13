<div align="center">

<img src="public/logo.png" alt="Motio" width="120" />

# Motio

**Team task planning on a timeline.**

[![Version](https://img.shields.io/badge/version-0.8.31-blue.svg)](./VERSION)
[![React](https://img.shields.io/badge/React-18-61dafb.svg?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5-646cff.svg?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-self--hosted-3ecf8e.svg?logo=supabase&logoColor=white)](https://supabase.com/)
[![Keycloak](https://img.shields.io/badge/Keycloak-SSO-0096d6.svg?logo=keycloak&logoColor=white)](https://www.keycloak.org/)

[Features](#-features) · [Quick start](#-quick-start) · [Architecture](#-architecture) · [Documentation](#-documentation) · [Troubleshooting](#-troubleshooting)

</div>

---

## 📌 About

**Motio** is a self-hosted app for team task planning on a timeline, with a calendar view, projects, workspace roles, and SSO authentication via Keycloak.

### Stack

| Layer | Technologies |
|---|---|
| **Frontend** | Vite · React 18 · TypeScript · Zustand · TanStack Query · Tailwind · Radix UI |
| **Backend** | Supabase (Postgres · GoTrue · PostgREST · Edge Functions) |
| **Auth / SSO** | Keycloak · oauth2-proxy |
| **DB migrations** | Liquibase |
| **Infrastructure** | Docker Compose · Nginx · standalone backup-service |
| **i18n** | Lingui (ru / en) |

---

## ✨ Features

- 📅 **Timeline and calendar** — an interactive planner with a task detail panel.
- 👥 **Workspaces and roles** — `viewer` / `editor` / `admin`, invitations via Keycloak identity link.
- 🖼 **Task media** — upload images into a task description (button, clipboard paste, drag-and-drop), private Storage bucket, per-user / per-workspace quotas.
- 🛡 **Keycloak-only auth** — sign-in through `oauth2-proxy`; user lifecycle lives entirely in the Keycloak Admin Console.
- 🗄 **Super-admin console** — user overview, workspace management, backup/restore.
- 💾 **Backup / restore** — a standalone service with a schedule, upload/download, and a safety backup before every restore.
- 🔄 **Realm-as-Code** — Keycloak realm baseline export + drift audit on every production deploy.
- 🚀 **Release automation** — automatic version bump, `CHANGELOG.md` / `CHANGELOG.en.md` sync, release log.

---

## 📋 Requirements

- **Node.js** 20+
- **Docker Desktop**
- *(optional)* **Supabase CLI** — for the `dev:local` mode

---

## 🚀 Quick start

### 1. Full local stack

```bash
make up
```

This command:
- creates/updates `.env`;
- generates `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `OAUTH2_PROXY_COOKIE_SECRET`;
- brings up `db`, `keycloak`, `auth`, `rest`, `functions`, `gateway`, `web`, `oauth2-proxy` (`backup` / `realtime` / `storage` start only in `up-prod`);
- applies Liquibase migrations;
- calls `bootstrap.sync` to synchronize Keycloak ↔ Supabase.

### 2. URLs

| Service | URL |
|---|---|
| App | http://localhost:5173 |
| Public landing | http://localhost:5173/ |
| Private app | http://localhost:5173/app |
| Keycloak | http://localhost:8081 |
| Supabase Gateway health | http://localhost:8080/health |
| Supabase Auth health | http://localhost:8080/auth/v1/health |
| Postgres | `localhost:54322` |

### 3. Stop and logs

```bash
make down
make logs
```

### 4. Alternative mode — Supabase CLI

```bash
npm run dev:local
```

> If the `supabase` CLI is not found, the script falls back to `dev-compose`. For full parity with production behavior, use `make up`.

---

## 🏭 Production

```bash
make up-prod
```

What `up-prod` does:
- requires a fully populated `.env`;
- validates the required invite-only variables;
- backs up `keycloak-db` before the realm audit (if `AUTO_KEYCLOAK_PRE_SYNC_BACKUP=true`);
- runs the Keycloak realm drift audit (audit-only by default);
- takes a pre-migration backup (if `AUTO_PRE_MIGRATION_BACKUP=true`);
- applies Liquibase migrations;
- builds the frontend image (`infra/web/Dockerfile`) and starts `web + oauth2-proxy`;
- automatically bumps the patch version in `VERSION`, moves `Unreleased` into `CHANGELOG.md` / `CHANGELOG.en.md`, and appends an entry to `infra/releases.log`.

### Commands

```bash
make down-prod
make logs-prod
make keycloak-backup-db
make keycloak-audit-realm
make keycloak-export-realm
```

### Remote deploy

```bash
make deploy-remote
# or with an explicit version
NEXT_VERSION=0.3.0 make deploy-remote
```

`infra/scripts/deploy-remote.sh` syncs the code, runs `prod-compose.sh` on the server, and pulls the updated `VERSION`, `CHANGELOG*.md`, and `infra/releases.log` back into the local repo.

### Tracked release on testing

```bash
make release-testing MSG="feat(...): ..." RU="..." EN="..." [TYPE=changed] [NEXT_VERSION=0.3.0]
```

Bumps `VERSION`, moves `Unreleased` into both changelogs, records history in `infra/testing-releases.log`, commits/pushes the artifacts, and runs `make deploy-testing` without touching production.

---

## 🏗 Architecture

### Repository structure

```
.
├── src/                                 — frontend (Vite + React + TS)
├── docs/                                — internal working notes (local, gitignored)
├── infra/
│   ├── docker-compose.yml               — dev stack
│   ├── docker-compose.prod.yml          — production stack
│   ├── supabase/
│   │   ├── migrations/                  — SQL migrations
│   │   ├── liquibase/changelog-master.xml
│   │   ├── functions/                   — Edge Functions: main, admin, invite, task-media, inbox, notifications, holidays, data-export, account-purge
│   │   └── nginx.conf                   — gateway: /auth/v1, /rest/v1, /functions/v1, /backup
│   ├── keycloak/realm/
│   │   ├── timeline-realm.json          — dev realm
│   │   └── timeline-realm.prod.json     — production baseline
│   ├── backup-service/                  — backup/restore service
│   └── scripts/                         — dev/prod compose, Keycloak realm sync
└── Makefile
```

### Auth flow

```
Browser → oauth2-proxy → Keycloak (OIDC) → Supabase (identity link)
Logout  : /oauth2/sign_out → oauth2-proxy backend logout → Keycloak end-session (id_token_hint) → /
```

> **Important.** User lifecycle (create / edit / delete / password reset) is managed **only in the Keycloak Admin Console**. The app's admin panel shows users as an overview (access + storage) and does not replace IAM.

### Keycloak Realm-as-Code

Baseline export of the current production realm:

```bash
infra/scripts/keycloak-export-realm-baseline.sh .env infra/keycloak/realm/timeline-realm.prod.json
```

Manual drift check:

```bash
infra/scripts/keycloak-realm-drift-audit.sh .env
```

The client's `rootUrl / baseUrl / redirectUris / webOrigins` and the realm's `attributes.frontendUrl` are normalized from the current `.env` via `keycloak-ensure-client-urls.sh` and `keycloak-ensure-realm-frontend-url.sh` — this lets the testing stack stay self-contained when importing the production baseline.

---

## ⚙️ Configuration

### Required variables for production

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

Template: [`.env.example`](./.env.example)

Pre-deploy check:

```bash
make check-prod-secrets
make check-prod-secrets-remote   # check .env on the remote server
```

> The production deploy is **blocked** if OIDC secrets are empty or use dev/default values.

### Key variable groups

<details>
<summary><strong>Auth · Keycloak · oauth2-proxy</strong></summary>

- `GOTRUE_EXTERNAL_KEYCLOAK_*` — OIDC provider for Supabase Auth.
- `KEYCLOAK_INTERNAL_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_ADMIN_REALM`, `KEYCLOAK_ADMIN_CLIENT_ID` — Edge Functions' access to the Keycloak Admin API.
- `KEYCLOAK_ADMIN_BASE_URL` — base URL for infra scripts (`http://127.0.0.1:8081` by default).
- `KEYCLOAK_MANAGED_CLIENT_IDS` — comma-separated clientIds for the realm baseline export.
- `KEYCLOAK_REALM_AUDIT_FILE` — path to the managed realm JSON for the drift audit.
- `KEYCLOAK_REALM_AUDIT_ENABLED` · `KEYCLOAK_REALM_AUDIT_FAIL_ON_DRIFT` — control the audit behavior in `up-prod`.
- `OAUTH2_PROXY_*` — proxying sign-in to the frontend.
- `OAUTH2_PROXY_BACKEND_LOGOUT_URL` — Keycloak end-session URL with `id_token_hint={id_token}`.
- `OAUTH2_PROXY_WHITELIST_DOMAINS` — allowlist for the `rd` redirect after `/oauth2/sign_out`.

</details>

<details>
<summary><strong>Supabase · Postgres</strong></summary>

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_DB_URL`, `SUPABASE_INTERNAL_URL`
- `PGRST_DB_URI`, `GOTRUE_DB_DATABASE_URL`
- `POSTGRES_WAL_LEVEL` — must be `logical` for Supabase Realtime CDC.

</details>

<details>
<summary><strong>Backup / Restore</strong></summary>

- `BACKUP_CRON`
- `BACKUP_RETENTION_COUNT`
- `BACKUP_SCHEMAS` (default `public,auth,storage`)
- `BACKUP_MAX_UPLOAD_MB`
- `BACKUP_RESTORE_DB_URL` *(optional)*
- `BACKUP_AUTH_DB_USER`, `BACKUP_AUTH_HOST`

</details>

<details>
<summary><strong>Liquibase</strong></summary>

- `AUTO_PRE_MIGRATION_BACKUP`
- `AUTO_KEYCLOAK_PRE_SYNC_BACKUP`
- `LIQUIBASE_LOG_LEVEL`
- `MIGRATION_MAX_WAIT_SECONDS`

</details>

<details>
<summary><strong>Task media quotas</strong></summary>

- `TASK_MEDIA_MAX_FILE_BYTES` — `5MB` by default.
- `TASK_MEDIA_USER_QUOTA_BYTES` — `200MB` by default.
- `TASK_MEDIA_WORKSPACE_QUOTA_BYTES` — `2GB` by default.
- `TASK_MEDIA_TOKEN_TTL_SECONDS` — `315360000` (10 years) by default. The token is baked into the URL inside the task description HTML and is not refreshed on the client, so keep the TTL long: a short value silently breaks images in older tasks.

</details>

---

## 🧪 Scripts

### Make

```bash
make up              # full local stack
make down            # stop
make logs            # logs
make up-prod         # production startup
make down-prod
make logs-prod
```

### npm

```bash
npm run dev               # Vite dev server
npm run dev:compose       # full dev stack via docker compose
npm run dev:local         # Supabase CLI mode (fallback → dev:compose)
npm run build
npm run lint
npm run typecheck         # tsc --noEmit (part of the CI gate)
npm run test              # unit + component
npm run test:watch
npm run test:integration
npm run lingui:extract    # extract translatable strings
npm run lingui:compile    # compile .po → .js
```

---

## 🔌 Edge Functions

Routed through `main` under `/functions/v1/`:

### `admin`

| Action | Purpose |
|---|---|
| `bootstrap.sync` | initial Keycloak ↔ Supabase synchronization |
| `users.list` | user overview |
| `workspaces.list` / `workspaces.update` / `workspaces.delete` | workspace management |
| `superAdmins.list` | super-admin overview |
| `keycloak.sync` | role resync |

> `users.create` / `users.update` / `users.delete` / `users.resetPassword` and `superAdmins.create` / `superAdmins.delete` **return an error by design** — user lifecycle and privilege assignment are managed in Keycloak.

### `invite`

- adds a user to a workspace;
- creates / links the Keycloak + Supabase identity;
- syncs realm roles to workspace roles.

### `task-media`

| Endpoint | Description |
|---|---|
| `POST /functions/v1/task-media` | upload an image; validates membership + quotas; writes to the private bucket `task-media` and metadata to `public.task_media` |
| `GET /functions/v1/task-media/:id?token=…` | validates the token, redirects to a short-lived signed Storage URL; falls back to legacy `bytea` |
| `POST /functions/v1/task-media/:id/revoke` | revokes the access token (owner or workspace admin) |
| `DELETE /functions/v1/task-media/:id` | deletes the blob from Storage + the row from `public.task_media` (owner or workspace admin) |

**Storage:**
- `tasks.description` stores the URL to the `task-media` endpoint;
- metadata (`workspace_id`, `owner_id`, `byte_size`, `storage_path`, access token hash) lives in `public.task_media`;
- binary data lives in the private bucket `task-media`.

**Garbage collection:**
- when a task description is saved, the frontend diffs `description` and deletes the `task-media` that disappeared;
- when a task is deleted (single / bulk / series), all linked images are removed with it;
- cleanup calls are fire-and-forget — a GC failure does not block the main operation, and the task stays consistent.

**Legacy migration (from `bytea` to Storage):**

```bash
node infra/scripts/migrate-task-media-to-storage.mjs --env-file .env
```

---

## 🛠 Admin Console

Page: `/admin/users`

| Tab | Capabilities |
|---|---|
| **Users** | user overview, workspace ownership, storage usage |
| **Workspaces** | rename / delete workspace |
| **Backups** | create / upload / download / rename / delete / restore |

---

## 💾 Backup / Restore

`backup-service` under `/backup`:

| Method | Endpoint |
|---|---|
| `GET` | `/backup/backups` |
| `POST` | `/backup/backups` |
| `POST` | `/backup/backups/upload` *(binary, name in `x-backup-name`)* |
| `GET` | `/backup/backups/:name/download` |
| `PATCH` | `/backup/backups/:name` |
| `DELETE` | `/backup/backups/:name` |
| `POST` | `/backup/backups/:name/restore` |
| `POST` | `/backup/storage-backups` *(manual backup of Storage blobs; requires `STORAGE_BLOBS_DIR`, otherwise 501)* |

**Restore flow:**
1. creates a safety backup `pre-restore-*`;
2. runs `pg_restore` for the schemas in `BACKUP_SCHEMAS`;
3. restores grants for the `auth` role;
4. drops GoTrue's connections to the DB.

**Disaster recovery (restoring onto a clean server).** The standard restore assumes a
database with a matching schema (the same server). On a freshly initialized DB
`pg_restore --clean --exit-on-error` fails, so before loading the dump you need to:

1. Drop the objects pre-created by the image and create empty schemas
   (`pg_restore --schema` does not create the schemas themselves):
   ```sql
   DROP SCHEMA IF EXISTS storage CASCADE;
   DROP SCHEMA IF EXISTS auth CASCADE;
   DROP SCHEMA IF EXISTS public CASCADE;
   CREATE SCHEMA public; CREATE SCHEMA auth; CREATE SCHEMA storage;
   ```
2. Create the missing roles that the dump GRANTs to:
   `CREATE ROLE metabase_ro NOLOGIN;`
3. Load the dump **without** `--clean`:
   ```bash
   pg_restore --single-transaction --exit-on-error --no-owner \
     --schema public --schema auth --schema storage \
     --dbname "$DB_URL" <file>.dump
   ```
4. Then follow steps 3–4 of the standard restore (`auth` grants, restart GoTrue/storage).

Verified against a copy of the production dump (June 2026): after preparation the dump
loads without errors, and a subsequent standard restore on top works too.

---

## 🗃 Migrations (Liquibase)

- SQL files: `infra/supabase/migrations/*.sql`
- Master changelog: `infra/supabase/liquibase/changelog-master.xml`

Manual run:

```bash
docker compose -f infra/docker-compose.prod.yml --env-file .env run --rm migrate
```

**Add a new migration:**

1. Create `infra/supabase/migrations/00xx_name.sql`.
2. Add a `changeSet` to `infra/supabase/liquibase/changelog-master.xml`.
3. Run `migrate`.

---

## 🩺 Troubleshooting

<details>
<summary><code>OAUTH2_PROXY_COOKIE_SECRET is required for oauth2-proxy</code></summary>

The `OAUTH2_PROXY_COOKIE_SECRET` variable is empty. `make up` usually generates it automatically; for `make up-prod` set the value in `.env` or let the script generate it.

</details>

<details>
<summary><code>localhost:5173 → ERR_CONNECTION_REFUSED</code></summary>

```bash
docker compose -f infra/docker-compose.prod.yml --env-file .env ps
```

`oauth2-proxy` and `web` should be in the `Up` state.

</details>

<details>
<summary><code>Warning: could not confirm Keycloak sync bootstrap</code></summary>

Migrations applied, but `bootstrap.sync` did not return `200`. The usual cause is wrong `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD`. Check the `functions` log for `Invalid user credentials`.

</details>

<details>
<summary><code>Invalid user credentials</code> in admin sync</summary>

The admin account in `.env` must match the master admin in Keycloak. After fixing it, restart: `keycloak`, `functions`, `gateway`.

</details>

<details>
<summary><code>The schema must be one of the following: public</code></summary>

Somewhere a query still targets a non-public schema via PostgREST. In the current version user storage is computed through `public.task_media`.

</details>

<details>
<summary>Bad Request on the Keycloak redirect</summary>

Check consistency of:
- `OAUTH2_PROXY_CLIENT_ID`, `OAUTH2_PROXY_REDIRECT_URL`;
- `SITE_URL` / `APP_URL` / `GOTRUE_EXTERNAL_KEYCLOAK_REDIRECT_URI`;
- the output of `keycloak-ensure-client-urls.sh` (redirect URIs);
- the output of `keycloak-ensure-realm-frontend-url.sh` (realm `frontendUrl`).

</details>

<details>
<summary><code>volume supabase_db_data declared as external, but could not be found</code></summary>

```bash
docker volume create supabase_db_data
```

</details>

<details>
<summary><code>Warning: Keycloak realm drift detected</code></summary>

The realm currently on the server does not match the managed JSON (the deploy continued in audit-only mode when `KEYCLOAK_REALM_AUDIT_FAIL_ON_DRIFT=false`).

Check:
```bash
infra/scripts/keycloak-realm-drift-audit.sh .env
```

Update the baseline:
```bash
infra/scripts/keycloak-export-realm-baseline.sh .env infra/keycloak/realm/timeline-realm.prod.json
```

</details>

---

## 🔐 Security

Before going to production:

- ✅ rotate all dev secrets in `.env`;
- ✅ set strong passwords and cookie secrets;
- ✅ restrict CORS / origins;
- ✅ enable HTTPS and `OAUTH2_PROXY_COOKIE_SECURE=true`;
- ✅ restrict the backup endpoint with network rules.

---

## 📚 Documentation

- [`CHANGELOG.md`](./CHANGELOG.md) · [`CHANGELOG.en.md`](./CHANGELOG.en.md) — change history.
- [`MANIFESTO.md`](./MANIFESTO.md) — product principles.
- [`AGENTS.md`](./AGENTS.md) — working instructions for AI assistants in this repository.

> Internal onboarding and AI-agent materials (product overview, architectural
> boundaries, specification-by-example) live locally in `docs/` and are **not part of
> the repository** (`.gitignore`).

---

## 🤝 Contributing

1. Fork and create a feature branch: `git checkout -b feature/my-feature`.
2. Install dependencies: `npm install`.
3. Bring up the local stack: `make up`.
4. Add tests (`npm run test` / `npm run test:integration`) and make sure it's clean: `npm run lint` and `npm run typecheck`.
5. When adding new translatable strings, update the Lingui catalogs: `npm run lingui:extract && npm run lingui:compile`.
6. Open a PR with a clear description and a link to the `CHANGELOG.md` entry (the `Unreleased` section).

---

## 📄 License

Private / proprietary. All rights reserved.
