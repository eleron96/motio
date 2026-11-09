# Install

## Get the code

```bash
git clone https://github.com/eleron96/motio.git
cd motio
git checkout vX.Y.Z           # the latest release tag from the Releases page
```

Install from a release tag, not from `main`: tags are the versions that were
released and tested for self-hosting.

## Pick a mode

### `tls`: this server is reachable from the internet directly

Motio's own Caddy takes ports 80 and 443 and gets a Let's Encrypt certificate.

```bash
infra/scripts/install.sh --domain planner.example.com --email you@example.com
```

### `proxy`: you already run a reverse proxy

Nginx Proxy Manager, Traefik, nginx, HAProxy… Motio listens on plain HTTP on
`127.0.0.1` only, and your proxy terminates TLS.

```bash
infra/scripts/install.sh --domain planner.example.com --email you@example.com \
  --mode proxy --http-port 8088
```

In your proxy, create **one** host for `planner.example.com` that forwards
everything to `http://127.0.0.1:8088`. That is all the routing you do: Motio's own
Caddy behind it splits the paths. Examples: [Reverse proxy](./reverse-proxy.md).

### `proxy` on a shared Docker network

If your proxy runs in Docker and reaches its applications over a shared network
(Nginx Proxy Manager with `npm_backend`, Traefik with its own network…), let Motio
join that network instead of publishing a port:

```bash
infra/scripts/install.sh --domain planner.example.com --email you@example.com \
  --mode proxy --proxy-network npm_backend
```

Only Motio's Caddy joins it, under the name `motio` (the `--instance` name), and the
proxy forwards to `http://motio:80`. The network must exist before the install
(`docker network ls`). On an existing install, set
`MOTIO_PROXY_NETWORK=npm_backend` in `.env` and run `install.sh up`.

## All install options

| Option | What it does |
|---|---|
| `--domain HOST` | Your address, e.g. `planner.example.com`. Required. |
| `--email EMAIL` | Your email: the Let's Encrypt contact and the sender of mail. Required. |
| `--mode tls\|proxy` | See above. Default `tls`. |
| `--http-port PORT` | Local port for `--mode proxy`. Default `8088`. |
| `--proxy-network NAME` | Join your proxy's Docker network instead of publishing a port. |
| `--public-url URL` | The public address, if it is not `https://<domain>` (e.g. a proxy on another port). |
| `--version TAG` | Release to install; default is the current checkout. |
| `--instance NAME` | Name of the compose project and prefix of the volumes. Default `motio`. Two installs on one server need two names. |
| `--gateway-port`, `--keycloak-port` | Loopback ports of the API gateway and Keycloak. Defaults `8080`, `8081`. |
| `--smtp-host`, `--smtp-port`, `--smtp-user`, `--smtp-pass`, `--smtp-from` | Outgoing mail; see [Email](./email.md). |
| `--env-only` | Only write `.env` and stop, to review it first; `install.sh up` then starts everything. |

## What the installer does

1. Checks Docker, Compose, memory and the tools from [Requirements](./requirements.md).
2. Writes `.env` (mode `600`): random passwords, a JWT secret and signed API keys,
   a Keycloak client secret, Web Push keys, and every public URL derived from your
   domain. An existing `.env` is never overwritten, so running it again is safe.
3. Starts the database, Keycloak and the backend, applies the Keycloak settings,
   runs the database migrations, creates the reserve admin account, builds the web
   app and starts Caddy.
4. Prints the address and where to find the admin passwords.

The first run takes 10–15 minutes, most of it building the web app.

> [!NOTE]
> The first migration prints a few notices about objects that do not exist yet,
> among them `realtime.messages not found, task draft channel policies skipped`.
> That one is expected: the realtime service creates the table when the first
> browser connects, and the next `install.sh up` or `update` adds the rules. They
> only matter for live drafts in tasks, which are off by default.

## Sign in

Open your address and choose **Create an account**: sign up with your own email.
You get your own workspace and bring your team in from its settings
(**Workspace settings → Members and access**; more in
[People and workspaces](./people.md)).

Two more accounts exist for administration:

| | Where | Login |
|---|---|---|
| Reserve admin (super admin) | `https://<domain>/app/admin` | `RESERVE_ADMIN_EMAIL` / `RESERVE_ADMIN_PASSWORD` in `.env` |
| Keycloak administrator | `https://<domain>/admin` | `admin` / `KEYCLOAK_ADMIN_PASSWORD` in `.env` |

The reserve admin is a service account for the admin console, not for working in
Motio. To give yourself the admin console, see [Administrators](./admins.md).

## Close registration (optional)

Registration is open to anyone who can reach your address. Once your team has
accounts, or once people come in through your own sign-in, you can close it:
Keycloak → realm **timeline** → **Realm settings** → **Login** →
**User registration** off. People are then brought in by invitation, directly by a
super admin, or by their groups; see [People and workspaces](./people.md).

Updates never turn registration back on.

Next: [Administrators](./admins.md), or [Reverse proxy](./reverse-proxy.md) if you
chose `proxy`.
