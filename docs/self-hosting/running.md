# Day to day

## Is everything all right?

```bash
infra/scripts/install.sh status
```

A read-only health report: the version and checkout, the containers, whether the
API gateway, sign-in, storage, backups and Keycloak answer, free disk, the last
backup and whether a newer release exists. Paste it when you ask for help.

The same picture is in the browser: sign in as a super admin and open
**Admin → System** (`/app/admin/system`). It shows

- the version, and a newer release with the exact update command;
- whether each service answers;
- which features and server settings are on (yes or no only, never the values);
- **Send test email**, to check [email](./email.md);
- **Sign-in checks**: whether sign-up is open, address confirmation, Keycloak's
  mail, and for each external sign-in provider Trust Email, Sync mode and group
  mappers — with what needs attention (for example Trust Email off while
  addresses must be confirmed);
- **Support report**: one file with versions, switches, service health, sign-in
  configuration and counts, without names, addresses or secrets. Attach it to a
  bug report.

It only reads: updating stays `install.sh update` on the server.

## The admin console's other tools

- **Admin → Activity log** (`/app/admin/activity`): what super admins changed in
  the console (settings, members and roles, workspaces, group mappings,
  broadcasts, announcements) and what the group sync did on its own — who joined
  through a group, who was taken out, whose role followed the group. Settings
  changed with `install.sh settings` are there too. Backups and Keycloak's own
  console keep their own logs.
- **Admin → Users → Details**: a person's workspaces and how they sign in — the
  Keycloak account (on or off, address confirmed, what Keycloak will ask at the
  next sign-in), the providers it is linked to, its Keycloak groups, where super
  admin comes from, and what the group sync would do at their next visit. Nothing
  is changed by looking.
- **Admin → Invitations** (`/app/admin/invitations`): every invitation nobody has
  answered, in every workspace, with **Copy link** (useful without email) and
  **Revoke**.

## Logs and containers

`infra/scripts/selfhost-compose.sh` is `docker compose` with the right files and
`.env` for this install:

```bash
infra/scripts/selfhost-compose.sh ps
infra/scripts/selfhost-compose.sh logs -f --tail=100
infra/scripts/selfhost-compose.sh logs --since 15m functions
infra/scripts/selfhost-compose.sh restart functions
```

The services, so you know which log to read:

| Service | Does |
|---|---|
| `web` | the web app (static files) |
| `caddy` | HTTPS and routing; the only container reachable from outside |
| `gateway` | API gateway in front of the backend services |
| `auth` | sessions (GoTrue) |
| `rest` | data API (PostgREST) |
| `realtime` | live updates |
| `storage` | uploaded files |
| `functions` | backend functions: admin console, email, push, group sync, API |
| `db` | PostgreSQL |
| `keycloak`, `keycloak-db` | accounts and sign-in, and their database |
| `oauth2-proxy` | sends any other path through Keycloak sign-in |
| `backup` | nightly backups and scheduled jobs |

> [!TIP]
> After restarting `auth`, `rest`, `realtime` or `backup` on their own, restart
> `gateway` too: it looks up their addresses only when it starts. `install.sh up`
> does all of this in the right order.

## Portainer, WUD and Beszel

Motio fits next to these tools, with a few things to know.

**Portainer.** Install and update Motio with `install.sh` over SSH, not as a
Portainer stack: an update also migrates the database and takes a backup set, and
the stack is several compose files plus generated settings. Portainer shows the
stack `motio` as created outside Portainer (limited control). Logs, console,
statistics, start, stop and restart work there. Do not redeploy or edit the stack
from Portainer: change settings in `.env` and run `install.sh up`.

**What's Up Docker (WUD).** Motio's images are chosen and tested together and change
only with a Motio release ([Security](./security.md)). WUD will report newer
versions of images like `supabase/postgres` or `keycloak`: do not apply them one by
one, update Motio instead. Motio itself is built on your server, so WUD does not see
its releases. To keep WUD quiet about Motio's containers, label them in your own
additions file ([below](#your-own-additions)):

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

**Beszel**, or any container monitor, needs nothing from Motio. The containers are
named `motio-<service>-1`, and each has a memory limit sized for a 4 GB server.

## Networks

The stack runs on its own Docker network, `motio_default`. Nothing else joins it,
and from outside only Caddy is reachable:

- on ports 80 and 443 (mode `tls`);
- on `127.0.0.1:<--http-port>` (mode `proxy`);
- or only through your proxy's network (`--proxy-network`).

The API gateway and Keycloak also listen on `127.0.0.1` ports (`--gateway-port`,
`--keycloak-port`), which `install.sh` uses for setup and `status`.

## Your own additions

`infra/docker-compose.selfhost.local.yml`, if it exists, is applied on top of
Motio's compose files by `install.sh` and `selfhost-compose.sh`: labels, an extra
network, other memory limits. It is not part of the repository, so updates never
touch it. Paths in it are relative to the `infra/` folder.

Keep it to additions: changing Motio's own services, volumes or ports there is not
supported.

## Uninstall

```bash
infra/scripts/selfhost-compose.sh down -v   # -v also deletes all data volumes
```

Backups in `infra/backups/` stay until you delete the folder.
