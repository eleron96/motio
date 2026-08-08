# Operations

Running Motio locally, deploying to production and testing, releases, migrations, backups.

- [Local development](#local-development)
- [Production (local prod stack)](#production-local-prod-stack)
- [Remote deploy (production)](#remote-deploy-production)
- [Releases and versioning](#releases-and-versioning)
- [Testing stand](#testing-stand)
- [Migrations (Liquibase)](#migrations-liquibase)
- [Backup / Restore](#backup--restore)
- [Security checklist](#security-checklist)

See also: [Configuration](configuration.md) · [Architecture](architecture.md) · [Troubleshooting](troubleshooting.md)

---

## Local development

```bash
make up      # full local stack
make down    # stop
make logs    # follow logs
```

`make up`:

- creates/updates `.env`;
- generates `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `OAUTH2_PROXY_COOKIE_SECRET`;
- brings up `db`, `keycloak-db`, `keycloak`, `auth`, `rest`, `functions`, `gateway`,
  `web`, `oauth2-proxy` (`backup` / `realtime` / `storage` start only in `up-prod`);
- applies Liquibase migrations;
- calls `bootstrap.sync` to synchronize Keycloak ↔ Supabase.

### URLs

| Service | URL |
|---|---|
| App | http://localhost:5173 |
| Public landing | http://localhost:5173/ |
| Private app | http://localhost:5173/app |
| Keycloak | http://localhost:8081 |
| Supabase Gateway health | http://localhost:8080/health |
| Supabase Auth health | http://localhost:8080/auth/v1/health |
| Postgres | `localhost:54322` |

### Alternative mode — Supabase CLI

```bash
npm run dev:local
```

If the `supabase` CLI is not found, the script falls back to `dev-compose`. For full
parity with production behavior, use `make up`.

### npm scripts

```bash
npm run dev               # Vite dev server only
npm run dev:compose       # full dev stack via docker compose
npm run dev:local         # Supabase CLI mode (fallback → dev:compose)
npm run build
npm run lint
npm run typecheck         # tsc -p tsconfig.app.json --noEmit (CI gate)
npm run test              # unit + component
npm run test:watch
npm run test:integration  # DB integration suite (also gates CI)
npm run lingui:extract    # extract translatable strings
npm run lingui:compile    # compile .po → .js
```

To run the integration suite locally against the same database CI uses:

```bash
bash infra/scripts/ci-test-db.sh
npm run test:integration
```

---

## Production (local prod stack)

```bash
make up-prod
```

What `up-prod` does (in order):

- requires a fully populated `.env` (see [Configuration](configuration.md));
- validates the required invite-only variables;
- applies Keycloak realm settings via the `infra/scripts/keycloak-ensure-*.sh` scripts
  (client secret, client URLs, SSL-required, branding, frontend URL, session policy,
  brute-force protection, password policy, user profile);
- backs up `keycloak-db` before the realm audit (if `AUTO_KEYCLOAK_PRE_SYNC_BACKUP=true`);
- runs the Keycloak realm drift audit (audit-only by default);
- takes a pre-migration backup (if `AUTO_PRE_MIGRATION_BACKUP=true`);
- applies Liquibase migrations;
- bumps the patch version in `VERSION`, moves `Unreleased` into
  `CHANGELOG.md` / `CHANGELOG.en.md`, and appends an entry to `infra/releases.log`;
- builds the frontend image (`infra/web/Dockerfile`) and starts `web + oauth2-proxy`
  (if the build fails, the release artifacts are rolled back).

Related commands:

```bash
make down-prod
make logs-prod                # logs of the LOCAL prod stack
make keycloak-backup-db
make keycloak-audit-realm
make keycloak-export-realm
```

---

## Remote deploy (production)

```bash
make deploy                       # alias for deploy-remote
NEXT_VERSION=0.10.0 make deploy   # with an explicit version
```

`infra/scripts/deploy-remote.sh`:

1. **pre-deploy gate** — refuses to deploy a dirty working tree, then runs `lint`,
   `typecheck` and `test` (~1 min). It runs before the first rsync, so a failure
   leaves production untouched. Bypass for emergencies:
   `DEPLOY_SKIP_CHECKS=1 make deploy`;
2. rsyncs the local working tree to the server (`.env`, `notes/`, `dist/`,
   `node_modules/` etc. are excluded — the server `.env` is managed by hand over SSH);
3. runs `prod-compose.sh` on the server (migrations, Keycloak ensure scripts,
   frontend build — see `up-prod` above);
4. the version bump and changelog rotation happen **on the server**;
5. pulls the updated `VERSION`, `CHANGELOG.md`, `CHANGELOG.en.md` and
   `infra/releases.log` back into the local repo.

After a successful deploy, commit the synced release artifacts:

```bash
make release-sync
```

Post-deploy minimum: check that the app is reachable, the auth flow works
(sign-in/sign-out), and the server logs are clean:

```bash
ssh root@<prod-server> "cd /opt/new_toggl && docker compose -f infra/docker-compose.prod.yml --env-file .env logs --since 15m"
```

---

## Releases and versioning

- `VERSION` holds the current version; the patch part is bumped automatically on every
  production deploy (or set explicitly via `NEXT_VERSION=X.Y.Z`).
- The full release path in one command (changelog entry + commit + push + deploy + sync):

  ```bash
  make release MSG="fix(planner): ..." RU="..." EN="..." [TYPE=changed]
  ```

- Adding a changelog entry without deploying:

  ```bash
  make logchange RU="..." EN="..." [TYPE=changed]
  ```

- **GitHub Releases are published manually** after merging the working branch into
  `main`:

  ```bash
  make release-publish
  ```

  The command is idempotent and non-fatal: it tags every version, but creates a public
  GitHub Release only when the changelog section has real user-facing content.

---

## Testing stand

The testing environment is fully isolated from production.

| | Production | Testing |
|---|---|---|
| Deploy | `make deploy` | `make deploy-testing` |
| Compose script | `prod-compose.sh` | `test-compose.sh` |
| Caddy config | `Caddyfile` | `Caddyfile.testing` |
| Release | `make release` | `make release-testing` |

- `make deploy-testing` does **not** touch `VERSION`/changelogs and syncs nothing back.
- `deploy-testing.sh` hard-blocks deploying to the production server.
- A tracked release on testing:

  ```bash
  make release-testing MSG="feat(...): ..." RU="..." EN="..." [TYPE=changed] [NEXT_VERSION=X.Y.Z]
  ```

  Bumps `VERSION`, moves `Unreleased` into both changelogs, records history in
  `infra/testing-releases.log`, commits/pushes the artifacts, and runs
  `make deploy-testing` without touching production.
- The `.env` on the testing server is completely separate — all secrets are its own.

---

## Migrations (Liquibase)

- SQL files: `infra/supabase/migrations/*.sql`
- Master changelog: `infra/supabase/liquibase/changelog-master.xml`

Manual run:

```bash
docker compose -f infra/docker-compose.prod.yml --env-file .env run --rm migrate
```

**Adding a new migration:**

1. Create `infra/supabase/migrations/00xx_name.sql`.
2. Add a matching `changeSet` to `infra/supabase/liquibase/changelog-master.xml`
   (without it Liquibase will not apply the migration).
3. Run `migrate`.

Audit helper: `make audit-migrations`.

---

## Backup / Restore

`backup-service` under `/backup`:

| Method | Endpoint |
|---|---|
| `GET` | `/backup/backups` |
| `POST` | `/backup/backups` |
| `POST` | `/backup/backups/upload` *(binary, name in `x-backup-name`)* |
| `GET` | `/backup/backups/:name/download` |
| `PATCH` | `/backup/backups/:name` |
| `DELETE` | `/backup/backups/:name` |
| `POST` | `/backup/backups/:name/restore` |
| `POST` | `/backup/storage-backups` *(manual backup of Storage blobs; requires `STORAGE_BLOBS_DIR`, otherwise 501)* |

**Restore flow:**

1. creates a safety backup `pre-restore-*`;
2. runs `pg_restore` for the schemas in `BACKUP_SCHEMAS`;
3. restores grants for the `auth` role;
4. drops GoTrue's connections to the DB.

### Disaster recovery (restoring onto a clean server)

The standard restore assumes a database with a matching schema (the same server). On a
freshly initialized DB `pg_restore --clean --exit-on-error` fails, so before loading
the dump:

1. Drop the objects pre-created by the image and create empty schemas
   (`pg_restore --schema` does not create the schemas themselves):

   ```sql
   DROP SCHEMA IF EXISTS storage CASCADE;
   DROP SCHEMA IF EXISTS auth CASCADE;
   DROP SCHEMA IF EXISTS public CASCADE;
   CREATE SCHEMA public; CREATE SCHEMA auth; CREATE SCHEMA storage;
   ```

2. Create the missing roles that the dump GRANTs to:
   `CREATE ROLE metabase_ro NOLOGIN;`

3. Load the dump **without** `--clean`:

   ```bash
   pg_restore --single-transaction --exit-on-error --no-owner \
     --schema public --schema auth --schema storage \
     --dbname "$DB_URL" <file>.dump
   ```

4. Then follow steps 3–4 of the standard restore (`auth` grants, restart
   GoTrue/storage).

Verified against a copy of the production dump (June 2026): after preparation the dump
loads without errors, and a subsequent standard restore on top works too.

---

## In-app announcements

Two channels reach users: email (Admin → Broadcast) and a banner inside the
product. Pick per message — email for anything people should keep, a banner for
"here is what changed" that belongs where they already are.

Banners are written in Admin → Broadcast, with the channel switch set to the
in-app option. The form takes both locales, the level and the audience, and
either publishes straight away or keeps the text as a draft.

Below the form is the history, where every announcement carries its state —
draft, scheduled, live or finished — and a `⋯` menu:

- **Edit** — opens the announcement in its own dialog; the form above always
  means "new announcement". Editing does not reach people who already closed it.
- **Duplicate** — copies the wording into a new announcement, leaving the
  original alone.
- **Publish again** — sets a new window (a start date in the future schedules it)
  and offers to clear the dismissals, which is what brings the announcement back
  to people who have already closed it.
- **Show again to everyone** — clears the dismissals on their own.
- **Unpublish / Publish** — takes it off, or puts a draft up.
- **Delete** — removes the announcement and its delivery history.

The console's overview page carries a Messaging summary built from the same
data: which announcement is on screen for users right now, how many are
scheduled or still drafts, and where the last email broadcast got to.

Each person sees an announcement once: closing it writes a row into
`app_announcement_reads`, keyed by (announcement, user), so a banner dismissed on
the desktop stays dismissed on the phone. Nothing has to be cleaned up
afterwards — an expired `ends_at` simply stops the announcement.

The same thing can be done in SQL when the admin console is out of reach:

```sql
insert into public.app_announcements
  (title_ru, title_en, body_ru, body_en, level, audience_kind, ends_at, published, created_by)
values (
  'Мобильная версия обновилась',
  'The mobile app got a rebuild',
  'Разделы листаются свайпом, списки открываются сразу.',
  'Sections swipe sideways and the lists are right there.',
  'info',            -- 'info' draws a strip; 'critical' interrupts with a modal
  'all_active',      -- or 'domain' / 'workspace' with audience_value set
  now() + interval '14 days',
  true,
  (select id from auth.users where email = 'you@example.com')
);

-- pull one back before its window ends
update public.app_announcements set published = false where id = '<uuid>';

-- how it landed
select count(*) from public.app_announcement_reads where announcement_id = '<uuid>';

-- show it again to everyone who closed it
delete from public.app_announcement_reads where announcement_id = '<uuid>';
```

## Security checklist

Before going to production:

- rotate all dev secrets in `.env`;
- set strong passwords and cookie secrets;
- restrict CORS / origins;
- enable HTTPS and `OAUTH2_PROXY_COOKIE_SECURE=true`;
- restrict the backup endpoint with network rules;
- run `make check-prod-secrets` (the deploy is blocked if OIDC secrets are empty or
  use dev/default values).
