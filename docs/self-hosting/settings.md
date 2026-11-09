# Settings

There are two kinds of settings:

- [Switches in the admin console](#switches-in-the-admin-console): extras a super
  admin turns on in **Admin → Settings** or from the command line. They apply
  without a restart.
- [Settings in `.env`](#settings-in-env): addresses, secrets, mail and anything the
  services need when they start.

## Switches in the admin console

**Admin → Settings** lists what this server allows beyond Motio out of the box.
Everything is **off** by default, and turning a switch off brings back how Motio
works without it; values that people entered stay and come back when it is on again.
People get a change the next time they open Motio.

| Switch | What it allows |
|---|---|
| `groups.workspaces` | Keycloak groups put people into workspaces ([People and workspaces](./people.md#workspaces-from-groups)) |
| `groups.removeOnLeave` | leaving the group also takes that access away |
| `groups.syncRoles` | moving to another group also changes the role that group gave ([People and workspaces](./people.md#when-someone-moves-to-another-group)) |
| `groups.superAdmin` | the super admin role can come from a Keycloak group ([Administrators](./admins.md#or-grant-it-through-a-group)) |
| `timeline.density` | workspace admins can make the timeline denser: smaller photos, lower rows |
| `heatmap.personCapacity` | workspace admins give each person a share, 0–100 %, in the workload heatmap |
| `workspaces.closures` | workspace admins add days off for everyone (company closures) |
| `dashboards.transfer` | dashboards can be duplicated, exported to a file and imported |
| `dashboards.calendarPeriods` | dashboard widgets can show this or next calendar week or month |

The same from the command line:

```bash
infra/scripts/install.sh settings                              # list, with where each value comes from
infra/scripts/install.sh settings set timeline.density on
infra/scripts/install.sh settings reset timeline.density       # back to the default (off)
```

The values are kept in the database, so they are part of every backup and come
back with a restore.

The older `.env` keys still work: `KEYCLOAK_WORKSPACES_FROM_GROUPS`,
`KEYCLOAK_WORKSPACES_FROM_GROUPS_REMOVE` and `KEYCLOAK_SUPER_ADMIN_FROM_GROUPS` set
to `true` turn their switch on and lock it (the console shows "On through … in
.env"). `false` or nothing leaves the switch to the console.

## Settings in .env

Every other setting lives in `.env` in the checkout folder. After a change:

```bash
infra/scripts/install.sh up
```

It applies the change everywhere it is needed. Settings starting with `VITE_` are
built into the web app, so `up` rebuilds it, which takes a few minutes.

`.env` is created by the installer and never overwritten. An update adds new
settings with their defaults and lists them; the defaults keep things as they were.

### The ones you are most likely to change

#### What people see

| Setting | Default | |
|---|---|---|
| `VITE_START_PAGE` | `landing` | `app` opens sign-in and the app right at your address, without the public start page |
| `VITE_FEATURE_PUSH` | `true` | push notifications in the browser and on phones |
| `VITE_FEATURE_KANBAN` | `false` | the board view next to the timeline (beta) |
| `VITE_FEATURE_ACCOUNT_DELETION` | `false` | people can delete their own account |
| `VITE_FEATURE_WORKSPACE_API` | `false` | the workspace API for importing time off ([API](https://github.com/eleron96/motio/blob/main/docs/api.md)) |
| `VITE_FEATURE_TASK_LIVE_DRAFTS` | `false` | teammates see what someone is typing in a task |

#### People and access

| Setting | Default | |
|---|---|---|
| `KEYCLOAK_SUPER_ADMIN_FROM_GROUPS` | `false` | `true` turns on and locks the switch `groups.superAdmin` (see above) |
| `KEYCLOAK_WORKSPACES_FROM_GROUPS` | `false` | `true` turns on and locks `groups.workspaces` |
| `KEYCLOAK_WORKSPACES_FROM_GROUPS_REMOVE` | `false` | `true` turns on and locks `groups.removeOnLeave` |

#### Email, backups, updates

| Setting | Default | |
|---|---|---|
| `GOTRUE_SMTP_*` | empty | outgoing mail ([Email](./email.md)) |
| `BACKUP_CRON` | `0 3 * * *` | when the nightly backup runs |
| `BACKUP_RETENTION_COUNT` | `30` | how many nightly database dumps to keep |
| `S3_*`, `BACKUP_AGE_RECIPIENT` | empty | encrypted copies of the backups in an S3 bucket ([Backups](./backups.md#off-site-copies)) |
| `MOTIO_UPDATE_CHECK` | `true` | Admin → System asks GitHub for a newer release, at most every 6 hours; `false` turns it off |

#### Network

| Setting | Default | |
|---|---|---|
| `MOTIO_HTTP_BIND` | `80`, or `127.0.0.1:8088` with `--mode proxy` | where Caddy listens for plain HTTP |
| `MOTIO_PROXY_NETWORK` | empty | your proxy's Docker network ([Install](./install.md#proxy-on-a-shared-docker-network)) |

### What stays off unless you set it

A self-hosted Motio sends nothing to anyone by default:

- **Analytics** (`VITE_PLAUSIBLE_DOMAIN`, `VITE_PLAUSIBLE_SRC`): empty, so no
  analytics script is loaded. Set them to use your own Plausible.
- **Error tracking** (`VITE_GLITCHTIP_DSN`, `GLITCHTIP_DSN`): empty. Any
  Sentry-compatible service works.
- **Release check**: the only outgoing request, see `MOTIO_UPDATE_CHECK` above.

### Do not change these by hand

- **Passwords and secrets** generated by the installer (`POSTGRES_PASSWORD`,
  `JWT_SECRET`, the API keys…): changing them in `.env` alone disconnects the
  services from data that already uses the old ones.
- **`KEYCLOAK_ADMIN_PASSWORD`**: change it in Keycloak first, then in `.env`; see
  [Administrators](./admins.md#replace-the-temporary-keycloak-administrator).
- **`MOTIO_INSTANCE`**: the prefix of every data volume. A new name starts an empty
  install next to the old one.

The full list of settings, with every variable explained, is in
[Configuration](https://github.com/eleron96/motio/blob/main/docs/configuration.md).
