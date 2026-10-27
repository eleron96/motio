# Metabase (self-hosted BI)

Self-hosted Metabase instance for Motio product/business analytics.
Reads from the main prod Postgres (`infra-db-1`) via a dedicated read-only
role `metabase_ro` (BYPASSRLS, SELECT-only, `statement_timeout=60s`).

Exposed at `https://analytics.motio.nikog.net` behind Caddy.

## Components

- `metabase` — Metabase OSS v0.64, capped at 2 GB RAM / 1 vCPU (heap 1 GB; the JVM adds ~400 MB on top).
- `metabase-db` — Postgres 15-alpine for Metabase's own metadata
  (dashboards, users, cached query results). Capped at 256 MB.

## Networks

- `metabase-internal` — private: metabase ⇄ metabase-db.
- `motio-metabase` — external: Caddy reverse-proxies to `metabase:3000`.
- `infra_default` — external: Metabase connects to `infra-db-1` (main prod DB).

## One-time setup (prod)

```bash
# 1. Ensure docker network exists
docker network create motio-metabase || true

# 2. Copy compose + create env file with real secrets
cp .env.metabase.example .env.metabase
# Edit .env.metabase: set METABASE_APP_DB_PASSWORD

# 3. Start the stack
cd /opt/new_toggl/infra/metabase
docker compose --env-file .env.metabase up -d

# 4. Attach Caddy to motio-metabase network (so it can reach metabase:3000)
docker network connect motio-metabase motio-caddy

# 5. Add the analytics.motio.nikog.net block to Caddyfile, then reload:
docker exec motio-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

## First browser session

1. Open `https://analytics.motio.nikog.net`.
2. Complete Metabase onboarding: admin email + password (stored locally
   in `metabase-db`, not SSO — Metabase OSS has no OIDC support).
3. Add data source:
   - Type: PostgreSQL
   - Host: `db` (resolves on `infra_default`)
   - Port: `5432`
   - Database name: `postgres`
   - Username: `metabase_ro`
   - Password: (from your records; stored in Metabase metadata DB)
   - Advanced → "Use a secure connection (SSL)": off (same docker network)
   - Advanced → "Periodically refingerprint tables": off (low load)

## Query cache

In Admin → Caching: enable global caching with TTL = 24h. Schedule refreshes
2×/day (07:00 and 19:00 MSK) so the dashboard is fresh in the morning and
late-evening without hammering prod DB.

## Updates

The image tag is pinned in `docker-compose.yml`: bump it there (latest patch of
the target major), sync the file to the server, then:

```bash
cd /opt/new_toggl/infra/metabase
docker exec metabase-db pg_dump -U metabase -d metabase -Fc > /root/backups/metabase-$(date +%F).dump
docker compose --env-file .env.metabase pull
docker compose --env-file .env.metabase up -d
docker logs -f metabase   # wait for "Metabase Initialization COMPLETE"
```

Metabase auto-migrates its metadata schema on startup. Do not stop or restart
the container while migrations run — an interrupted migration can corrupt the
metadata DB. Rollback = restore the dump into `metabase-db` and start the old tag.

## Backup

`backup-service` (main stack) dumps `metabase-db` daily with the other
backups and uploads it to S3 under `metabase/` (90 newest kept, see
`METABASE_BACKUP_RETENTION_COUNT`). It reaches the DB as `metabase-db` on
`infra_default` and connects with `METABASE_DB_URL` from the **main** `.env`:

```bash
# one-time on the server: build the URL from .env.metabase (password URL-encoded)
postgresql://metabase:<METABASE_APP_DB_PASSWORD>@metabase-db:5432/metabase
```

Empty `METABASE_DB_URL` = not backed up (test stand, local).

Restore (dashboards come back as of the dump; stop Metabase so it does not
write meanwhile):

```bash
docker stop metabase
docker exec -i metabase-db pg_restore --clean --if-exists --no-owner \
  -U metabase -d metabase < backups/metabase-daily-<ts>.dump
docker start metabase
```

Restore into the **same or newer** Metabase version — it migrates an older
schema on boot but cannot downgrade a newer one.

Quick manual dump:

```bash
docker exec metabase-db pg_dump -U metabase -d metabase -Fc -f /tmp/mb.dump
docker cp metabase-db:/tmp/mb.dump ./mb-$(date +%F).dump
```
