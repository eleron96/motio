# Updates and rollback

Nothing updates on its own. A new release reaches your server only when you run:

```bash
cd motio
infra/scripts/install.sh update --version vX.Y.Z
```

Read the release notes first: anything that needs your attention on a self-hosted
install is called out there as "For your own servers: …".

## Which version to pick

The newest one. You can go from any release straight to the newest: `update` runs
the database migrations of every release in between, so there is no need to step
through them.

Only published releases have a tag. The list is on
[GitHub Releases](https://github.com/eleron96/motio/releases), or run
`git fetch --tags && git tag`. Version numbers in between, such as 0.10.63 and
0.10.64, were never published and have no tag to update to.

The admin console says when a newer release is out: a dot appears next to
**System** in its menu, and the overview shows the new version. **Admin → System**
then lists what changed since the version you run — the notes marked "For your
own servers" first — and the command to update. `install.sh status` says it on
the command line. To be told by GitHub, open the repository and choose
**Watch → Custom → Releases**.

## What happens during an update

1. **Prepare, while Motio keeps running.** The checkout switches to the release
   tag, new settings are added to `.env` with their defaults (and listed), the new
   images are downloaded and the web app is built. If anything fails here (most
   often the network), the checkout switches back and nothing has changed.
2. **Back up.** Motio stops, and everything is copied into a
   [backup set](./backups.md#backup-sets): the database, sign-ins, uploaded files,
   certificates, `.env` and the release it ran, in
   `infra/backups/install/pre-update-<time>/`. The three newest of these are kept.
3. **Start the new release.** The database migrations run and the stack starts.

Motio is offline from step 2 until step 3 is done: usually a few minutes, longer
with many uploaded files.

> [!NOTE]
> **Moving to PostgreSQL 17.** The first update to 0.10.66 or newer also moves the
> database from PostgreSQL 15 to 17, right after the backup set. It takes about a
> minute longer than a usual update, more on a slow server. The data is copied into
> a new volume and compared table by table; the update stops if anything differs.
> The PostgreSQL 15 volume stays untouched, so a rollback goes back to it. Keep free
> disk space of about twice the size of the database.

## If something goes wrong

The update stopped with an error, or the new release does not behave? Go back:

```bash
infra/scripts/install.sh rollback
```

It puts the newest `pre-update-*` set back: the previous release, its `.env` and all
data exactly as they were right before the update. It shows what it is about to
restore and asks you to type `restore`.

- Anything changed after the update is lost. The state at the moment of the
  rollback is kept first as a `pre-restore-*` set, so a rollback can itself be
  undone with `install.sh restore`.
- The previous release is started by its own installer, so a rollback works even
  when the newer release added steps the older one does not know.

Then tell us what happened ([open an issue](https://github.com/eleron96/motio/issues/new/choose)
with the output of `install.sh status`), or see [Troubleshooting](./troubleshooting.md).

## Other ways to apply changes

| Command | Takes a backup set | When |
|---|---|---|
| `install.sh update --version vX.Y.Z` | yes | a new release |
| `install.sh update` | yes | re-apply the current checkout, e.g. after a failed update you fixed |
| `install.sh up` | no | after editing `.env`; also safe to run any time |

## How updates are tested

Every week, and whenever the installer changes, the repository runs the real
installer on a clean machine: it installs v0.10.61, v0.10.65 and the newest
release, adds data, updates to the commit under test, rolls back, updates again,
then backs up and restores. After every step it checks the data, an uploaded file,
signing in and live updates.
([Self-hosted upgrade](https://github.com/eleron96/motio/actions/workflows/selfhost-upgrade.yml))
