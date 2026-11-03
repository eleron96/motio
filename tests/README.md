# Integration tests

Tests that talk to a real Postgres (Supabase) instance: RLS policies, RPCs,
triggers and the SQL helpers the backup-service cron jobs call. Kept separate
from the unit tests in `src/test/`, which run in jsdom without a DB, and from the
backup-service's own tests next to its code (`infra/backup-service/*.test.js`,
`npm run test:backup`). CI runs them in the `integration-tests` job on every push.

## Requirements

A Supabase-schema Postgres on `localhost:54322` with every migration applied.
The script CI uses builds exactly that (database, GoTrue and storage-api
schemas, then all Liquibase migrations):

```bash
bash infra/scripts/ci-test-db.sh
```

## Running

```bash
npm run test:integration         # run all
npm run test:integration:watch   # re-run on change
```

## Environment variables

Defaults match the dev-compose setup; override only if you run the DB elsewhere:

| Var                | Default     |
|--------------------|-------------|
| `TEST_DB_HOST`     | `localhost` |
| `TEST_DB_PORT`     | `54322`     |
| `TEST_DB_NAME`     | `postgres`  |
| `TEST_DB_USER`     | `postgres`  |
| `TEST_DB_PASSWORD` | `postgres`  |

## Layout

```
tests/
  helpers/
    setup-test-db.ts      # pg pool, transaction isolation, schema checks
  fixtures/
    account-deletion.sql  # users/workspaces/membership for deletion tests
  integration/
    db-harness-smoke.test.ts               # helper + fixture plumbing works
    account-deletion-schema.test.ts        # 0069-0073: statuses, events, exports
    account-deletion-rpc.test.ts           # 0074: preview, request, cancel, data export
    account-deletion-purge-export-rpc.test.ts  # 0075: purge and export helpers
    account-deletion-cron-rpc.test.ts      # 0076: cron and health-check helpers
    access-control.test.ts, workspace-delete.test.ts, time-off.test.ts,
    notification-bursts.test.ts, … # one file per feature's DB contract
```

Name a new file after the feature whose DB contract it checks.

## Isolation

Tests use `withRollback(fn)` to wrap everything in a transaction that is
rolled back after `fn` returns. Nothing leaks between tests.

Connect as the `postgres` superuser so RLS does not interfere. Tests that
verify RLS behaviour should set the role explicitly inside the transaction.
