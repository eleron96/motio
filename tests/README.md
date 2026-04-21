# Integration tests

Tests that talk to a real Postgres (Supabase) instance. Kept separate from
unit tests in `src/test/` which run in jsdom without a DB.

## Requirements

- Local Supabase DB running on `localhost:54322` (started via `make up`).
- All migrations applied up to at least the highest number used by the tests
  you are running.

## Running

```bash
npm run test:integration           # run all
npm run test:integration -- --watch
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
    phase0-smoke.test.ts  # verifies helper + fixtures plumbing works
```

## Isolation

Tests use `withRollback(fn)` to wrap everything in a transaction that is
rolled back after `fn` returns. Nothing leaks between tests.

Connect as the `postgres` superuser so RLS does not interfere. Tests that
verify RLS behaviour should set the role explicitly inside the transaction.
