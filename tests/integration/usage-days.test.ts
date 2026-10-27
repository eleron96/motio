import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  TEST_USER_IDS,
  assertCoreSchemaReady,
  closeTestPool,
  getTestPool,
  loadFixture,
  withRollback,
} from "../helpers/setup-test-db";

// user_usage_days + record_usage_day() (0154). The table holds who used which
// device and planner view per day; clients may only write their own row through
// the function and may never read the table back.

const RECORD = "select public.record_usage_day($1, $2, $3, $4, $5, $6)";

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

type UsageRow = {
  device: string;
  os: string;
  standalone: boolean;
  view_mode: string | null;
  planner_surface: string | null;
  group_mode: string | null;
  is_today: boolean;
};

async function rowsOf(client: PoolClient, userId: string): Promise<UsageRow[]> {
  const { rows } = await client.query<UsageRow>(
    `select device, os, standalone, view_mode, planner_surface, group_mode,
            day = (now() at time zone 'Europe/Moscow')::date as is_today
       from public.user_usage_days where user_id = $1 order by device`,
    [userId],
  );
  return rows;
}

async function withFixture<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withRollback(async (client) => {
    await loadFixture(client, "account-deletion.sql");
    return fn(client);
  });
}

describe("usage days (0154)", () => {
  beforeAll(async () => {
    const pool = getTestPool();
    const client = await pool.connect();
    try {
      await assertCoreSchemaReady(client);
      const { rows } = await client.query<{ present: boolean }>(
        "select to_regprocedure('public.record_usage_day(text, text, boolean, text, text, text)') is not null as present",
      );
      if (!rows[0]?.present) {
        throw new Error("0154 not applied: record_usage_day is missing");
      }
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await closeTestPool();
  });

  it("lets authenticated call the function but keeps the table closed to clients", async () => {
    await withRollback(async (client) => {
      const { rows } = await client.query<Record<string, boolean>>(`select
          has_function_privilege('authenticated','public.record_usage_day(text, text, boolean, text, text, text)','EXECUTE') as auth_exec,
          has_function_privilege('anon','public.record_usage_day(text, text, boolean, text, text, text)','EXECUTE') as anon_exec,
          has_function_privilege('public','public.record_usage_day(text, text, boolean, text, text, text)','EXECUTE') as public_exec,
          has_table_privilege('authenticated','public.user_usage_days','SELECT') as auth_select,
          has_table_privilege('authenticated','public.user_usage_days','INSERT') as auth_insert,
          has_table_privilege('anon','public.user_usage_days','SELECT') as anon_select`);

      expect(rows[0]).toEqual({
        auth_exec: true,
        anon_exec: false,
        public_exec: false,
        auth_select: false,
        auth_insert: false,
        anon_select: false,
      });
    });
  });

  it("records today's row for the caller and keeps the last view of the day", async () => {
    await withFixture(async (client) => {
      const alice = TEST_USER_IDS.alice;
      await asAuthenticated(client, alice, async () => {
        await client.query(RECORD, ["phone", "ios", true, "day", "timeline", "assignee"]);
        await client.query(RECORD, ["phone", "ios", false, "calendar", "board", "project"]);
        await client.query(RECORD, ["desktop", "macos", false, "week", "timeline", "assignee"]);
      });

      expect(await rowsOf(client, alice)).toEqual([
        { device: "desktop", os: "macos", standalone: false, view_mode: "week", planner_surface: "timeline", group_mode: "assignee", is_today: true },
        // standalone sticks once seen that day; the view is the latest one
        { device: "phone", os: "ios", standalone: true, view_mode: "calendar", planner_surface: "board", group_mode: "project", is_today: true },
      ]);
    });
  });

  it("rejects values outside the allowed set", async () => {
    await withFixture(async (client) => {
      const code = await asAuthenticated(client, TEST_USER_IDS.alice, () =>
        expectRejected(client, () => client.query(RECORD, ["smartwatch", "ios", false, "day", "timeline", "assignee"])),
      );
      expect(code).toBe("23514");
    });
  });

  it("refuses a caller without a session", async () => {
    await withFixture(async (client) => {
      await client.query(`select set_config('request.jwt.claim.sub', '', true)`);
      await client.query("set local role authenticated");
      await expectRejected(client, () => client.query(RECORD, ["phone", "ios", false, "day", "timeline", "assignee"]));
      await client.query("reset role");
    });
  });
});
