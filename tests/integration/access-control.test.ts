import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  TEST_USER_IDS,
  TEST_WORKSPACE_IDS,
  assertCoreSchemaReady,
  assertPhase1SchemaReady,
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

// Assert a statement is rejected by RLS / a trigger WITHOUT poisoning the
// surrounding transaction: wrap it in a savepoint and roll back to it.
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

async function withFixture<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withRollback(async (client) => {
    await loadFixture(client, "account-deletion.sql");
    return fn(client);
  });
}

describe("Access control — ownership lock & transfer (0093)", () => {
  beforeAll(async () => {
    const client = await getTestPool().connect();
    try {
      await assertCoreSchemaReady(client);
      await assertPhase1SchemaReady(client);
      // sanity: migration 0093 loaded
      const { rowCount } = await client.query(
        `select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'transfer_workspace_ownership'`,
      );
      if (!rowCount) throw new Error("0093 not applied (transfer_workspace_ownership missing)");
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await closeTestPool();
  });

  // ────────────── owner_id immutability ──────────────

  describe("owner_id immutability", () => {
    it("non-owner admin CANNOT seize owner_id via a direct UPDATE", async () => {
      await withFixture(async (client) => {
        // bobShared: owner = Bob, members Bob (admin) + Charlie (admin).
        // Charlie is a non-owner admin — the attacker.
        await asAuthenticated(client, TEST_USER_IDS.charlie, async () => {
          await expectRejected(client, () =>
            client.query(
              `update public.workspaces set owner_id = $1 where id = $2`,
              [TEST_USER_IDS.charlie, TEST_WORKSPACE_IDS.bobShared],
            ),
          );
        });

        const { rows } = await client.query<{ owner_id: string }>(
          `select owner_id from public.workspaces where id = $1`,
          [TEST_WORKSPACE_IDS.bobShared],
        );
        expect(rows[0].owner_id).toBe(TEST_USER_IDS.bob);
      });
    });

    it("admin can still rename the workspace (guard does not over-restrict)", async () => {
      await withFixture(async (client) => {
        await asAuthenticated(client, TEST_USER_IDS.charlie, async () => {
          await client.query(
            `update public.workspaces set name = $1 where id = $2`,
            ["Renamed By Charlie", TEST_WORKSPACE_IDS.bobShared],
          );
        });

        const { rows } = await client.query<{ name: string }>(
          `select name from public.workspaces where id = $1`,
          [TEST_WORKSPACE_IDS.bobShared],
        );
        expect(rows[0].name).toBe("Renamed By Charlie");
      });
    });
  });

  // ────────────── transfer_workspace_ownership ──────────────

  describe("transfer_workspace_ownership", () => {
    it("owner can transfer ownership; the heir is promoted to admin", async () => {
      await withFixture(async (client) => {
        // aliceSolo: owner = Alice (admin), Charlie is editor there.
        // Call as the `authenticated` role to also exercise the EXECUTE grant
        // and the realistic PostgREST call path.
        await asAuthenticated(client, TEST_USER_IDS.alice, async () => {
          await client.query(`select public.transfer_workspace_ownership($1, $2)`, [
            TEST_WORKSPACE_IDS.aliceSolo,
            TEST_USER_IDS.charlie,
          ]);
        });

        const owner = await client.query<{ owner_id: string }>(
          `select owner_id from public.workspaces where id = $1`,
          [TEST_WORKSPACE_IDS.aliceSolo],
        );
        expect(owner.rows[0].owner_id).toBe(TEST_USER_IDS.charlie);

        const role = await client.query<{ role: string }>(
          `select role from public.workspace_members where workspace_id = $1 and user_id = $2`,
          [TEST_WORKSPACE_IDS.aliceSolo, TEST_USER_IDS.charlie],
        );
        expect(role.rows[0].role).toBe("admin");
      });
    });

    it("a non-owner cannot transfer ownership", async () => {
      await withFixture(async (client) => {
        // Charlie is an editor (not owner) of aliceSolo.
        await actAs(client, TEST_USER_IDS.charlie);
        await expectRejected(client, () =>
          client.query(`select public.transfer_workspace_ownership($1, $2)`, [
            TEST_WORKSPACE_IDS.aliceSolo,
            TEST_USER_IDS.charlie,
          ]),
        );

        const { rows } = await client.query<{ owner_id: string }>(
          `select owner_id from public.workspaces where id = $1`,
          [TEST_WORKSPACE_IDS.aliceSolo],
        );
        expect(rows[0].owner_id).toBe(TEST_USER_IDS.alice);
      });
    });

    it("cannot transfer to a non-member", async () => {
      await withFixture(async (client) => {
        // David is not a member of bobShared.
        await actAs(client, TEST_USER_IDS.bob);
        await expectRejected(client, () =>
          client.query(`select public.transfer_workspace_ownership($1, $2)`, [
            TEST_WORKSPACE_IDS.bobShared,
            TEST_USER_IDS.david,
          ]),
        );

        const { rows } = await client.query<{ owner_id: string }>(
          `select owner_id from public.workspaces where id = $1`,
          [TEST_WORKSPACE_IDS.bobShared],
        );
        expect(rows[0].owner_id).toBe(TEST_USER_IDS.bob);
      });
    });
  });
});
