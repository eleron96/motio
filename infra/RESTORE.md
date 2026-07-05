# Disaster recovery runbook

How to bring Motio back from S3 backups onto a fresh server — **all** data, not
just the database.

> ⚠️ **Status: mechanics verified, full run not yet rehearsed.**
> The storage and Keycloak restore steps below are backed by scripts whose
> core commands are unit-tested (tar round-trip; `pg_dump -Fc` → `pg_restore`).
> The **database** restore path is already rehearsed in production (June 2026).
> What is **not** yet measured is an end-to-end, from-zero recovery and its RTO
> — see [§10 Rehearsal](#10-rehearsal). Do that once before you have to rely on it.

This file is safe to commit: it contains **no secrets**, only variable names.

---

## 1. What's covered

| Data family | Backup (in S3 bucket) | Restore |
| --- | --- | --- |
| **Supabase DB** — app data + GoTrue `auth` schema | `{daily,manual}-<ts>.dump` (custom-format `pg_dump`, schemas `public,auth,storage`) | existing path — [§4](#4-restore-the-database) |
| **Storage blobs** — avatars, task-media files | `storage-<ts>.tar.gz` | `infra/scripts/restore-storage.sh` — [§6](#6-restore-storage-blobs) |
| **Keycloak** — logins, passwords, realm | `keycloak/keycloak-daily-<ts>.dump` (custom-format `pg_dump`) | `infra/scripts/restore-keycloak.sh` — [§5](#5-restore-keycloak-logins) |

"Logins" live in **two** places: GoTrue accounts ride along inside the Supabase
DB dump, but the real password store is **Keycloak** — restore both.

**Not in S3 / recreated from config, not backups:** the compose stack itself,
and the out-of-compose containers **Caddy** (TLS ingress), **Beszel**, **Metabase**
— see §7.

---

## 2. Prerequisites on the new host

1. Docker + Docker Compose installed and running.
2. This repo checked out at the deployed tag/commit (`git clone …`, then
   `git checkout <VERSION>`).
3. **`.env` restored** from your secret store into the repo root. This is the
   single source of every secret — DR is impossible without it. Verify with
   `infra/scripts/check-prod-secrets.sh .env`.
4. S3 credentials available (they're in `.env`: `S3_ENDPOINT`, `S3_REGION`,
   `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`).

---

## 3. Pull the latest backups from S3

Flat bucket layout; Keycloak dumps live under `keycloak/`. Grab the newest of
each family into `./backups/` (create it first: `mkdir -p backups`).

```sh
# Example with the AWS CLI (any S3 client works — rclone, s5cmd, mc):
export AWS_ACCESS_KEY_ID=…      # = S3_ACCESS_KEY
export AWS_SECRET_ACCESS_KEY=…  # = S3_SECRET_KEY
S3=s3://$S3_BUCKET

# newest DB dump, storage archive, keycloak dump:
aws s3 ls  $S3/               --endpoint-url "$S3_ENDPOINT" | grep '\.dump$'    | sort | tail -1
aws s3 ls  $S3/               --endpoint-url "$S3_ENDPOINT" | grep '\.tar\.gz$' | sort | tail -1
aws s3 ls  $S3/keycloak/      --endpoint-url "$S3_ENDPOINT"                      | sort | tail -1

aws s3 cp  $S3/<daily-….dump>            backups/  --endpoint-url "$S3_ENDPOINT"
aws s3 cp  $S3/<storage-….tar.gz>        backups/  --endpoint-url "$S3_ENDPOINT"
aws s3 cp  $S3/keycloak/<keycloak-….dump> backups/ --endpoint-url "$S3_ENDPOINT"
```

---

## 4. Restore the database

The Supabase DB volume is declared `external: true`, so **create it before the
first `up`** or the stack won't start:

```sh
docker volume create supabase_db_data
```

Bring up just the databases:

```sh
CF=infra/docker-compose.prod.yml
docker compose -f $CF --env-file .env up -d db keycloak-db
```

Restore the DB dump. Two options:

- **Preferred — the rehearsed path:** once `db` and `backup` are up, trigger the
  backup service's restore (`POST /backups/:name/restore`). It also re-grants the
  `auth` schema to the API role and nudges GoTrue to reconnect. See the DB
  restore notes in `README.md`.
- **Fallback — fully manual** (mirrors the service's flags), run inside the db
  container:

  ```sh
  docker compose -f $CF --env-file .env exec -T db \
    pg_restore --clean --if-exists --single-transaction --exit-on-error --no-owner \
    --schema=public --schema=auth --schema=storage \
    --dbname "$SUPABASE_DB_URL" < backups/<daily-….dump>
  ```

  Then re-grant the `auth` schema to the API role (`$BACKUP_AUTH_DB_USER`, e.g.
  `authenticator`): `GRANT USAGE ON SCHEMA auth …; GRANT … ON ALL TABLES IN
  SCHEMA auth …;` (see `restoreBackup()` in `infra/backup-service/index.js` for
  the exact grants).

---

## 5. Restore Keycloak (logins)

With `keycloak-db` up, restore the dump. The script stops the Keycloak app,
runs `pg_restore --clean` inside `keycloak-db`, snapshots the current DB first,
then starts Keycloak again:

```sh
infra/scripts/restore-keycloak.sh backups/<keycloak-….dump>
```

> Restore into a Keycloak image of the **same or newer** version — Keycloak runs
> its own schema migration on boot and can upgrade an older dump, but not
> downgrade a newer one. Give it ~30–60 s to migrate before testing login.

---

## 6. Restore storage blobs

Bring the stack up far enough that the storage volume exists (it's created by
the first `up`), then extract the archive into it. The script snapshots the
current volume first and clears it before extracting, so the restore is
authoritative and reversible:

```sh
infra/scripts/restore-storage.sh backups/<storage-….tar.gz>
```

---

## 7. Bring up the rest & out-of-compose containers

```sh
docker compose -f $CF --env-file .env up -d \
  auth rest realtime functions backup storage gateway web oauth2-proxy
docker compose -f $CF --env-file .env run --rm migrate   # apply any pending migrations
```

Then recreate the containers that live **outside** this compose file:

- **Caddy** — the TLS ingress. Nothing serves HTTPS until it's back. Restore its
  `Caddyfile` + data volume and `docker run` it on the shared network (see
  `infra/caddy/` and `infra/scripts/ensure-caddy-network-access.sh`).
- **Metabase** — analytics. See `infra/metabase/README.md`.
- **Beszel** — host monitoring agent.

---

## 8. Smoke test

- [ ] `https://<domain>/` loads (Caddy + web + gateway path OK)
- [ ] Log in — exercises Keycloak → GoTrue → app (proves §4 + §5)
- [ ] Open a task with an image/attachment — proves §6 (storage blobs)
- [ ] Timeline shows real tasks — proves §4 (app data)
- [ ] Trigger a manual backup (`POST /backups`) — proves the backup loop is alive

---

## 9. Rollback safety nets

Each restore script writes a pre-restore snapshot into `./backups/` before
touching anything:

- `keycloak-prerestore-<ts>.dump` → re-run `restore-keycloak.sh` with it.
- `storage-prerestore-<ts>.tar.gz` → re-run `restore-storage.sh` with it.

The DB restore endpoint likewise takes a `pre-restore-<ts>.dump` first.

---

## 10. Rehearsal

The point of this file is to be **proven**, not just written. Once, on the test
stand (or a throwaway VM), do a from-zero run and record the wall-clock time (RTO):

1. Fresh host, empty volumes. Restore `.env`.
2. Walk §2 → §8 using the **latest real S3 backups**.
3. Note every step that needed improvisation and fix it here.
4. Record total time and the state of each smoke-test item.

Until this has been done at least once, treat full-machine recovery as
**untested** — the individual mechanics work, the end-to-end assembly is what
the rehearsal validates.
