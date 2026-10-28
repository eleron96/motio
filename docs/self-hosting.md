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

```bash
cd motio
infra/scripts/install.sh update --version vX.Y.Z
```

It backs up the database to `infra/backups/pre-update-*.dump`, switches the
checkout to the release tag, adds any new settings to `.env` with their defaults
(and lists them), runs the migrations and restarts the stack. Your data, volumes
and existing settings stay. Read the release notes first: anything that needs your
attention for self-hosted installs is called out there.

Without `--version` it re-applies the current checkout (useful after editing
`.env`). `install.sh up` does the same without the backup.

## Everyday commands

`infra/scripts/selfhost-compose.sh` is `docker compose` with the right files and
`.env` for this install:

```bash
infra/scripts/selfhost-compose.sh ps
infra/scripts/selfhost-compose.sh logs -f --tail=100
infra/scripts/selfhost-compose.sh restart functions
```

## Settings

Everything lives in `.env`; after a change run `infra/scripts/install.sh up`
(settings starting with `VITE_` are baked into the web app, which this rebuilds).
The full reference is [Configuration](configuration.md). The ones you are most
likely to touch:

| Setting | Default for self-hosting |
|---|---|
| `VITE_FEATURE_TIME_OFF`, `VITE_FEATURE_WORKLOAD_HEATMAP`, `VITE_FEATURE_PROJECT_CARD`, `VITE_FEATURE_PROJECT_CARD_MOBILE`, `VITE_FEATURE_PEOPLE_SUGGEST`, `VITE_FEATURE_PUSH` | on |
| `VITE_FEATURE_KANBAN` (board view, beta), `VITE_FEATURE_ACCOUNT_DELETION`, `VITE_FEATURE_WORKSPACE_API` ([API](api.md)) | off |
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
`planner.example.com`, scheme `http`, forward hostname `127.0.0.1` (or the
host's IP from the NPM container, e.g. `172.17.0.1`), port `8088`, **Websockets
support** on, then request a certificate on the SSL tab. If NPM runs in Docker,
start Motio with `--http-port` and make Motio's Caddy reachable from NPM, e.g. by
setting `MOTIO_HTTP_BIND=172.17.0.1:8088` in `.env` and `install.sh up`.

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

## Backups

The `backup` service dumps the database, uploaded files and Keycloak every night
at 03:00 into `infra/backups/` on the server (`BACKUP_CRON`,
`BACKUP_RETENTION_COUNT`). Copy that folder off the server with your usual backup
tool, or set the `S3_*` settings to send encrypted copies to an S3 bucket — see
[Operations → Backup / Restore](operations.md). Keep `.env` safe too: without it
the backups cannot be decrypted or reconnected.

## Uninstall

```bash
infra/scripts/selfhost-compose.sh down -v   # -v also deletes all data volumes
```

## Limits

- The web app is built on your server; there are no prebuilt images yet.
- One install serves one domain. Sub-paths (`example.com/motio`) are not supported.
- Single sign-on goes through Keycloak; a direct OIDC login without Keycloak is not
  available yet.
