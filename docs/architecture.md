# Architecture

See also: [Operations](operations.md) · [Configuration](configuration.md)

---

## Stack

| Layer | Technologies |
|---|---|
| **Frontend** | Vite · React 18 · TypeScript · Zustand · TanStack Query · Tailwind · Radix UI |
| **Backend** | Supabase (Postgres · GoTrue · PostgREST · Edge Functions) |
| **Auth / SSO** | Keycloak (OIDC) · oauth2-proxy |
| **DB migrations** | Liquibase |
| **Infrastructure** | Docker Compose · Caddy (public TLS edge) · Nginx (internal Supabase gateway + built frontend) · standalone backup-service |
| **i18n** | Lingui (ru / en) |

## Repository structure

```
.
├── src/                                 — frontend (Vite + React + TS)
├── docs/                                — public documentation (this folder)
├── infra/
│   ├── docker-compose.yml               — dev stack
│   ├── docker-compose.prod.yml          — production stack
│   ├── supabase/
│   │   ├── migrations/                  — SQL migrations
│   │   ├── liquibase/changelog-master.xml
│   │   ├── functions/                   — Edge Functions: main, account-purge, admin, data-export, holidays, inbox, invite, mailer, notifications, push, task-media
│   │   └── nginx.conf                   — internal gateway: /auth/v1, /rest/v1, /functions/v1, /storage/v1, /realtime/v1, /backup
│   ├── caddy/                           — public TLS edge (Caddyfile, Caddyfile.testing); runs outside docker-compose.prod.yml
│   ├── keycloak/realm/
│   │   ├── timeline-realm.json          — dev realm
│   │   └── timeline-realm.prod.json     — production baseline
│   ├── backup-service/                  — backup/restore service
│   └── scripts/                         — dev/prod compose, deploy, Keycloak realm sync
├── tests/                               — DB integration tests (RLS, RPC, cron)
├── notes/                               — local working notes (gitignored, absent on a fresh clone)
└── Makefile
```

Frontend layering rules (features / application / shared/domain / shared/ui) are
described in [`AGENTS.md`](../AGENTS.md) §3.

## Auth flow

```
Browser → Caddy → web (SPA)
SPA     : supabase.auth.signInWithOAuth({ provider: 'keycloak' }) → GoTrue /auth/v1 → Keycloak (OIDC) → Supabase session
Logout  : /oauth2/sign_out → oauth2-proxy backend logout → Keycloak end-session (id_token_hint) → /
```

In production Caddy serves the public paths (`/`, `/app*`, `/demo*`, `/invite*`,
`/privacy*`, static assets) straight from `web`, and oauth2-proxy stays the
catch-all for everything else. The plain `Browser → oauth2-proxy → Keycloak →
Supabase` chain describes the **dev stack**, where port 5173 belongs to the proxy.

> **Important.** Keycloak is the identity store: accounts, credentials and
> password resets live there, and the Admin Console is where an administrator
> manages them. Two user-facing flows start in the app itself — self-service
> sign-up (`/auth?intent=register` opens the Keycloak registration form via
> OIDC `prompt=create`) and account deletion (`DeleteAccountWizard`, RPC from
> migration 0074). The app's admin panel shows users as an overview
> (access + storage) and does not replace IAM.

## Keycloak Realm-as-Code

Realm settings are applied automatically on every production deploy by the
`infra/scripts/keycloak-ensure-*.sh` scripts (client secret, client URLs,
SSL-required, branding, frontend URL, session policy, brute-force protection,
password policy, user profile — first/last name stay optional on sign-up).
The realm JSON import is used only for the initial realm bootstrap.

Baseline export of the current production realm:

```bash
infra/scripts/keycloak-export-realm-baseline.sh .env infra/keycloak/realm/timeline-realm.prod.json
```

Manual drift check:

```bash
infra/scripts/keycloak-realm-drift-audit.sh .env
```

The client's `rootUrl / baseUrl / redirectUris / webOrigins` and the realm's
`attributes.frontendUrl` are normalized from the current `.env` via
`keycloak-ensure-client-urls.sh` and `keycloak-ensure-realm-frontend-url.sh` — this
lets the testing stack stay self-contained when importing the production baseline.

---

## Edge Functions

Routed through `main` under `/functions/v1/`: `account-purge`, `admin`,
`data-export`, `holidays`, `inbox`, `invite`, `mailer`, `notifications`, `push`,
`task-media`. The subsections below cover the ones with a non-trivial contract.

### `admin`

| Action | Purpose |
|---|---|
| `bootstrap.sync` | initial Keycloak ↔ Supabase synchronization |
| `users.list` | user overview |
| `workspaces.list` / `workspaces.update` / `workspaces.delete` | workspace management |
| `superAdmins.list` | super-admin overview |
| `keycloak.sync` | role resync |

> `users.create` / `users.update` / `users.delete` / `users.resetPassword` and
> `superAdmins.create` / `superAdmins.delete` **return an error by design** — user
> lifecycle and privilege assignment are managed in Keycloak.

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
- metadata (`workspace_id`, `owner_id`, `byte_size`, `storage_path`, access token
  hash) lives in `public.task_media`;
- binary data lives in the private bucket `task-media`.

**Garbage collection:**

- when a task description is saved, the frontend diffs `description` and deletes the
  `task-media` that disappeared;
- when a task is deleted (single / bulk / series), all linked images are removed with
  it;
- cleanup calls are fire-and-forget — a GC failure does not block the main operation,
  and the task stays consistent.

**Legacy migration (from `bytea` to Storage):**

```bash
node infra/scripts/migrate-task-media-to-storage.mjs --env-file .env
```

---

## Admin Console

Page: `/app/admin` — super admins only, reachable by direct URL (no in-app links,
by design). The SPA still redirects the old `/admin/users` address to
`/app/admin/users`, but that only applies where the SPA serves the path: in
production Caddy hands the whole `/admin*` prefix to the Keycloak console.

| Section | Capabilities |
|---|---|
| **Overview** (`/app/admin`) | system at a glance: counts and storage assembled from the data the other sections fetch, plus the app version |
| **Users** (`/app/admin/users`) | user overview, workspace ownership, storage usage |
| **Workspaces** (`/app/admin/workspaces`) | rename / delete workspace |
| **Easter eggs** (`/app/admin/easter-eggs`) | assign a daily-brief egg to one person, a mail domain, a workspace, or everyone |
| **Broadcast** (`/app/admin/broadcast`) | announcements and service notices, sent by email or shown as an in-app banner |
| **Backups** (`/app/admin/backups`) | create / upload / download / rename / delete / restore |
