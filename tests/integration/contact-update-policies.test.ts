import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  TEST_USER_IDS,
  TEST_WORKSPACE_IDS,
  assertCoreSchemaReady,
  closeTestPool,
  getTestPool,
  loadFixture,
  withRollback,
} from "../helpers/setup-test-db";

// Set the JWT claim auth.uid() reads. Transaction-local so it survives a role
// switch and is rolled back with the surrounding transaction.
async function actAs(client: PoolClient, userId: string): Promise<void> {
  await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
}

// Run `fn` while the connection acts as the PostgREST `authenticated` role so
// that RLS policies and column guards are actually enforced (the default
// `postgres` test role is a superuser/table-owner and bypasses RLS).
async function asAuthenticated<T>(
  client: PoolClient,
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  await actAs(client, userId);
  await client.query("set local role authenticated");
  try {
    return await fn();
  } finally {
    await client.query("reset role");
  }
}

// Assert a statement is rejected by RLS WITHOUT poisoning the surrounding
// transaction: wrap it in a savepoint and roll back to it.
async function expectRejected(
  client: PoolClient,
  run: () => Promise<unknown>,
): Promise<void> {
  await client.query("savepoint guard_sp");
  let threw = false;
  try {
    await run();
  } catch {
    threw = true;
  }
  if (threw) {
    await client.query("rollback to savepoint guard_sp");
  } else {
    await client.query("release savepoint guard_sp");
  }
  expect(threw, "expected the statement to be rejected").toBe(true);
}

// Charlie is an editor in W1 (aliceSolo) and not a member of W3 (davidAlone).
// Moving a row into W3 was already blocked before 0109 (with WITH CHECK
// omitted, PostgreSQL applies USING to new rows too); these tests pin that
// invariant now that 0109 spells the WITH CHECK out explicitly.
const HOME_WS = TEST_WORKSPACE_IDS.aliceSolo;
const FOREIGN_WS = TEST_WORKSPACE_IDS.davidAlone;
const EDITOR = TEST_USER_IDS.charlie;

const SEED_IDS = {
  customer: "44444444-4444-4444-4444-000000000001",
  contact: "44444444-4444-4444-4444-000000000002",
  project: "44444444-4444-4444-4444-000000000003",
  member: "44444444-4444-4444-4444-000000000004",
  activity: "44444444-4444-4444-4444-000000000005",
} as const;

// Seed one row per contact table in W1, as the superuser (bypasses RLS).
async function seedContactRows(client: PoolClient): Promise<void> {
  await client.query(
    `insert into public.customers (id, workspace_id, name) values ($1, $2, 'Fixture Customer')`,
    [SEED_IDS.customer, HOME_WS],
  );
  await client.query(
    `insert into public.customer_contacts (id, workspace_id, customer_id, name)
     values ($1, $2, $3, 'Fixture Contact')`,
    [SEED_IDS.contact, HOME_WS, SEED_IDS.customer],
  );
  await client.query(
    `insert into public.projects (id, workspace_id, name, color) values ($1, $2, 'Fixture Project', '#888888')`,
    [SEED_IDS.project, HOME_WS],
  );
  await client.query(
    `insert into public.project_members (id, workspace_id, project_id, external_name)
     values ($1, $2, $3, 'Fixture External')`,
    [SEED_IDS.member, HOME_WS, SEED_IDS.project],
  );
  await client.query(
    `insert into public.project_activity (id, workspace_id, project_id, author_display_name, content)
     values ($1, $2, $3, 'Fixture Author', 'note')`,
    [SEED_IDS.activity, HOME_WS, SEED_IDS.project],
  );
}

async function withFixture<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withRollback(async (client) => {
    await loadFixture(client, "account-deletion.sql");
    await seedContactRows(client);
    return fn(client);
  });
}

interface HijackCase {
  table: string;
  rowId: string;
  contentColumn: string;
}

const CASES: HijackCase[] = [
  { table: "customers", rowId: SEED_IDS.customer, contentColumn: "name" },
  { table: "customer_contacts", rowId: SEED_IDS.contact, contentColumn: "name" },
  { table: "project_members", rowId: SEED_IDS.member, contentColumn: "role" },
  { table: "project_activity", rowId: SEED_IDS.activity, contentColumn: "content" },
];

describe("Contact tables — UPDATE policies get WITH CHECK (0109)", () => {
  beforeAll(async () => {
    const client = await getTestPool().connect();
    try {
      await assertCoreSchemaReady(client);
      const { rows } = await client.query<{ missing: string }>(
        `select tablename as missing from pg_policies
          where schemaname = 'public'
            and tablename in ('customers', 'customer_contacts', 'project_members', 'project_activity')
            and cmd = 'UPDATE'
            and with_check is null`,
      );
      if (rows.length > 0) {
        throw new Error(
          `0109 not applied (UPDATE policies without WITH CHECK on: ${rows.map((r) => r.missing).join(", ")})`,
        );
      }
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await closeTestPool();
  });

  it("authenticated role has the full table grant on customers", async () => {
    await withRollback(async (client) => {
      // has_table_privilege with a comma list ORs the privileges, so check
      // each one separately and AND them.
      const { rows } = await client.query<{ ok: boolean }>(
        `select bool_and(has_table_privilege('authenticated', 'public.customers', p)) as ok
           from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as p`,
      );
      expect(rows[0].ok).toBe(true);
    });
  });

  it("no other UPDATE policy in public is left without WITH CHECK (profiles is the known PK-guarded exception)", async () => {
    await withRollback(async (client) => {
      const { rows } = await client.query<{ tablename: string; policyname: string }>(
        `select tablename, policyname from pg_policies
          where schemaname = 'public' and cmd = 'UPDATE' and with_check is null
            and not (tablename = 'profiles' and policyname = 'profile owner can update')`,
      );
      expect(rows).toEqual([]);
    });
  });

  for (const { table, rowId, contentColumn } of CASES) {
    describe(table, () => {
      it("editor CANNOT move a row into a workspace he does not control", async () => {
        await withFixture(async (client) => {
          await asAuthenticated(client, EDITOR, async () => {
            await expectRejected(client, () =>
              client.query(
                `update public.${table} set workspace_id = $1 where id = $2`,
                [FOREIGN_WS, rowId],
              ),
            );
          });

          const { rows } = await client.query<{ workspace_id: string }>(
            `select workspace_id from public.${table} where id = $1`,
            [rowId],
          );
          expect(rows[0].workspace_id).toBe(HOME_WS);
        });
      });

      it("editor can still update content fields (policy does not over-restrict)", async () => {
        await withFixture(async (client) => {
          await asAuthenticated(client, EDITOR, async () => {
            const { rowCount } = await client.query(
              `update public.${table} set ${contentColumn} = 'updated by editor' where id = $1`,
              [rowId],
            );
            expect(rowCount).toBe(1);
          });

          const { rows } = await client.query<Record<string, string>>(
            `select ${contentColumn} from public.${table} where id = $1`,
            [rowId],
          );
          expect(rows[0][contentColumn]).toBe("updated by editor");
        });
      });
    });
  }
});
