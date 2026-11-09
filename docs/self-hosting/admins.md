# Administrators

Three kinds of administrator, for three different things:

| Who | Can | Where |
|---|---|---|
| **Workspace admin** | manage one workspace: members, roles, settings | inside Motio, per workspace |
| **Super admin** | the admin console: all users and workspaces, settings, backups, announcements, system status, the activity log | `https://<domain>/app/admin` |
| **Keycloak administrator** | Keycloak itself: realms, sign-in providers, password policies | `https://<domain>/admin` |

## Super admins

The admin console opens for people with the realm role `app_super_admin` in realm
**timeline**. It is separate from workspace roles (viewer, editor, admin): a
Keycloak group called "Admins" grants nothing by its name alone.

The installer creates one: the **reserve admin** (`RESERVE_ADMIN_EMAIL` /
`RESERVE_ADMIN_PASSWORD` in `.env`). It is a service account that always has a way
into the console, even when Keycloak is misconfigured. Use it to set up, then make
real people super admins.

### Make someone a super admin

Keycloak → realm **timeline** → **Users** → the person → **Role mapping** →
**Assign role** → `app_super_admin`. The console opens for them on the next page
load.

### Or grant it through a group

For example a group your identity provider fills, such as "Motio-Admins" from
Authentik:

1. Turn on **Super admins from a group** in **Admin → Settings** (or
   `infra/scripts/install.sh settings set groups.superAdmin on`;
   `KEYCLOAK_SUPER_ADMIN_FROM_GROUPS=true` in `.env` works too).
2. Keycloak → realm **timeline** → **Groups** → the group → **Role mapping** →
   **Assign role** → `app_super_admin`.
3. If the group comes from your identity provider through a mapper, set the
   mapper's **Sync mode** to *force*, so that leaving the group there takes
   effect at the next sign-in.

Access is checked against Keycloak on every visit to the console, so a person who
leaves the group loses it right away. A role that comes from a group is never
copied onto the person. One limit: **Force purge account** on the Users page needs
the role assigned to the person directly.

## Replace the temporary Keycloak administrator

Keycloak calls the administrator the installer created *temporary* and suggests
replacing it. The account lives in realm **master**; realm **timeline**, where your
people are, is not affected.

> [!IMPORTANT]
> Motio's scripts and backend sign in to Keycloak with `KEYCLOAK_ADMIN` /
> `KEYCLOAK_ADMIN_PASSWORD` from `.env`. The new account has to go there before
> the old one is removed, otherwise the next `install.sh up` or `update` stops with
> `401` from Keycloak.

1. `https://<domain>/admin` → realm **master** → **Users** → **Add user**. Set a
   password on **Credentials** with *Temporary* off, and on **Role mapping** assign
   the realm role `admin`.
2. Put the new login into `.env`: `KEYCLOAK_ADMIN=<new user>` and
   `KEYCLOAK_ADMIN_PASSWORD=<its password>`.
3. Run `install.sh up`. It applies the Keycloak settings with the new account; if
   it stops with `401`, check step 2 before going on.
4. Sign in to the Keycloak console as the new user and delete the temporary one in
   realm **master** → **Users**.

Keycloak creates its first administrator only once, when its database is empty, so
the temporary account does not come back. The new account lives in Keycloak's
database and `.env` holds its password; both are in every
[backup set](./backups.md#backup-sets), so a rollback brings back a matching pair.

Change this password the same way later: first in Keycloak, then in `.env`.
Changing only `.env` locks the scripts out.
