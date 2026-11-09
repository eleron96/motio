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

// What the server settings switch on (all off by default): the role a group
// gave (0177), each person's heatmap share (0178), days off for the whole
// workspace (0179), the timeline density (0180). Every new column starts at
// the value that keeps Motio as it was.

const W1 = TEST_WORKSPACE_IDS.aliceSolo; // Alice admin (owner), Charlie editor
const W3 = TEST_WORKSPACE_IDS.davidAlone; // David alone

async function asAuthenticated<T>(client: PoolClient, userId: string, fn: () => Promise<T>): Promise<T> {
  await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
  await client.query("set local role authenticated");
  try {
    return await fn();
  } finally {
    await client.query("reset role");
  }
}

async function expectRejected(client: PoolClient, run: () => Promise<unknown>): Promise<string> {
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

async function withFixture<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withRollback(async (client) => {
    await loadFixture(client, "account-deletion.sql");
    return fn(client);
  });
}

describe("server-setting features in the database (0177–0180)", () => {
  beforeAll(async () => {
    const client = await getTestPool().connect();
    try {
      await assertCoreSchemaReady(client);
      const { rows } = await client.query<{ present: boolean }>(
        "select to_regclass('public.workspace_closures') is not null as present",
      );
      if (!rows[0]?.present) throw new Error("0179 not applied: workspace_closures is missing");
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await closeTestPool();
  });

  it("starts every new column at the value that keeps Motio as it was", async () => {
    await withFixture(async (client) => {
      const { rows: density } = await client.query<{ timeline_density: string }>(
        "select timeline_density from public.workspaces where id = $1",
        [W1],
      );
      expect(density[0].timeline_density).toBe("normal");

      const { rows: shares } = await client.query<{ capacity_percent: number }>(
        "select capacity_percent from public.assignees where workspace_id = $1",
        [W1],
      );
      expect(shares.length).toBeGreaterThan(0);
      expect(shares.every((row) => row.capacity_percent === 100)).toBe(true);
    });
  });

  it("accepts only known densities and shares within 0–100", async () => {
    await withFixture(async (client) => {
      await client.query("update public.workspaces set timeline_density = 'compact' where id = $1", [W1]);
      await expectRejected(client, () =>
        client.query("update public.workspaces set timeline_density = 'tiny' where id = $1", [W1]),
      );
      await expectRejected(client, () =>
        client.query("update public.assignees set capacity_percent = 120 where workspace_id = $1", [W1]),
      );
    });
  });

  it("lets only a workspace admin change a person's share", async () => {
    await withFixture(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        "select id from public.assignees where workspace_id = $1 limit 1",
        [W1],
      );
      const assigneeId = rows[0].id;
      // Charlie is an editor in W1: editors may write assignees, not the share.
      await asAuthenticated(client, TEST_USER_IDS.charlie, () =>
        expectRejected(client, () =>
          client.query("update public.assignees set capacity_percent = 0 where id = $1", [assigneeId]),
        ),
      );
      await asAuthenticated(client, TEST_USER_IDS.alice, () =>
        client.query("update public.assignees set capacity_percent = 50 where id = $1", [assigneeId]),
      );
      const { rows: after } = await client.query<{ capacity_percent: number }>(
        "select capacity_percent from public.assignees where id = $1",
        [assigneeId],
      );
      expect(after[0].capacity_percent).toBe(50);
    });
  });

  it("shows closures to members, lets only admins write them, nothing to anon", async () => {
    await withFixture(async (client) => {
      const { rows: grants } = await client.query<Record<string, boolean>>(`select
        has_table_privilege('anon', 'public.workspace_closures', 'SELECT') as anon_select,
        has_table_privilege('authenticated', 'public.workspace_closures', 'INSERT') as auth_insert`);
      expect(grants[0]).toEqual({ anon_select: false, auth_insert: true });

      await asAuthenticated(client, TEST_USER_IDS.alice, () =>
        client.query(
          "insert into public.workspace_closures (workspace_id, name, start_date, end_date) values ($1, 'Winter', '2026-12-24', '2026-12-31')",
          [W1],
        ),
      );
      const seen = await asAuthenticated(client, TEST_USER_IDS.charlie, async () => {
        const { rows } = await client.query<{ name: string }>(
          "select name from public.workspace_closures where workspace_id = $1",
          [W1],
        );
        return rows.map((row) => row.name);
      });
      expect(seen).toEqual(["Winter"]);

      await asAuthenticated(client, TEST_USER_IDS.charlie, () =>
        expectRejected(client, () =>
          client.query(
            "insert into public.workspace_closures (workspace_id, name, start_date, end_date) values ($1, 'Mine', '2026-12-01', '2026-12-02')",
            [W1],
          ),
        ),
      );
      // David is in no shared workspace with Alice: he sees nothing of W1.
      const outsider = await asAuthenticated(client, TEST_USER_IDS.david, async () => {
        const { rows } = await client.query("select id from public.workspace_closures where workspace_id = $1", [W1]);
        return rows.length;
      });
      expect(outsider).toBe(0);
      expect(W3).toBeTruthy();
    });
  });

  it("refuses closures that end before they start or last longer than a year", async () => {
    await withFixture(async (client) => {
      await expectRejected(client, () =>
        client.query(
          "insert into public.workspace_closures (workspace_id, name, start_date, end_date) values ($1, 'Back', '2026-12-31', '2026-12-24')",
          [W1],
        ),
      );
      await expectRejected(client, () =>
        client.query(
          "insert into public.workspace_closures (workspace_id, name, start_date, end_date) values ($1, 'Long', '2026-01-01', '2027-06-01')",
          [W1],
        ),
      );
    });
  });

  it("keeps the activity log away from clients and accepts only area.action names", async () => {
    await withFixture(async (client) => {
      const { rows } = await client.query<Record<string, boolean>>(`select
        has_table_privilege('authenticated', 'public.admin_audit_log', 'SELECT') as auth_select,
        has_table_privilege('anon', 'public.admin_audit_log', 'SELECT') as anon_select,
        has_table_privilege('service_role', 'public.admin_audit_log', 'INSERT') as service_insert,
        has_table_privilege('service_role', 'public.admin_audit_log', 'UPDATE') as service_update`);
      expect(rows[0]).toEqual({ auth_select: false, anon_select: false, service_insert: true, service_update: false });

      await client.query(
        "insert into public.admin_audit_log (action, details) values ('settings.update', '{\"key\":\"timeline.density\"}')",
      );
      await expectRejected(client, () =>
        client.query("insert into public.admin_audit_log (action) values ('drop table; --')"),
      );
    });
  });

  it("remembers the role a group gave, and only the three workspace roles", async () => {
    await withFixture(async (client) => {
      await client.query(
        "insert into public.group_workspace_grants (user_id, workspace_id, role) values ($1, $2, 'editor')",
        [TEST_USER_IDS.charlie, W1],
      );
      await expectRejected(client, () =>
        client.query(
          "insert into public.group_workspace_grants (user_id, workspace_id, role) values ($1, $2, 'owner')",
          [TEST_USER_IDS.david, W1],
        ),
      );
    });
  });
});
