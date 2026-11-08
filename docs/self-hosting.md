# Self-hosting Motio

Run Motio on your own server with one command, under your own domain, behind your
own reverse proxy if you have one. Everything stays on your machine: the install
sends nothing to motio.nikog.net, no analytics, no error reports.

See also: [Configuration](configuration.md) · [Operations](operations.md) ·
[API](api.md) · [Troubleshooting](troubleshooting.md)

## What you need

- A Linux server with **2 vCPU and 4 GB of RAM** (3 GB works, the first build is
  slow), about 15 GB of free disk.
- **Docker** with **Compose v2.24 or newer** (`docker compose version`), plus `git`,
  `python3`, `openssl` and `curl` — present on most distributions.
- A **domain name** pointing at the server (an A/AAAA record), e.g.
  `planner.example.com`.
- Optional: an **SMTP account** for email (invitation emails, password resets,
  the welcome email). Motio runs without it; see [Email](#email).

## Install

```bash
git clone https://github.com/eleron96/motio.git
cd motio
git checkout vX.Y.Z           # the latest release tag from the Releases page
```

Then pick one of the two modes.

### Mode `tls`: this server is reachable from the internet directly

Motio's own Caddy takes ports 80 and 443 and gets a Let's Encrypt certificate.

```bash
infra/scripts/install.sh --domain planner.example.com --email you@example.com
```

### Mode `proxy`: you already run a reverse proxy

Nginx Proxy Manager, Traefik, nginx, HAProxy… Motio listens on plain HTTP on
`127.0.0.1` only, and your proxy terminates TLS.

```bash
infra/scripts/install.sh --domain planner.example.com --email you@example.com \
  --mode proxy --http-port 8088
```

In your proxy, create **one** host for `planner.example.com` that forwards
everything to `http://127.0.0.1:8088`. That is all the routing you do: Motio's
own Caddy behind it splits the paths. Examples are [below](#reverse-proxy-examples).

If your proxy runs in Docker and reaches its applications over a shared Docker
network (Nginx Proxy Manager with an `npm_backend` network, Traefik with its own
network…), let Motio join that network instead of publishing a port:

```bash
infra/scripts/install.sh --domain planner.example.com --email you@example.com \
  --mode proxy --proxy-network npm_backend
```

Only Motio's Caddy joins it, under the name `motio` (the `--instance` name); the
proxy forwards to `http://motio:80`. No port of Motio is published on the host for
the site. The network must exist before the install (`docker network ls`). On an
existing install, set `MOTIO_PROXY_NETWORK=npm_backend` in `.env` and run
`infra/scripts/install.sh up`.

### What the installer does

1. Checks Docker, Compose, memory and the tools above.
2. Writes `.env` (mode `600`): random passwords, a JWT secret and signed API keys,
   a Keycloak client secret, Web Push keys, and every public URL derived from your
   domain. An existing `.env` is never overwritten, so running it again is safe.
3. Starts the database, Keycloak and the backend, applies the Keycloak settings,
   runs the database migrations, creates the reserve admin account, builds the web
   app and starts Caddy.
4. Prints the address and where to find the admin passwords.

`install.sh --env-only …` writes `.env` and stops, if you want to review or edit it
first; `install.sh up` then starts everything.

The first migration prints a few notices about objects that do not exist yet,
among them `realtime.messages not found, task draft channel policies skipped`.
That one is expected: the realtime service creates the table when the first
browser connects, and the next `install.sh up` or `update` adds the rules. They
only matter for live drafts (`VITE_FEATURE_TASK_LIVE_DRAFTS`, off by default), and
turning that on needs `install.sh up` anyway.

The first run takes 10–15 minutes, most of it building the web app.

### First sign-in

Open your address and choose **Create an account**: sign up with your own email.
You get your own workspace and invite the team from its settings
(**Workspace settings → Members and access**).

Two more accounts exist for administration:

| | Where | Login |
|---|---|---|
| Reserve admin (super admin) | `https://<domain>/app/admin` | `RESERVE_ADMIN_EMAIL` / `RESERVE_ADMIN_PASSWORD` in `.env` |
| Keycloak administrator | `https://<domain>/admin` | `admin` / `KEYCLOAK_ADMIN_PASSWORD` in `.env` |

Registration is open to anyone who can reach your address. Once your team has
accounts you can close it: Keycloak → realm **timeline** → **Realm settings** →
**Login** → **User registration** off. People are then added by invitation only
(which needs [email](#email)).

### Super admins

The admin console (`/app/admin`) opens for people with the realm role
`app_super_admin` in realm **timeline**. It is separate from workspace roles
(viewer, editor, admin): a Keycloak group called "Admins" grants nothing by its
name alone.

To make someone a super admin: Keycloak → realm **timeline** → **Users** → the
person → **Role mapping** → **Assign role** → `app_super_admin`. The console opens
for them on the next page load.

To grant it through a group instead, for example one filled from Authentik:

1. Set `KEYCLOAK_SUPER_ADMIN_FROM_GROUPS=true` in `.env` and run `install.sh up`.
2. Keycloak → realm **timeline** → **Groups** → the group → **Role mapping** →
   **Assign role** → `app_super_admin`.
3. If the group comes from your identity provider through a mapper, set the
   mapper's **Sync mode** to *force*, so that leaving the group there takes
   effect at the next sign-in.

Access is checked against Keycloak on every visit to the console, so a person
who leaves the group loses it right away. A role that comes from a group is
never copied onto the person. One limit: **Force purge account** on the Users
page needs the role assigned to the person directly.

### Replace Keycloak's temporary administrator

Keycloak calls the administrator the installer created *temporary* and suggests
replacing it. The account lives in realm **master**; realm **timeline** is not
affected. Motio's maintenance scripts and backend sign in to Keycloak with
`KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD` from `.env`, so the new account has
to go there before the old one is removed — otherwise the next `install.sh up`
or `update` stops with `401` from Keycloak.

1. `https://<domain>/admin` → realm **master** → **Users** → **Add user**. Set a
   password on **Credentials** with *Temporary* off, and on **Role mapping**
   assign the realm role `admin`.
2. Put the new login into `.env`: `KEYCLOAK_ADMIN=<new user>` and
   `KEYCLOAK_ADMIN_PASSWORD=<its password>`.
3. Run `install.sh up`. It applies the Keycloak settings with the new account; if
   it stops with `401`, check step 2 before going on.
4. Sign in to the admin console as the new user and delete the temporary one in
   realm **master** → **Users**.

Keycloak creates its first administrator only once, when its database is empty,
so the temporary account does not come back. The new account lives in
Keycloak's database and `.env` holds its password; both are in every
[backup set](#backup-sets). A rollback to a set made before the change brings
the old account and the old `.env` back together, so they still match.

Change this password the same way later: first in Keycloak, then in `.env`.
Changing only `.env` locks the scripts out.

## Update

Nothing updates on its own: a new release reaches your server only when you run
(how images are chosen and patched: [Security updates](#security-updates)):

```bash
cd motio
infra/scripts/install.sh update --version vX.Y.Z
```

Read the release notes first: anything that needs your attention for self-hosted
installs is called out there ("For your own servers: …").

You can go from any release straight to the newest: `update` runs the migrations
of every release in between, so there is no need to step through them. Only
published releases have a tag (the list: GitHub Releases, or `git tag` after
`git fetch --tags`); version numbers in between, such as 0.10.63 and 0.10.64, were
never published and have no tag to update to. Every week, and whenever the
installer changes, the repository does this on a clean machine: it installs
v0.10.61, v0.10.65 and the newest release, updates them, rolls back, updates again,
backs up and restores, and checks the data after every step
([Self-hosted upgrade](../.github/workflows/selfhost-upgrade.yml)).

The update runs in three steps:

1. **Prepare, while Motio keeps running.** It switches the checkout to the release
   tag, adds any new settings to `.env` with their defaults (and lists them),
   downloads the new images and builds the web app. If anything fails here — most
   often the network — it switches back and nothing has changed.
2. **Back up.** It stops Motio and copies everything into a
   [backup set](#backup-sets): the database, sign-ins, uploaded files, certificates,
   `.env` and the release it ran, in `infra/backups/install/pre-update-<time>/`.
   The three newest of these are kept.
3. **Start the new release.** It runs the database migrations and starts the stack.

Motio is offline from step 2 until step 3 is done: the copy and the start, usually a
few minutes, longer with many uploaded files.

**If something goes wrong** — the update stops with an error, or the new release
does not behave — go back:

```bash
infra/scripts/install.sh rollback
```

It puts the newest `pre-update-*` set back: the previous release, its `.env` and all
data exactly as they were right before the update. Anything changed after the update
is lost; the state at the moment of the rollback is kept as a `pre-restore-*` set
first, so a rollback can itself be undone with `install.sh restore`. The previous
release is started by its own installer, so a rollback works even when the newer
release added steps the older one does not know.

Without `--version`, `update` re-applies the current checkout with the same backup.
`install.sh up` re-applies the configuration without a backup (after editing `.env`).

## Security updates

The images Motio runs are chosen and tested together and change with Motio
releases. The Supabase services are pinned to exact versions; a few images are
pinned to a version line (`caddy:2.11`, `postgres:15-alpine`, `keycloak:26.8`,
`nginx:1.30-alpine`, `liquibase:4.27`), and `install.sh update` pulls the latest
patch of that line.

- **Weekly scan.** The repository checks all of these images every week for known
  HIGH and CRITICAL vulnerabilities that already have a fix
  ([Image scan](../.github/workflows/image-scan.yml); the report is on the run
  page). The same check runs on your server with
  `infra/scripts/scan-images.sh` (needs Docker and `jq`).
- **Upgrades come as releases.** A newer image ships in a Motio release, together
  with any data migration it needs, and reaches you through `install.sh update`
  with its backup and rollback. Do not upgrade single containers from WUD or
  Portainer: a newer Keycloak, Postgres or Supabase service can need a migration
  or break sign-in.
- **PostgreSQL 17 (from 0.10.66).** The first `install.sh update` to such a
  release moves the database from PostgreSQL 15 by itself, after the usual backup
  set: Motio is stopped for about a minute longer than usual (more on a slow
  server: the move waits until GoTrue, Storage and Realtime report their schemas
  up to date). The data is copied into a new volume and compared table by table,
  and the update stops if anything differs. The PostgreSQL 15 volume stays as it was, so `install.sh rollback`
  goes back to the previous release with it. Keep free disk space of about twice
  the database. Details: [operations](operations.md), «Moving to PostgreSQL 17».
- **Security fixes do not wait.** A fix for a vulnerability that affects Motio
  ships as a release of its own, and its notes say so.
- **Staying informed.** On GitHub, **Watch → Custom → Releases**; advisories are
  published under the repository's **Security** tab. Admin → System also shows
  when a newer release is out.
- **The host is yours.** The kernel, Docker and SSH of the server are patched by
  you; container updates do not cover them.

To report a vulnerability in Motio itself, see [SECURITY.md](../SECURITY.md).

## Everyday commands

`infra/scripts/selfhost-compose.sh` is `docker compose` with the right files and
`.env` for this install:

```bash
infra/scripts/selfhost-compose.sh ps
infra/scripts/selfhost-compose.sh logs -f --tail=100
infra/scripts/selfhost-compose.sh restart functions
```

`infra/scripts/install.sh status` prints a read-only health report: version and
checkout, containers, the gateway / sign-in / storage / backup / Keycloak probes,
free disk, the last backup file and whether a newer release exists.

The same picture is in the browser: sign in as the reserve admin and open
**Admin → System** (`/app/admin/system`). It shows the version and a newer release
with the exact update command, whether each service answers, which features and
server settings are on (yes/no only), and sends a test email to check SMTP. It only
reads: updating stays `install.sh update` on the server. The release check asks
GitHub at most every 6 hours and sends nothing about your install; set
`MOTIO_UPDATE_CHECK=false` in `.env` to turn it off.

## Settings

Everything lives in `.env`; after a change run `infra/scripts/install.sh up`
(settings starting with `VITE_` are baked into the web app, which this rebuilds).
The full reference is [Configuration](configuration.md). The ones you are most
likely to touch:

| Setting | Default for self-hosting |
|---|---|
| `VITE_START_PAGE` — `app` opens sign-in and the app at your address instead of the public start page | `landing` |
| `VITE_FEATURE_PUSH` | on |
| `VITE_FEATURE_KANBAN` (board view, beta), `VITE_FEATURE_ACCOUNT_DELETION`, `VITE_FEATURE_WORKSPACE_API` ([API](api.md)), `VITE_FEATURE_TASK_LIVE_DRAFTS` (teammates' live drafts in a task) | off |
| `KEYCLOAK_WORKSPACES_FROM_GROUPS` — Keycloak groups put people into workspaces ([Workspaces from groups](#workspaces-from-groups)); `KEYCLOAK_WORKSPACES_FROM_GROUPS_REMOVE` — leaving the group also takes that access away | `false`, `false` |
| `GOTRUE_SMTP_*` | empty — no email |
| `VITE_PLAUSIBLE_*`, `GLITCHTIP_DSN`, `S3_*` | empty — no analytics, error tracking or off-site backups |

## Email

With `GOTRUE_SMTP_HOST`, `GOTRUE_SMTP_PORT`, `GOTRUE_SMTP_USER`,
`GOTRUE_SMTP_PASS` and `GOTRUE_SMTP_ADMIN_EMAIL` set (or the `--smtp-*` install
options), Motio sends the welcome email and Keycloak sends invitations,
verification and password-reset emails from that account. `install.sh up` applies
it to Keycloak as well.

With SMTP, new accounts also confirm their email address before the first
sign-in. Without SMTP nothing is sent, and email confirmation is switched off so
people can still sign up.

Invitations work without SMTP too. An invitation waits in Motio's notifications
for whoever signs in with that address: someone who already has an account, or a
new person who signs in through your [own sign-in](#your-own-sign-in-authentik-microsoft-entra-id-google-workspace-)
or registers. No account is created in advance. **Sent invites** has a **Copy link**
button if you want to send the link yourself; only the invited address can accept
it. A super admin can also put someone who has signed in at least once straight
into a workspace, without an invitation: **Admin → Workspaces → Add member**.

## Your own sign-in (Authentik, Microsoft Entra ID, Google Workspace, …)

Motio signs people in through its Keycloak. To let people use the accounts your
company already has, connect your identity provider to Keycloak as an external
OIDC provider (*identity brokering*) — no change to Motio is needed.

1. In your provider, create an OIDC application (in Authentik: **Applications →
   Create with provider → OAuth2/OpenID**). Redirect URI:
   `https://<domain>/realms/timeline/broker/<alias>/endpoint`, where `<alias>`
   is a short name you choose, e.g. `authentik`. Note the client ID, client
   secret and the issuer / discovery URL
   (`https://auth.example.com/application/o/<slug>/.well-known/openid-configuration`
   in Authentik).
2. In Keycloak (`https://<domain>/admin`), realm **timeline** → **Identity
   providers** → **OpenID Connect v1.0**: alias as above, paste the discovery URL,
   client ID and secret, client authentication *Client secret sent as post*.
3. Under **First login flow**, keep *first broker login*. People who already have
   a Motio account with the same email are asked to link it once.
4. Turn on **Trust Email** (the provider's **Advanced** settings) if your provider
   checks email addresses itself, as company directories do. Otherwise, once
   [SMTP](#email) is set up, everyone who comes through the provider is asked to
   confirm their email address first. With the default sync mode (*import*)
   Trust Email only covers people who sign in for the first time after it is on;
   with *Sync mode: force* (next step) it also covers those who signed in before,
   at their next sign-in. Or turn on **Email verified** for them in **Users**.
   Without SMTP nobody is asked.
5. Optional: in the provider's **Advanced** settings turn on *Sync mode: force* to
   keep names and emails in step, and *Hide on login page* + the realm's
   **Login → Identity provider redirector** (default provider) to skip Keycloak's
   own login page entirely.

The sign-in page then shows "Sign in with <your provider>". Keycloak stays as the
layer in between.

### Workspaces from groups

Instead of inviting people one by one, let a group decide who is in which
workspace: everyone in the group *Design* joins the workspace *Design* as an
editor, say. Motio reads the groups from Keycloak, so they can come from your
provider: in the provider's **Mappers** in Keycloak, a mapper of type *Advanced
Claim to Group* puts people into a Keycloak group by a claim your provider sends,
such as `groups` from Authentik (one mapper per group).

1. Set `KEYCLOAK_WORKSPACES_FROM_GROUPS=true` in `.env` and run `install.sh up`.
2. As a super admin, open **Admin → Group access**, pick the Keycloak group (its
   path, such as `/Design`), the workspace and the role.
3. Everyone in the group joins the next time they open Motio, before Motio would
   create a first workspace of their own.

- A mapping also covers the subgroups of its group (`/Company` covers
  `/Company/Design`). Several groups for one workspace: the highest role counts.
- Only access is added. Someone already in the workspace keeps their role, and the
  workspace owner is never touched.
- One account can be in at most five workspaces; a mapping beyond that is skipped
  (the functions log says so).
- Leaving the group does not take the access away, unless
  `KEYCLOAK_WORKSPACES_FROM_GROUPS_REMOVE=true`: then the access the group gave is
  taken away at the person's next visit, once no mapped group gives it any more.
  Access given by hand or by an invitation always stays. A workspace admin who
  removes someone the group put in sees them come back at their next visit: change
  the group instead.

## Reverse proxy examples

All of them forward one host, keep the `Host` header and send
`X-Forwarded-For` / `X-Forwarded-Proto` (Caddy inside Motio trusts these from
private addresses). WebSockets must pass through (live updates).

**Nginx Proxy Manager** — *Hosts → Proxy Hosts → Add*: domain
`planner.example.com`, scheme `http`, **Websockets support** on, then request a
certificate on the SSL tab. Forward hostname and port:

- NPM in Docker with a shared network (`--proxy-network npm_backend`): `motio`,
  port `80`.
- NPM directly on the host: `127.0.0.1`, port `8088` (`--http-port`).
- NPM in Docker without a shared network: the host's IP as seen from the NPM
  container, e.g. `172.17.0.1`, port `8088`, with `MOTIO_HTTP_BIND=172.17.0.1:8088`
  in `.env` and `install.sh up`.

**Traefik** (file provider):

```yaml
http:
  routers:
    motio:
      rule: Host(`planner.example.com`)
      entryPoints: [websecure]
      service: motio
      tls:
        certResolver: letsencrypt
  services:
    motio:
      loadBalancer:
        servers:
          - url: http://127.0.0.1:8088
```

**nginx**:

```nginx
server {
  listen 443 ssl http2;
  server_name planner.example.com;
  # ssl_certificate …; ssl_certificate_key …;
  client_max_body_size 50m;

  location / {
    proxy_pass http://127.0.0.1:8088;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
  }
}
```

### Without Motio's Caddy

If you would rather route the paths yourself, these are the public routes
(`infra/caddy/Caddyfile.selfhost` is the authoritative list):

| Paths | Upstream service : port |
|---|---|
| `/realms*`, `/resources*`, `/admin*`, `/js*`, `/.well-known*` | `keycloak:8080` |
| `/health`, `/auth/v1*`, `/rest/v1*`, `/realtime/v1*` (WebSocket), `/storage/v1*`, `/functions/v1*`, `/backup*` | `gateway:8080` |
| `/`, `/app*`, `/demo*`, `/invite*`, `/privacy*`, `/terms*`, `/auth*`, `/assets*`, `/branding*`, `/favicon*`, `/logo.png`, `/og-image.png`, `/sw.js`, `/manifest.json`, `/pwa-icon-*.png`, `/apple-touch-icon.png`, `/placeholder.svg`, `/robots.txt`, `/sitemap.xml` | `web:80` |
| everything else | `oauth2-proxy:4180` |

The order matters: `/auth/v1*` before `/auth*`. Copying the Caddyfile is easier.

## Where your data lives

Everything of an install is in its checkout folder and in Docker volumes named
after the instance (`motio` by default):

| What | Where |
|---|---|
| Database: workspaces, projects, tasks, people, accounts | volume `motio_db_data_pg17` (before 0.10.66: `motio_db_data`, kept after the move as the rollback) |
| Keycloak: sign-ins, passwords, realm settings | volume `motio_keycloak_db_data` |
| Uploaded files: avatars, task attachments | volume `motio_storage_data` |
| Certificates (mode `tls`) | volumes `motio_caddy_data`, `motio_caddy_config` |
| Cache of the backend functions (can be lost) | volume `motio_deno_cache` |
| Every setting and secret: database passwords, the JWT secret that signs sessions, API and Web Push keys | `.env` in the checkout (mode `600`) |
| Backups | `infra/backups/` in the checkout |
| Your own compose additions, if any | `infra/docker-compose.selfhost.local.yml` |

Docker keeps the volumes under `/var/lib/docker/volumes/<name>/_data`. They are
Docker volumes, not bind mounts to a folder of your choice; a
[backup set](#backup-sets) holds all of them, and moving an install is a backup set
restored on the other server.

`.env` is as important as the data: without it the services cannot reconnect to the
database and every session is signed out. Every backup set carries a copy.

## Backups

Two kinds, for two jobs.

**Nightly backups** — the `backup` service dumps the database, uploaded files and
Keycloak every night at 03:00 into `infra/backups/` (`BACKUP_CRON`,
`BACKUP_RETENTION_COUNT`) while Motio keeps running. Use them to get data back from
a day or a week ago. Copy the folder off the server with your usual backup tool, or
set the `S3_*` settings to send encrypted copies to an S3 bucket — see
[Operations → Backup / Restore](operations.md).

### Backup sets

A backup set is the whole install at one moment, in one folder under
`infra/backups/install/`: a copy of every data volume, `.env` and the release
(`motio-backup.txt`). Motio is stopped while the volumes are copied, so the copy is
consistent, and restoring it puts the install back exactly as it was.

| Command | |
|---|---|
| `infra/scripts/install.sh backup` | takes a set now (`manual-<time>`); Motio is offline for the copy |
| `infra/scripts/install.sh update --version vX.Y.Z` | takes a set first (`pre-update-<time>`), see [Update](#update) |
| `infra/scripts/install.sh rollback` | restores the newest `pre-update-*` set |
| `infra/scripts/install.sh restore infra/backups/install/<set>` | restores that set |

`restore` and `rollback` show what they are about to put back and ask you to type
`restore` (`--yes` skips the question, for scripts). They switch the checkout to the
release of the set, put its `.env` back (the current one is kept as
`.env.before-restore-<time>`), restore the volumes and start Motio. Before that they
take a `pre-restore-<time>` set of the current state; `--no-safety-backup` skips it
when the current state is not worth keeping or the disk is short.

Before anything is stopped, they check that the database copy of the set is the
PostgreSQL version its release runs (15 up to 0.10.65, 17 from 0.10.66). A set that
does not fit is refused and nothing changes. The installer of 0.10.66 could write
such a set: an update after an earlier, unfinished move to PostgreSQL 17 copied that
unfinished copy into the `pre-update-*` set of a PostgreSQL 15 release. An older
installer restores it without the check and empties the PostgreSQL 15 volume first;
on 0.10.66, check the set before `rollback`, the answer must be `15`:

```bash
tar -xzOf infra/backups/install/<set>/database.tar.gz ./PG_VERSION
```

If a restore stops after it switched the checkout but before the release of the
set is running (Motio is then down), it says so and prints two commands: restore
again once the cause is fixed, or go back to the `pre-restore-*` set.

A set holds the secrets of `.env` and all data: its folder is readable by its owner
only, and copies of it need the same care as `.env`. Old `manual-*` and
`pre-restore-*` sets are never deleted automatically.

**Moving to another server:** take a set on the old server
(`install.sh backup`), clone the repository on the new one, copy the set folder into
its `infra/backups/install/` and run `infra/scripts/install.sh restore
infra/backups/install/<set>`. The new server gets the same release, settings and
data; then point the domain or your proxy at it. With `--proxy-network`, create the
network on the new server first.

## Portainer, What's Up Docker, Beszel

Motio fits next to these tools; a few things to know.

**Portainer.** Install and update Motio with `install.sh` over SSH, not as a
Portainer stack: an update also migrates the database and takes a backup set, and
the stack is several compose files plus generated settings. Portainer shows the
stack `motio` as created outside Portainer (limited control): logs, console,
statistics, start, stop and restart work there. Do not redeploy or edit the stack
from Portainer; change settings in `.env` and run `install.sh up`.

**What's Up Docker (WUD).** Motio's images are chosen and tested together, and
they change only with a Motio release ([Security updates](#security-updates)). WUD will report newer
versions of images like `supabase/postgres` or `keycloak`: do not apply them one by
one, update Motio instead. Motio itself is built on your server, so WUD does not see
its releases; the [Admin → System](#everyday-commands) page and `install.sh status`
say when a new one is out, and GitHub can notify you (**Watch → Custom → Releases**
on the repository). To keep WUD quiet about Motio's containers, label them in your
own additions file (below):

```yaml
x-no-wud: &no-wud
  labels:
    wud.watch: "false"

services:
  db: *no-wud
  keycloak-db: *no-wud
  keycloak: *no-wud
  auth: *no-wud
  rest: *no-wud
  realtime: *no-wud
  functions: *no-wud
  storage: *no-wud
  gateway: *no-wud
  backup: *no-wud
  web: *no-wud
  oauth2-proxy: *no-wud
  caddy: *no-wud
```

**Beszel** (or any container monitor) needs nothing from Motio. The containers are
named `motio-<service>-1`, and each has a memory limit sized for a 4 GB server.

**Networks.** The stack runs on its own Docker network, `motio_default`. Nothing
else joins it, and from the outside only Caddy is reachable: on ports 80/443 (mode
`tls`), on `127.0.0.1:<--http-port>` (mode `proxy`), or only through your proxy's
network (`--proxy-network`). The API gateway and Keycloak also listen on
`127.0.0.1` ports (`--gateway-port`, `--keycloak-port`), which `install.sh` uses
for setup and `status`.

### Your own additions

`infra/docker-compose.selfhost.local.yml`, if it exists, is applied on top of
Motio's compose files by `install.sh` and `selfhost-compose.sh`: labels, an extra
network, other memory limits. It is not part of the repository, so updates never
touch it. Paths in it are relative to the `infra/` folder. Keep it to additions:
changing Motio's own services, volumes or ports there is not supported.

## Uninstall

```bash
infra/scripts/selfhost-compose.sh down -v   # -v also deletes all data volumes
```

Backups in `infra/backups/` stay until you delete the folder.

## Limits

- The web app is built on your server; there are no prebuilt images yet.
- Data lives in Docker volumes, not in bind mounts to a folder of your choice.
- One install serves one domain. Sub-paths (`example.com/motio`) are not supported.
- Single sign-on goes through Keycloak; a direct OIDC login without Keycloak is not
  available yet.
