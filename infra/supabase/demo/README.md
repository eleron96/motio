# Motio demo backend

Self-hosted demo sandbox backend. Two deployment shapes are supported.

## A. Self-hosted alongside an existing Supabase stack (recommended)

Docker-compose now includes a `demo` profile that adds three small
sidecar services next to the existing Supabase stack:

- `demo-auth` — separate GoTrue with anonymous sign-ins enabled.
- `demo-rest` — separate PostgREST.
- `demo-gateway` — small nginx exposing only `/auth/v1` and `/rest/v1`.
- `demo-janitor` — periodic worker (every 2 min) that calls
  `cleanup_demo_sessions()` to reap idle anon users.

These all point at a separate logical database (`motio_demo` by default)
inside the existing `supabase-db` Postgres process. RLS, FK and queries
are scoped per-database, so demo data cannot leak into prod data even
though the Postgres process is shared. Skipping realtime/storage/
functions saves ~600 MB compared to a parallel full stack.

Bring it up:

```sh
# 1. Add to .env (next to the existing prod values):
#    DEMO_DB_NAME=motio_demo
#    DEMO_API_EXTERNAL_URL=https://YOUR-DOMAIN/demo-supabase
#    DEMO_GOTRUE_DB_URL=postgres://USER:PASS@db:5432/motio_demo?search_path=auth
#    DEMO_PGRST_DB_URI=postgres://USER:PASS@db:5432/motio_demo
#    VITE_SUPABASE_URL_DEMO=https://YOUR-DOMAIN/demo-supabase
#    VITE_SUPABASE_ANON_KEY_DEMO=${VITE_SUPABASE_ANON_KEY}  # reused — same JWT_SECRET
#
# 2. Initialise the demo database (idempotent on (1), refuses non-empty DBs):
./infra/scripts/init-demo-db.sh

# 3. Bring up the demo profile:
docker compose --profile demo \
  -f infra/docker-compose.prod.yml \
  -f infra/docker-compose.testing.yml \
  --env-file .env up -d \
  demo-auth demo-rest demo-gateway demo-janitor

# 4. Add a Caddy route — already in Caddyfile.testing:
#    handle_path /demo-supabase/* { reverse_proxy demo-gateway:8080 }
```

The frontend's `supabase` client Proxy automatically targets the demo
URL when the URL pathname starts with `/demo`.

## B. External Supabase project (cloud or another self-hosted instance)

If you'd rather isolate by physical infrastructure, point the env at
any Supabase project:

```sh
DATABASE_URL='postgresql://postgres:PASSWORD@db.example.supabase.co:5432/postgres' \
  ./infra/scripts/setup-demo-supabase.sh
```

Then set `VITE_SUPABASE_URL_DEMO` / `VITE_SUPABASE_ANON_KEY_DEMO` to the
external project's URL and anon key, enable Anonymous sign-ins in its
Auth → Providers settings, and the demo flow works end-to-end.

## Apply order

1. Apply every prod migration from `infra/supabase/migrations/0001..N.sql`
   to the demo database. This is what `init-demo-db.sh` (option A) and
   `setup-demo-supabase.sh` (option B) automate.
2. Apply this folder's files in numeric order:
   - `0001_demo_anonymous_profiles.sql` — let `handle_new_user` accept
     anon sign-ins (anon `auth.users` rows have no email).
   - `0002_demo_template_schema.sql` — `demo_template.*` tables that
     hold the universal seed content used to bootstrap each visitor's
     workspace.
   - `0003_demo_template_seed.sql` — actual seed rows. Dates stored as
     **relative** offsets in days from "today"; resolved at copy time.
   - `0004_demo_runtime_rpcs.sql` — `seed_demo_workspace`,
     `demo_heartbeat`, `reset_demo_workspace`. Called from the frontend.
   - `0005_demo_cleanup_cron.sql` — `cleanup_demo_sessions()` function
     called every 2 min by `demo-janitor` (option A) or by `pg_cron`
     scheduled separately (option B).
   - `0006_demo_override_ensure_initial.sql` — replace the prod
     `ensure_initial_workspace` RPC body so that authStore's existing
     "no workspaces yet" branch routes through `seed_demo_workspace`.

## Frontend wiring

- Set `VITE_SUPABASE_URL_DEMO` / `VITE_SUPABASE_ANON_KEY_DEMO` in the
  build env. The frontend's `supabase` proxy in
  [src/shared/lib/supabaseClient.ts](../../../src/shared/lib/supabaseClient.ts)
  picks the demo client whenever the URL starts with `/demo`.

## Why a separate database (and not a demo schema in prod)?

Per-database isolation: RLS, FK and queries are scoped per database,
so demo data cannot bleed into prod. Even when the Postgres process is
shared (option A), one database doesn't see the other without explicit
`dblink`. A bug in demo SQL can't touch prod rows.
