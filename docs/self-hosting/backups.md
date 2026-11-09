# Backups and restore

Motio keeps two kinds of backup, for two different jobs:

| | Nightly backups | Backup sets |
|---|---|---|
| For | getting data back from a day or a week ago | putting the whole install back exactly as it was |
| Taken | every night at 03:00, by itself | before every update, or when you run `install.sh backup` |
| Holds | the database and Keycloak (dumps); uploaded files go to S3 | every data volume, `.env` and the release |
| Motio keeps running | yes | no, it stops for the copy |
| Where | `infra/backups/` | `infra/backups/install/<set>/` |

## Where your data lives

Everything of an install is in its checkout folder and in Docker volumes named
after the instance (`motio` by default):

| What | Where |
|---|---|
| Database: workspaces, projects, tasks, people, accounts | volume `motio_db_data_pg17` (before 0.10.66: `motio_db_data`, kept after the move as the way back) |
| Keycloak: sign-ins, passwords, realm settings | volume `motio_keycloak_db_data` |
| Uploaded files: avatars, task attachments | volume `motio_storage_data` |
| Certificates (mode `tls`) | volumes `motio_caddy_data`, `motio_caddy_config` |
| Cache of the backend functions (can be lost) | volume `motio_deno_cache` |
| Every setting and secret | `.env` in the checkout (mode `600`) |
| Backups | `infra/backups/` in the checkout |
| Your own compose additions, if any | `infra/docker-compose.selfhost.local.yml` |

Docker keeps the volumes under `/var/lib/docker/volumes/<name>/_data`.

> [!IMPORTANT]
> `.env` is as important as the data. Without it the services cannot reach the
> database and every session is signed out. Every backup set carries a copy; keep
> one somewhere safe as well.

## Nightly backups

The `backup` service dumps the database and Keycloak every night into
`infra/backups/` while Motio keeps running. `BACKUP_CRON` sets the time,
`BACKUP_RETENTION_COUNT` how many database dumps to keep (30).

As a super admin, **Admin → Backups** lists them: download one, take one now,
upload one, or restore it. **Restore** there replaces the database only, after
taking a safety dump of the current one; Keycloak and uploaded files are not
touched.

Copy `infra/backups/` off the server with your usual backup tool, or let Motio do
it.

### Off-site copies

With an S3 bucket (`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`,
`S3_SECRET_KEY` in `.env`), the nightly run also sends:

- the database and Keycloak dumps, kept 14 days, 8 weeks and 12 months;
- every uploaded file, one copy each; a deleted file's copy stays for 90 days.

Set `BACKUP_AGE_RECIPIENT` to an [age](https://age-encryption.org) public key and
everything in the bucket is encrypted with it. Keep the private key **off** the
server: whoever has the bucket then still cannot read your data, and without the
key neither can you. Restoring from the bucket when the server is gone:
[Operations → Restoring from S3](https://github.com/eleron96/motio/blob/main/docs/operations.md#restoring-from-s3-the-server-is-gone).

## Backup sets

A backup set is the whole install at one moment, in one folder under
`infra/backups/install/`: a copy of every data volume, `.env` and the release
(`motio-backup.txt`). Motio is stopped while the volumes are copied, so the copy is
consistent, and restoring it puts the install back exactly as it was.

| Command | |
|---|---|
| `infra/scripts/install.sh backup` | takes a set now (`manual-<time>`); Motio is offline for the copy |
| `infra/scripts/install.sh update --version vX.Y.Z` | takes a set first (`pre-update-<time>`), see [Updates](./updates.md) |
| `infra/scripts/install.sh rollback` | restores the newest `pre-update-*` set |
| `infra/scripts/install.sh restore infra/backups/install/<set>` | restores that set |

The three newest `pre-update-*` sets are kept. `manual-*` and `pre-restore-*` sets
are never deleted automatically.

> [!WARNING]
> A set holds the secrets of `.env` and all data. Its folder is readable by its
> owner only; copies of it need the same care as `.env`.

### What a restore does

`restore` and `rollback` show what they are about to put back and ask you to type
`restore` (`--yes` skips the question, for scripts). Then they:

1. check that the database copy in the set matches the PostgreSQL version its
   release runs (15 up to 0.10.65, 17 from 0.10.66). A set that does not fit is
   refused, and nothing changes;
2. take a `pre-restore-<time>` set of the current state (`--no-safety-backup` skips
   it when the current state is not worth keeping or the disk is short);
3. switch the checkout to the release of the set and put its `.env` back (the
   current one is kept as `.env.before-restore-<time>`);
4. restore the volumes byte for byte and start Motio.

If a restore stops halfway, after the checkout switched but before the release is
running (Motio is then down), it says so and prints two commands: restore again once
the cause is fixed, or go back to the `pre-restore-*` set.

## Moving to another server

1. On the old server: `infra/scripts/install.sh backup`.
2. On the new server: clone the repository and copy the set folder into
   its `infra/backups/install/`.
3. Run `infra/scripts/install.sh restore infra/backups/install/<set>`.

The new server gets the same release, settings and data. Then point the domain or
your proxy at it. With `--proxy-network`, create that Docker network on the new
server first.
