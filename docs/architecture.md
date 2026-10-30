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
| **i18n** | Lingui (en / ru / de) |

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
│   │   ├── functions/                   — Edge Functions: main, account-purge, admin, api, data-export, holidays, inbox, invite, mailer, notifications, push, task-media
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

Routed through `main` under `/functions/v1/`: `account-purge`, `admin`, `api`,
`data-export`, `holidays`, `inbox`, `invite`, `mailer`, `notifications`, `push`,
`task-media`. The subsections below cover the ones with a non-trivial contract.

### `api`

The workspace API for importing absences, called by other systems with a
workspace token (`Authorization: Bearer motio_…`), not by the app. The gateway
gives `/functions/v1/api/` its own rate limit (`public_api_limit`, 5 r/s per IP)
and no CORS. The function hashes the token, resolves the workspace and calls the
`api_*` database functions (migration 0156, EXECUTE for `service_role` only).
Contract and examples: [API](api.md).

### `admin`

| Action | Purpose |
|---|---|
| `bootstrap.sync` | makes sure the reserve super-admin account exists (called by the deploy scripts) |
| `system.status` | Admin → System: service probes through the gateway, latest release from GitHub (cached 6 h, `MOTIO_UPDATE_CHECK`), server settings as yes/no |
| `system.testEmail` | sends a test email to the calling admin (once a minute) |
| `users.list` | user overview |
| `workspaces.list` / `workspaces.update` / `workspaces.delete` | workspace management |
| `superAdmins.list` | super-admin overview |

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

- `tasks.description` stores the URL to the `task-media` endpoint; a subtask keeps its
  pictures as `{ id, token }` references in `task_subtasks.images` (at most 10), and the
  client builds the URL, so a changed self-host domain doesn't break them;
- metadata (`workspace_id`, `owner_id`, `byte_size`, `storage_path`, access token
  hash) lives in `public.task_media`;
- binary data lives in the private bucket `task-media`.

**Garbage collection:**

- when a task description is saved, the frontend diffs it against the previous text and
  offers the pictures that disappeared for deletion: for a one-off task that is the text
  the person started from, never a teammate's newer one; for an occurrence of a repeating
  series it is the copy the card holds, which live sync may already have replaced. A
  picture is deleted only if no description or subtask in the workspace still references
  it;
- when a task is deleted (single / bulk / series), all linked images are removed with
  it;
- cleanup calls are fire-and-forget — a GC failure does not block the main operation,
  and the task stays consistent.

**Legacy migration (from `bytea` to Storage):**

```bash
node infra/scripts/migrate-task-media-to-storage.mjs --env-file .env
```

---

## Live sync

Teammates see each other's changes without reloading. Everything goes over one Realtime
WebSocket per tab; row-level security decides what reaches whom, exactly as for reads.

| Channel | Opened | Carries | On an event |
|---|---|---|---|
| `planner-live-<workspace>` | while the planner is open | Postgres changes on `tasks`, `milestones`, `time_off`, `task_comments` (counts only) | re-reads the changed rows in batches (~320 ms) |
| open-card channels | while a task card is open | Postgres changes on that task's `task_subtasks` and `task_comments` | re-reads the subtask list, or the one comment |
| `task-drafts:<task>` | while a task card is open, desktop, `VITE_FEATURE_TASK_LIVE_DRAFTS` | Presence: what each person is typing (a subtask, an edit of one, a comment — up to 500 characters, at most ~3 updates a second) and that someone edits the description | shows teammates' drafts semi-transparent; nothing is stored |

- **Missed events are caught up, not lost.** After a reconnect and when the tab becomes
  visible again, the planner reconciles what changed since its last sync, and an open card
  re-reads its subtasks and newest comments.
- **The drafts channel is private.** Migration 0159 puts the rules on `realtime.messages`:
  members of the task's workspace may join and listen, editors may publish, and a private
  channel with any other topic is refused (the public Postgres-changes channels are
  governed by table RLS instead). Realtime creates `realtime.messages` only once a client first connects, so on
  a brand-new self-hosted install the migration skips the rules and `install.sh` applies
  the same file again on the next update.
- **Deletes need a readable row.** Realtime sends an `UPDATE` only to subscribers who may
  read the new row. Comments are soft-deleted, so members may read a deleted comment's
  row (migration 0161) — a trigger empties its text, mentions and notification preview the
  moment `deleted_at` is set. Every read in the app still filters `deleted_at is null`.
- **Last write wins, except for the description.** Other fields are saved as soon as they
  change (the title when its field loses focus), and the later save wins. The description of a non-repeating task is saved through
  `update_task_description_if_unchanged` (migration 0162): only while the stored text is
  still the one the person started from (compared by SHA-256). Otherwise nothing is
  written, the draft stays, and the card asks which version to keep. Discard in the card
  rolls back only the person's own edits, and only where a teammate hasn't changed the
  field since.

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
