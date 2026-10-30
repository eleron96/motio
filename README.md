<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/logo-dark-mode.png">
  <img src=".github/assets/logo-light-mode.png" alt="Motio" width="96" />
</picture>

# Motio

**See who's doing what this week — across every project.**

One shared timeline for your whole team: people, projects and workload on a single screen.
Free and open source: use the hosted app, or run it on your own servers. The live demo needs no sign-up.

**[▶ Try the live demo](https://motio.nikog.net/demo?utm_source=github&utm_medium=readme)** &nbsp;·&nbsp; **[Open Motio](https://motio.nikog.net/?utm_source=github&utm_medium=readme)** &nbsp;·&nbsp; **[Self-host it](#-self-host)** &nbsp;·&nbsp; [What's new](./CHANGELOG.en.md)

[![Version](https://img.shields.io/badge/version-0.10.38-blue.svg)](./CHANGELOG.en.md)
[![CI](https://github.com/eleron96/motio/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/eleron96/motio/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](./LICENSE)

[![Motio in 20 seconds: add a task, drag it to Monday, stretch it over two days, then check that day on the workload heatmap](.github/assets/motio-demo.gif)](https://motio.nikog.net/demo?utm_source=github&utm_medium=readme&utm_content=gif)

<sub>Recorded in the live demo. Click it to try the same yourself — no sign-up.</sub>

[Why Motio](#why-motio) · [Features](#-features) · [Self-host](#-self-host) · [Architecture](#-architecture) · [Documentation](#-documentation)

</div>

## Why Motio

Most tools answer "what's in project X?". Motio answers the question a team lead actually asks on Monday: **who is busy, who is free, and where does the next task go?**

- 👥 **People first, not tasks first.** Every row is a person, every bar is their work — across all projects at once. Elsewhere that is one view among many; in Motio it is the product.
- 🔥 **Overload shows up before the deadline does.** Workload sits on the same timeline and in a department heatmap, so you see who is full without assembling a report from boards, filters and spreadsheets.
- ⚡ **Any task in 10 seconds.** Click, type, drag. No custom fields, no automations — that is a position, not a missing feature. A board of status columns is there if you want it, as an optional view next to the timeline rather than a replacement for it. The [manifesto](./MANIFESTO.md) (in Russian) explains why.
- 🔓 **Yours to run.** Open source under AGPL-3.0. Use the free hosted app, or keep the data inside your own perimeter: Docker Compose, Postgres, SSO via Keycloak, built-in backups and a full data export.

Built for teams of 5–50 people running several projects at once. It grew out of years of managing BIM and engineering project teams, and one recurring Monday question: who's free this week?

**New to Motio?** Three five-minute guides: [your first week](docs/guides/first-week.md) · [several projects, one team](docs/guides/multiple-projects.md) · [spotting overload early](docs/guides/spotting-overload.md).

## ✨ Features

- 📅 **Timeline** — drag-and-drop planner grouped by people or by project, at a day or week scale, plus a three-year calendar; milestones and time off sit on the same grid. Drag a task past the edge of the screen and the timeline scrolls along. Moved, rescheduled or deleted something by mistake? Undo it from the toast or with Cmd/Ctrl+Z.
- 🗂 **Board (beta)** — the same tasks as cards in columns by your own statuses, as an optional view next to the timeline. Drag a card to another column to change its status (undo included), filter by person, group, project or overdue in one click. On a phone it is one column per screen with a swipe between them. Each person turns it on in account settings.
- ✅ **Tasks with depth** — subtasks (with pictures), repeating series, priorities, tags, rich descriptions with pasted images, comments with @mentions and screenshots; pictures open full screen with zoom. A subtask you started typing is saved on its own.
- 🤝 **Working together** — teammates' changes show up within a second, and an open task keeps its subtasks and comments live. On a computer, with live drafts switched on (on in the hosted app, off by default when self-hosting), you see what a teammate is typing — a subtask, a comment — semi-transparent as they write. If two people edit the description of a one-off task at once, nobody's text is silently overwritten: the card asks which version to keep.
- 👥 **Team** — members and groups, each person's current and past tasks at a glance.
- 📁 **Projects and customers** — project cards with their team and customer contacts, a workspace-wide contact list; people you have entered before are suggested as you type.
- 📊 **Dashboard** — configurable widgets and a department workload heatmap, with one layout that scales to wide monitors; a daily brief once a day and release notes right in the app.
- 🔔 **Notifications** — in-app inbox plus browser push; installable as a PWA, push works on iPhone too.
- 📱 **Works on phones** — a dedicated mobile layer for the timeline, the board, tasks, team and projects; one View button switches between them.
- 🏢 **Workspaces and roles** — `viewer` / `editor` / `admin`, invitations, owner transfer, leaving a workspace.
- 🔐 **SSO out of the box** — sign-in through Keycloak; sign-up is self-service (the app opens the Keycloak registration form), while invitations and account deletion happen in the app itself, Keycloak is the identity store.
- 💾 **Backups built in** — daily backups of the database, media and Keycloak with retention, upload/download and one-click restore from the admin console.
- 🗄 **Super-admin console** — user overview, workspace management, backup/restore, announcements to every user.
- 🧪 **Demo sandbox** — [`/demo`](https://motio.nikog.net/demo?utm_source=github&utm_medium=readme) runs entirely in the browser on sample data, no sign-in needed.
- 🌍 **Three languages** — English, Russian and German UI (Lingui).

<div align="center">

[![The board: switch from the timeline to the board, drag a card from Ready to Review, the undo toast appears](.github/assets/motio-board.gif)](https://motio.nikog.net/demo?utm_source=github&utm_medium=readme&utm_content=board-gif)

<sub>The optional board, recorded in the live demo: turn it on in account settings → Appearance → Board view (beta).</sub>

</div>

## 🚀 Self-host

Most teams just [sign up](https://motio.nikog.net/?utm_source=github&utm_medium=readme) and start working. If your data has to stay inside your own perimeter, Motio runs on your infrastructure — the same stack that serves motio.nikog.net.

### Try it on your machine

Requirements: **Node.js 24** (the version CI and the Docker images use), **Docker Desktop**.

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
creates the reserve super-admin account — no manual setup needed.

### Run it for your team

One command on a Linux server with Docker, under your own domain — with its own
Let's Encrypt certificate or behind the reverse proxy you already run:

```bash
git clone https://github.com/eleron96/motio.git && cd motio
git checkout vX.Y.Z   # latest release
infra/scripts/install.sh --domain planner.example.com --email you@example.com
```

Updates are `infra/scripts/install.sh update --version vX.Y.Z`: it backs up the whole
install first, and `install.sh rollback` takes you back. Requirements, the
reverse-proxy mode (Nginx Proxy Manager, Traefik, nginx), email, your own sign-in
provider (Authentik, Entra ID…) and backups: **[docs/self-hosting.md](docs/self-hosting.md)**.
The install sends nothing to motio.nikog.net. Self-hosting is community-supported —
questions are welcome in
[Discussions → Q&A](https://github.com/eleron96/motio/discussions/categories/q-a).

## 🏗 Architecture

[![React](https://img.shields.io/badge/React-18-61dafb.svg?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5-646cff.svg?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-self--hosted-3ecf8e.svg?logo=supabase&logoColor=white)](https://supabase.com/)
[![Keycloak](https://img.shields.io/badge/Keycloak-SSO-0096d6.svg?logo=keycloak&logoColor=white)](https://www.keycloak.org/)

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
| [docs/guides/](docs/guides/) | how to plan with Motio: first week, several projects, spotting overload |
| [docs/operations.md](docs/operations.md) | local dev, production, deploy, releases, migrations, backup/restore |
| [docs/configuration.md](docs/configuration.md) | environment variables, feature flags, push, email, scheduled jobs |
| [docs/architecture.md](docs/architecture.md) | stack, auth flow, Edge Functions, admin console |
| [docs/troubleshooting.md](docs/troubleshooting.md) | common errors and fixes |
| [docs/self-hosting.md](docs/self-hosting.md) | install and update Motio on your own server, behind your proxy, with your own sign-in |
| [docs/api.md](docs/api.md) | workspace API: importing absences from time tracking or HR |
| [CHANGELOG.en.md](./CHANGELOG.en.md) · [CHANGELOG.md](./CHANGELOG.md) | change history (en / ru) |
| [MANIFESTO.md](./MANIFESTO.md) | product principles |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | how to report a bug, propose an idea or send a pull request |
| [SECURITY.md](./SECURITY.md) | how to report a security problem privately |
| [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) | how we treat each other in issues, discussions and pull requests |
| [AGENTS.md](./AGENTS.md) | working instructions for AI assistants |

## 🤝 Contributing

Found a bug or hit a wall? [Open an issue](https://github.com/eleron96/motio/issues/new/choose).
Have a question, or want to show how your team plans its week? Head to
[Discussions](https://github.com/eleron96/motio/discussions). Setup, checks and the
note on licensing for pull requests are in [CONTRIBUTING.md](./CONTRIBUTING.md), and
everyone taking part follows the [Code of Conduct](./CODE_OF_CONDUCT.md).

Security problem? Please report it privately — see [SECURITY.md](./SECURITY.md).

## 📄 License

Motio is free software under the [GNU Affero General Public License v3.0](./LICENSE)
(`AGPL-3.0-only`). You can use it, run it for your team on your own servers, study it,
change it and share it. If you let other people use a modified version over a network,
you must offer them the source of that version under the same licence.

Copyright © 2026 Niko G.

The name "Motio" and the Motio logo are not covered by the licence: a fork, or a modified
version offered to others, needs a name and a logo of its own.

Need different terms — for example, to build Motio into a closed product? Write to
[inbox@nikog.net](mailto:inbox@nikog.net).
