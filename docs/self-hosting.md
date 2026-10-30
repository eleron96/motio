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
- Optional: an **SMTP account** for email (invitations of new people, password
  resets, the welcome email). Motio runs without it; see [Email](#email).

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

## Update

Nothing updates on its own: every image is pinned to an exact version, and a new
release reaches your server only when you run:

```bash
cd motio
infra/scripts/install.sh update --version vX.Y.Z
```

Read the release notes first: anything that needs your attention for self-hosted
installs is called out there ("For your own servers: …"). The update runs in three
steps:

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
first, so a rollback can itself be undone with `install.sh restore`.

Without `--version`, `update` re-applies the current checkout with the same backup.
`install.sh up` re-applies the configuration without a backup (after editing `.env`).

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
| `VITE_FEATURE_TIME_OFF`, `VITE_FEATURE_WORKLOAD_HEATMAP`, `VITE_FEATURE_PROJECT_CARD`, `VITE_FEATURE_PROJECT_CARD_MOBILE`, `VITE_FEATURE_PEOPLE_SUGGEST`, `VITE_FEATURE_PUSH` | on |
| `VITE_FEATURE_KANBAN` (board view, beta), `VITE_FEATURE_ACCOUNT_DELETION`, `VITE_FEATURE_WORKSPACE_API` ([API](api.md)), `VITE_FEATURE_TASK_LIVE_DRAFTS` (teammates' live drafts in a task) | off |
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
people can still sign up. People who already have an account still see
invitations inside Motio; a new person can't receive the invitation email, so
either create their account in the Keycloak console with a temporary password or
let them sign up while registration is open.

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
4. Optional: in the provider's **Advanced** settings turn on *Sync mode: force* to
   keep names and emails in step, and *Hide on login page* + the realm's
   **Login → Identity provider redirector** (default provider) to skip Keycloak's
   own login page entirely.

The sign-in page then shows "Sign in with <your provider>". Keycloak stays as the
layer in between.

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
| Database: workspaces, projects, tasks, people, accounts | volume `motio_db_data` |
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

**What's Up Docker (WUD).** Motio's images are pinned to exact versions that are
tested together, and they change only with a Motio release. WUD will report newer
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
