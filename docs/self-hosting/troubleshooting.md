# Troubleshooting

Start with the health report. It tells you which part is unhappy:

```bash
infra/scripts/install.sh status
infra/scripts/selfhost-compose.sh logs --since 15m
```

Below are the messages people actually run into, with what to do about each.
Not on the list? Ask in
[Discussions → Q&A](https://github.com/eleron96/motio/discussions/categories/q-a)
or [open an issue](https://github.com/eleron96/motio/issues/new/choose) with the
`status` output.

## Installing

### `Error: Docker Compose … is too old: 2.24 or newer is required.`

Update Docker's Compose plugin (`docker-compose-plugin` in Docker's own package
repository). The standalone `docker-compose` v1 is not enough.

### `Warning: less than 3 GB of RAM: building the web app may run out of memory.`

The first build is the hungriest step. Add swap for the install, or build on a
bigger server and [move the install](./backups.md#moving-to-another-server).

### `FATAL: the database system is shutting down` during the first install

The database restarts once on its very first start, and installers before 0.10.69
could catch it in that moment. Nothing is broken: run
`infra/scripts/install.sh up` to finish. Fixed in 0.10.69.

### `Permission denied` on `infra/backups`

Docker created `infra/backups` as root before the installer did, so a non-root user
could not write backup sets into it. Installers from 0.10.69 hand the folder over by
themselves. On older ones, once:

```bash
sudo chown "$(id -u):$(id -g)" infra/backups
```

### `NOTICE: realtime.messages not found, task draft channel policies skipped`

Expected on a fresh install. The realtime service creates that table when the
first browser connects, and the next `install.sh up` or `update` adds the rules.

## Signing in

### `Failed to obtain Keycloak admin token (HTTP 401). Check KEYCLOAK_ADMIN/KEYCLOAK_ADMIN_PASSWORD.`

The Keycloak administrator in `.env` does not match the one in Keycloak, usually
because the password was changed in only one of them. Put the current login of
realm **master**'s administrator into `KEYCLOAK_ADMIN` and
`KEYCLOAK_ADMIN_PASSWORD`, and run `install.sh up`. Changing it the right way:
[Administrators](./admins.md#replace-the-temporary-keycloak-administrator).

### `Warning: could not confirm the reserve admin account (HTTP …)`

Same cause in most cases: the backend could not sign in to Keycloak.
`infra/scripts/selfhost-compose.sh logs functions` shows `Invalid user credentials`
then. Fix `.env` as above.

### Sign-up stops at "verify your email"

Email confirmation is on, but no email arrives. Check SMTP with
**Admin → System → Send test email** ([Email](./email.md#check-that-it-works)).
Without SMTP, `install.sh up` turns confirmation off, so run it again if someone
switched it on by hand. To let one person in now: Keycloak → **Users** → the person
→ **Email verified** on.

### People from my identity provider are asked to confirm their email

Keycloak does not trust your provider's addresses yet. Turn on **Trust Email** and
**Sync mode: force** on the provider; see
[Your own sign-in](./sign-in.md#email-verification).

### Bad Request or a wrong address after signing in

The public address Motio was installed with does not match the one people use.
Check `--domain` (or `--public-url`), and that your proxy keeps the `Host` header and
sends `X-Forwarded-Proto` ([Reverse proxy](./reverse-proxy.md)). After fixing
`.env`, run `install.sh up`: it updates Keycloak's redirect addresses too.

### The admin console says I have no access

The console needs the `app_super_admin` role in realm **timeline**, not a workspace
role or a group called "Admins". See [Administrators](./admins.md#super-admins).

## Using Motio

### Changes from others appear only after reloading

Live updates use WebSockets. Your proxy has to let them through: **Websockets
support** in Nginx Proxy Manager, the `Upgrade` and `Connection` headers in nginx
([Reverse proxy](./reverse-proxy.md)).

### Uploading a file fails with `413`

Your proxy limits the request size. Allow at least 50 MB (`client_max_body_size 50m`
in nginx).

### `502` on every `/functions/v1/…` after recreating containers

The backend functions download their packages from the npm registry when they
start, and keep them in the `motio_deno_cache` volume. Check that the server can
reach `registry.npmjs.org`, then
`infra/scripts/selfhost-compose.sh restart functions gateway`.

### `connect() failed` in the gateway log

A backend service was recreated on its own and the gateway still has its old
address. Restart the gateway: `infra/scripts/selfhost-compose.sh restart gateway`,
or run `install.sh up`.

## Updating and restoring

### `Error: the checkout has local changes; commit or stash them first.`

Someone edited a file of the repository on the server. See what changed with
`git status` and `git diff`; move your own compose changes into
`infra/docker-compose.selfhost.local.yml`
([Day to day](./running.md#your-own-additions)), then `git stash` the rest.

### `Error: no release tag vX.Y.Z.`

That version was never published. Run `git fetch --tags` and pick one from
`git tag` or [GitHub Releases](https://github.com/eleron96/motio/releases); see
[Which version to pick](./updates.md#which-version-to-pick).

### `the service schemas differ: PostgreSQL 15 has '… 45 …', 17 has '… 91 …'`

The installer of 0.10.66 stopped the move to PostgreSQL 17 on a slow server: it
measured one of the services before that service had finished preparing its
tables. Nothing was lost: the PostgreSQL 15 volume is untouched.

Update straight to the newest release (`install.sh update --version vX.Y.Z`). Its
installer waits until every service reports itself ready, sets the unfinished copy
aside and starts the move over.

### `This backup set cannot be restored: its database copy is PostgreSQL 17, but Motio … runs PostgreSQL 15`

The installer refused a set whose database copy does not fit its release, and
nothing changed. Such a set comes from an update by 0.10.66 or older after an
earlier, unfinished move to PostgreSQL 17. The message lists your sets; restore an
older one that fits, or update forward instead.

> [!CAUTION]
> Installers of 0.10.66 and older do not check this and empty the PostgreSQL 15
> volume before restoring. On such a release, check a set before `rollback`; the
> answer must be `15`:
>
> ```bash
> tar -xzOf infra/backups/install/<set>/database.tar.gz ./PG_VERSION
> ```

### An update or restore stopped halfway

Read the last lines: the installer says what state it left and prints the command
to continue or to go back. An update that failed before its backup changed nothing;
one that failed after it is undone with `install.sh rollback`
([Updates](./updates.md#if-something-goes-wrong)).
