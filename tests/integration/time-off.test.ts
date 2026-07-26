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

// public.time_off (0131) + its grants (0132): a person marks their own days off,
// a workspace admin may do it for anyone, and everyone in the workspace can read.

async function asAuthenticated<T>(
  client: PoolClient,
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
  await client.query("set local role authenticated");
  try {
    return await fn();
  } finally {
    await client.query("reset role");
  }
}

async function expectRejected(
  client: PoolClient,
  run: () => Promise<unknown>,
): Promise<string> {
  await client.query("savepoint guard_sp");
  let code = "";
  try {
    await run();
  } catch (error) {
    code = (error as { code?: string }).code ?? "unknown";
  }
  if (code) {
    await client.query("rollback to savepoint guard_sp");
  } else {
    await client.query("release savepoint guard_sp");
  }
  expect(code, "expected the statement to be rejected").not.toBe("");
  return code;
}

// The member-sync trigger creates one assignee per workspace member.
async function assigneeIdFor(
  client: PoolClient,
  workspaceId: string,
  userId: string,
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    "select id from public.assignees where workspace_id = $1 and user_id = $2",
    [workspaceId, userId],
  );
  expect(rows[0]?.id, "fixture must provide an assignee row").toBeTruthy();
  return rows[0].id;
}

async function withFixture<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withRollback(async (client) => {
    await loadFixture(client, "account-deletion.sql");
    return fn(client);
  });
}

describe("time_off (0131/0132)", () => {
  beforeAll(async () => {
    const pool = getTestPool();
    const client = await pool.connect();
    try {
      await assertCoreSchemaReady(client);
      const { rows } = await client.query<{ present: boolean }>(
        "select to_regclass('public.time_off') is not null as present",
      );
      if (!rows[0]?.present) {
        throw new Error("0131 not applied: public.time_off is missing");
      }
      // The overlap invariant is carried by the trigger on EVERY environment;
      // the EXCLUDE constraint only exists where btree_gist could be installed
      // (a superuser migration role), so it is deliberately NOT asserted here.
      const { rows: triggerRows } = await client.query<{ present: boolean }>(
        `select exists (
           select 1 from pg_trigger
           where tgrelid = 'public.time_off'::regclass
             and tgname = 'time_off_guard_overlap'
             and not tgisinternal
         ) as present`,
      );
      if (!triggerRows[0]?.present) {
        throw new Error("0131 not applied: the overlap trigger is missing");
      }
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await closeTestPool();
  });

  it("enables row level security with the four expected policies", async () => {
    await withRollback(async (client) => {
      const { rows: rls } = await client.query<{ relrowsecurity: boolean }>(
        "select relrowsecurity from pg_class where relname = 'time_off'",
      );
      expect(rls[0]?.relrowsecurity).toBe(true);

      const { rows: policies } = await client.query<{ policyname: string }>(
        "select policyname from pg_policies where tablename = 'time_off' order by policyname",
      );
      expect(policies.map((row) => row.policyname)).toEqual([
        "own or admin can create time off",
        "own or admin can delete time off",
        "own or admin can update time off",
        "workspace members can read time off",
      ]);
    });
  });

  it("grants the authenticated role table access", async () => {
    await withRollback(async (client) => {
      const { rows } = await client.query<{
        auth_select: boolean; auth_insert: boolean; auth_update: boolean; auth_delete: boolean;
      }>(`select
            has_table_privilege('authenticated','public.time_off','SELECT') as auth_select,
            has_table_privilege('authenticated','public.time_off','INSERT') as auth_insert,
            has_table_privilege('authenticated','public.time_off','UPDATE') as auth_update,
            has_table_privilege('authenticated','public.time_off','DELETE') as auth_delete`);
      // 0132 exists precisely because these are NOT automatic on testing/prod,
      // where the table is created by supabase_admin. Here (dev/CI, owner =
      // postgres) the Supabase default privileges would grant them anyway — and
      // they also hand anon the same set, which is why anon is NOT asserted:
      // that difference is a property of the stack, not of this feature.
      expect(rows[0].auth_select).toBe(true);
      expect(rows[0].auth_insert).toBe(true);
      expect(rows[0].auth_update).toBe(true);
      expect(rows[0].auth_delete).toBe(true);
    });
  });

  it("fills workspace_id from the assignee instead of trusting the client", async () => {
    await withFixture(async (client) => {
      const assigneeId = await assigneeIdFor(client, TEST_WORKSPACE_IDS.aliceSolo, TEST_USER_IDS.charlie);

      const { rows } = await client.query<{ workspace_id: string }>(
        `insert into public.time_off (workspace_id, assignee_id, start_date, end_date)
         values ($1, $2, date '2026-08-03', date '2026-08-07')
         returning workspace_id`,
        [TEST_WORKSPACE_IDS.davidAlone, assigneeId],
      );

      expect(rows[0].workspace_id).toBe(TEST_WORKSPACE_IDS.aliceSolo);
    });
  });

  it("rejects an inverted period and an overlapping one", async () => {
    await withFixture(async (client) => {
      const assigneeId = await assigneeIdFor(client, TEST_WORKSPACE_IDS.aliceSolo, TEST_USER_IDS.charlie);

      const inverted = await expectRejected(client, () => client.query(
        `insert into public.time_off (workspace_id, assignee_id, start_date, end_date)
         values ($1, $2, date '2026-09-10', date '2026-09-01')`,
        [TEST_WORKSPACE_IDS.aliceSolo, assigneeId],
      ));
      expect(inverted).toBe("23514");

      await client.query(
        `insert into public.time_off (workspace_id, assignee_id, start_date, end_date)
         values ($1, $2, date '2026-08-03', date '2026-08-07')`,
        [TEST_WORKSPACE_IDS.aliceSolo, assigneeId],
      );

      const overlap = await expectRejected(client, () => client.query(
        `insert into public.time_off (workspace_id, assignee_id, start_date, end_date)
         values ($1, $2, date '2026-08-05', date '2026-08-09')`,
        [TEST_WORKSPACE_IDS.aliceSolo, assigneeId],
      ));
      expect(overlap).toBe("23P01");

      // An adjacent day is not an overlap.
      await client.query(
        `insert into public.time_off (workspace_id, assignee_id, start_date, end_date)
         values ($1, $2, date '2026-08-08', date '2026-08-08')`,
        [TEST_WORKSPACE_IDS.aliceSolo, assigneeId],
      );
    });
  });

  it("lets a non-admin member mark only themselves", async () => {
    await withFixture(async (client) => {
      const charlie = await assigneeIdFor(client, TEST_WORKSPACE_IDS.aliceSolo, TEST_USER_IDS.charlie);
      const alice = await assigneeIdFor(client, TEST_WORKSPACE_IDS.aliceSolo, TEST_USER_IDS.alice);

      await asAuthenticated(client, TEST_USER_IDS.charlie, async () => {
        const { rows } = await client.query<{ id: string }>(
          `insert into public.time_off (workspace_id, assignee_id, start_date, end_date)
           values ($1, $2, date '2026-10-01', date '2026-10-03')
           returning id`,
          [TEST_WORKSPACE_IDS.aliceSolo, charlie],
        );
        expect(rows).toHaveLength(1);

        await expectRejected(client, () => client.query(
          `insert into public.time_off (workspace_id, assignee_id, start_date, end_date)
           values ($1, $2, date '2026-11-01', date '2026-11-02')`,
          [TEST_WORKSPACE_IDS.aliceSolo, alice],
        ));
      });
    });
  });

  it("lets a workspace admin mark anyone", async () => {
    await withFixture(async (client) => {
      const charlie = await assigneeIdFor(client, TEST_WORKSPACE_IDS.aliceSolo, TEST_USER_IDS.charlie);

      await asAuthenticated(client, TEST_USER_IDS.alice, async () => {
        const { rows } = await client.query<{ id: string }>(
          `insert into public.time_off (workspace_id, assignee_id, start_date, end_date)
           values ($1, $2, date '2026-12-01', date '2026-12-05')
           returning id`,
          [TEST_WORKSPACE_IDS.aliceSolo, charlie],
        );
        expect(rows).toHaveLength(1);
      });
    });
  });

  it("is readable by every member of the workspace but not by outsiders", async () => {
    await withFixture(async (client) => {
      const charlie = await assigneeIdFor(client, TEST_WORKSPACE_IDS.aliceSolo, TEST_USER_IDS.charlie);
      await client.query(
        `insert into public.time_off (workspace_id, assignee_id, start_date, end_date)
         values ($1, $2, date '2026-08-03', date '2026-08-07')`,
        [TEST_WORKSPACE_IDS.aliceSolo, charlie],
      );

      const visibleToAlice = await asAuthenticated(client, TEST_USER_IDS.alice, async () => {
        const { rows } = await client.query("select id from public.time_off");
        return rows.length;
      });
      expect(visibleToAlice).toBeGreaterThan(0);

      const visibleToOutsider = await asAuthenticated(client, TEST_USER_IDS.david, async () => {
        const { rows } = await client.query("select id from public.time_off");
        return rows.length;
      });
      expect(visibleToOutsider).toBe(0);
    });
  });

  it("does not let a member delete someone else's record", async () => {
    await withFixture(async (client) => {
      const alice = await assigneeIdFor(client, TEST_WORKSPACE_IDS.aliceSolo, TEST_USER_IDS.alice);
      const { rows: created } = await client.query<{ id: string }>(
        `insert into public.time_off (workspace_id, assignee_id, start_date, end_date)
         values ($1, $2, date '2026-08-03', date '2026-08-07')
         returning id`,
        [TEST_WORKSPACE_IDS.aliceSolo, alice],
      );

      // Charlie is an editor here, not an admin: RLS filters the row out and the
      // DELETE matches nothing (it does not raise).
      const deleted = await asAuthenticated(client, TEST_USER_IDS.charlie, async () => {
        const result = await client.query("delete from public.time_off where id = $1", [created[0].id]);
        return result.rowCount;
      });
      expect(deleted).toBe(0);
    });
  });
});
