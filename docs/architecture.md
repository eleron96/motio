# Architecture

See also: [Operations](operations.md) · [Configuration](configuration.md)

---

## Stack

| Layer | Technologies |
|---|---|
| **Frontend** | Vite · React 18 · TypeScript · Zustand · TanStack Query · Tailwind · Radix UI |
| **Backend** | Supabase (Postgres · GoTrue · PostgREST · Edge Functions) |
| **Auth / SSO** | Keycloak · oauth2-proxy |
| **DB migrations** | Liquibase |
| **Infrastructure** | Docker Compose · Nginx · standalone backup-service |
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
│   │   ├── functions/                   — Edge Functions: main, admin, invite, task-media, inbox, notifications, holidays, data-export, account-purge
│   │   └── nginx.conf                   — gateway: /auth/v1, /rest/v1, /functions/v1, /backup
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
Browser → oauth2-proxy → Keycloak (OIDC) → Supabase (identity link)
Logout  : /oauth2/sign_out → oauth2-proxy backend logout → Keycloak end-session (id_token_hint) → /
```

> **Important.** User lifecycle (create / edit / delete / password reset) is managed
> **only in the Keycloak Admin Console**. The app's admin panel shows users as an
> overview (access + storage) and does not replace IAM.

## Keycloak Realm-as-Code

Realm settings are applied automatically on every production deploy by the
`infra/scripts/keycloak-ensure-*.sh` scripts (client secret, client URLs,
SSL-required, branding, frontend URL, session policy, brute-force protection).
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

Routed through `main` under `/functions/v1/`.

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

Page: `/admin/users`

| Tab | Capabilities |
|---|---|
| **Users** | user overview, workspace ownership, storage usage |
| **Workspaces** | rename / delete workspace |
| **Backups** | create / upload / download / rename / delete / restore |
