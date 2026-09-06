<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/logo-dark-mode.png">
  <img src=".github/assets/logo-light-mode.png" alt="Motio" width="96" />
</picture>

# Motio

**Team task planning on a timeline.**

Plan work across people and projects on a drag-and-drop timeline,
keep the whole team's workload visible — self-hosted, with SSO out of the box.

[![Version](https://img.shields.io/badge/version-0.10.2-blue.svg)](./CHANGELOG.en.md)
[![React](https://img.shields.io/badge/React-18-61dafb.svg?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5-646cff.svg?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-self--hosted-3ecf8e.svg?logo=supabase&logoColor=white)](https://supabase.com/)
[![Keycloak](https://img.shields.io/badge/Keycloak-SSO-0096d6.svg?logo=keycloak&logoColor=white)](https://www.keycloak.org/)

[Features](#-features) · [Quick start](#-quick-start) · [Architecture](#-architecture) · [Documentation](#-documentation)

![Motio — timeline view](.github/assets/screenshot-planner.png)

</div>

## ✨ Features

- 📅 **Timeline and calendar** — an interactive planner with day/calendar views and a task detail panel.
- 👥 **Workspaces and roles** — `viewer` / `editor` / `admin`, per-workspace members and invitations.
- 🔐 **SSO out of the box** — sign-in through Keycloak; sign-up is self-service (the app opens the Keycloak registration form), while invitations and account deletion happen in the app itself, Keycloak is the identity store.
- 🖼 **Task media** — paste, drag or upload images straight into task descriptions, with per-user and per-workspace quotas.
- 💾 **Backups built in** — scheduled backups with upload/download and one-click restore from the admin console.
- 🗄 **Super-admin console** — user overview, workspace management, backup/restore.
- 🌍 **Two languages** — English and Russian UI (Lingui).

## 🚀 Quick start

Requirements: **Node.js 20+**, **Docker Desktop**.

```bash
make up      # full local stack: Postgres, Keycloak, Supabase services, web
make down    # stop
make logs    # follow logs
```

| Service | URL |
|---|---|
| App | http://localhost:5173 |
| Keycloak | http://localhost:8081 |
| Supabase Gateway health | http://localhost:8080/health |
| Postgres | `localhost:54322` |

`make up` generates `.env` with dev secrets, applies Liquibase migrations and
synchronizes Keycloak ↔ Supabase — no manual setup needed.

Production, remote deploy and releases: see [docs/operations.md](docs/operations.md).

## 🏗 Architecture

| Layer | Technologies |
|---|---|
| **Frontend** | Vite · React 18 · TypeScript · Zustand · TanStack Query · Tailwind · Radix UI |
| **Backend** | Supabase, self-hosted (Postgres · GoTrue · PostgREST · Edge Functions) |
| **Auth / SSO** | Keycloak (OIDC) · oauth2-proxy (fallback for non-public paths) |
| **Infrastructure** | Docker Compose · Caddy (TLS edge) · Nginx (Supabase gateway) · Liquibase · standalone backup-service |

```
Browser → Caddy (TLS) → SPA (web) → Supabase GoTrue /auth/v1 → Keycloak (OIDC)
```

In production Caddy is the edge (TLS, domains, security headers) and the SPA starts
sign-in itself; oauth2-proxy stays as a fallback catch-all for non-public paths.

<details>
<summary>Repository structure</summary>

```
.
├── src/           — frontend (Vite + React + TS)
├── docs/          — documentation (operations, configuration, architecture, troubleshooting)
├── infra/
│   ├── docker-compose.yml / docker-compose.prod.yml
│   ├── supabase/  — SQL migrations, Liquibase changelog, Edge Functions, gateway nginx
│   ├── keycloak/  — realm baselines (dev + production)
│   ├── backup-service/
│   └── scripts/   — dev/prod compose, deploy, Keycloak realm sync
├── tests/         — DB integration tests (RLS, RPC, cron)
├── notes/         — local working notes (gitignored, absent on a fresh clone)
└── Makefile
```

</details>

Details: [docs/architecture.md](docs/architecture.md).

## 📚 Documentation

| | |
|---|---|
| [docs/operations.md](docs/operations.md) | local dev, production, deploy, releases, migrations, backup/restore |
| [docs/configuration.md](docs/configuration.md) | environment variables |
| [docs/architecture.md](docs/architecture.md) | stack, auth flow, Edge Functions, admin console |
| [docs/troubleshooting.md](docs/troubleshooting.md) | common errors and fixes |
| [CHANGELOG.en.md](./CHANGELOG.en.md) · [CHANGELOG.md](./CHANGELOG.md) | change history (en / ru) |
| [MANIFESTO.md](./MANIFESTO.md) | product principles |
| [AGENTS.md](./AGENTS.md) | working instructions for AI assistants |

## 🤝 Contributing

1. Create a feature branch: `git checkout -b feature/my-feature` (the licence does not grant redistribution — see [LICENSE](./LICENSE)).
2. `npm install`, then bring up the stack: `make up`.
3. Add tests and keep it clean: `npm run test`, `npm run lint`, `npm run typecheck`,
   `bash infra/scripts/lint-security-definer.sh`, `npm run build`
   (plus `npm run test:integration` when touching RPC/RLS/cron).
4. New UI strings go through Lingui: `npm run lingui:extract && npm run lingui:compile`.
   Stale catalogs fail both CI and the production deploy.
5. Log the change with `make logchange RU="…" EN="…" [TYPE=added|changed|fixed|removed|security]`
   — it writes the entry into the `Unreleased` section of both changelogs (ru and en).
   Then open a PR with a clear description.

Merging into `main` deploys nothing: production only goes out via `make deploy`.

## 📄 License

Source-available, not open source: the code is public to read, any other use
requires written permission. See [LICENSE](./LICENSE).
