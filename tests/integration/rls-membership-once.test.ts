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

// 0165: the "workspace members can read …" policies check membership once per
// query (workspace_id in (select current_user_workspace_ids())) instead of
// calling is_workspace_member() for every row. The meaning must not change:
// a row is readable iff the caller is a member of its workspace. These tests
// pin that down table by table, user by user.

// table -> the column holding the workspace id
const READ_POLICY_TABLES: Record<string, string> = {
  assignees: "workspace_id",
  customer_contacts: "workspace_id",
  customers: "workspace_id",
  member_groups: "workspace_id",
  milestones: "workspace_id",
  project_activity: "workspace_id",
  project_members: "workspace_id",
  projects: "workspace_id",
  statuses: "workspace_id",
  tags: "workspace_id",
  task_comments: "workspace_id",
  task_subtasks: "workspace_id",
  task_types: "workspace_id",
  tasks: "workspace_id",
  time_off: "workspace_id",
  workspace_dashboards: "workspace_id",
  workspaces: "id",
};
const TABLES = Object.keys(READ_POLICY_TABLES);

const W1 = TEST_WORKSPACE_IDS.aliceSolo; // Alice admin, Charlie editor
const W2 = TEST_WORKSPACE_IDS.bobShared; // Bob admin, Charlie admin
const W3 = TEST_WORKSPACE_IDS.davidAlone; // David admin
const OWNERS: Record<string, string> = {
  [W1]: TEST_USER_IDS.alice,
  [W2]: TEST_USER_IDS.bob,
  [W3]: TEST_USER_IDS.david,
};
// Memberships from the account-deletion fixture.
const MEMBERSHIPS: Record<string, string[]> = {
  [TEST_USER_IDS.alice]: [W1],
  [TEST_USER_IDS.bob]: [W2],
  [TEST_USER_IDS.charlie]: [W1, W2],
  [TEST_USER_IDS.david]: [W3],
};

async function asUser<T>(client: PoolClient, userId: string | null, fn: () => Promise<T>): Promise<T> {
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
  await client.query(userId ? "set local role authenticated" : "set local role anon");
  const result = await fn();
  await client.query("reset role");
  return result;
}

// One row in every table for a workspace (as its owner, so triggers that read
// auth.uid() see a member). The member-sync trigger has already created the
// assignees; time_off uses the owner's one.
async function seedWorkspace(client: PoolClient, workspaceId: string): Promise<void> {
  const owner = OWNERS[workspaceId];
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [owner]);
  const one = async (sql: string, params: unknown[]) => (await client.query<{ id: string }>(sql, params)).rows[0]?.id;

  const statusId = await one(
    "insert into public.statuses (workspace_id, name, color) values ($1, 'RLS open', '#94a3b8') returning id",
    [workspaceId],
  );
  const typeId = await one("insert into public.task_types (workspace_id, name) values ($1, 'RLS type') returning id", [workspaceId]);
  const projectId = await one(
    "insert into public.projects (workspace_id, name, color) values ($1, 'RLS project', '#2563eb') returning id",
    [workspaceId],
  );
  const customerId = await one("insert into public.customers (workspace_id, name) values ($1, 'Север') returning id", [workspaceId]);
  await one(
    "insert into public.customer_contacts (workspace_id, name, customer_id) values ($1, 'Анна', $2) returning id",
    [workspaceId, customerId],
  );
  await one("insert into public.member_groups (workspace_id, name) values ($1, 'RLS group') returning id", [workspaceId]);
  await one("insert into public.tags (workspace_id, name, color) values ($1, 'RLS tag', '#111111') returning id", [workspaceId]);
  await one(
    "insert into public.milestones (workspace_id, project_id, date, title) values ($1, $2, date '2026-09-01', 'RLS milestone') returning id",
    [workspaceId, projectId],
  );
  await one(
    `insert into public.project_activity (workspace_id, project_id, author_id, author_display_name, content)
     values ($1, $2, $3, 'Анна', 'RLS note') returning id`,
    [workspaceId, projectId, owner],
  );
  await one(
    "insert into public.project_members (workspace_id, project_id, external_name) values ($1, $2, 'Борис') returning id",
    [workspaceId, projectId],
  );
  const taskId = await one(
    `insert into public.tasks (workspace_id, title, start_date, end_date, status_id, type_id)
     values ($1, 'RLS task', date '2026-09-01', date '2026-09-02', $2, $3) returning id`,
    [workspaceId, statusId, typeId],
  );
  await one("insert into public.task_subtasks (workspace_id, task_id, title) values ($1, $2, 'RLS subtask') returning id", [workspaceId, taskId]);
  await one(
    `insert into public.task_comments (workspace_id, task_id, author_id, author_display_name_snapshot, content)
     values ($1, $2, $3, 'Анна', 'RLS comment') returning id`,
    [workspaceId, taskId, owner],
  );
  const assigneeId = await one("select id from public.assignees where workspace_id = $1 and user_id = $2", [workspaceId, owner]);
  await one(
    `insert into public.time_off (workspace_id, assignee_id, start_date, end_date)
     values ($1, $2, date '2026-09-10', date '2026-09-11') returning id`,
    [workspaceId, assigneeId],
  );
  await one("insert into public.workspace_dashboards (workspace_id) values ($1) returning id", [workspaceId]);
}

async function seedAll(client: PoolClient) {
  await loadFixture(client, "account-deletion.sql");
  for (const workspaceId of [W1, W2, W3]) await seedWorkspace(client, workspaceId);
}

// What the caller sees under RLS, by workspace.
async function visibleWorkspaces(client: PoolClient, userId: string | null, table: string): Promise<string[]> {
  const column = READ_POLICY_TABLES[table];
  return asUser(client, userId, async () => {
    const { rows } = await client.query<{ ws: string }>(
      `select distinct ${column}::text as ws from public.${table} where ${column} = any($1::uuid[]) order by 1`,
      [[W1, W2, W3]],
    );
    return rows.map((row) => row.ws);
  });
}

describe("read policies check membership once per query (0165)", () => {
  beforeAll(async () => {
    const client = await getTestPool().connect();
    try {
      await assertCoreSchemaReady(client);
      const { rows } = await client.query<{ present: boolean }>(
        "select to_regprocedure('public.current_user_workspace_ids()') is not null as present",
      );
      if (!rows[0]?.present) throw new Error("0165 not applied: current_user_workspace_ids is missing");
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await closeTestPool();
  });

  it("switches all 17 read policies to the once-per-query check and leaves workspace_members alone", async () => {
    await withRollback(async (client) => {
      const { rows } = await client.query<{ tablename: string; qual: string }>(
        `select tablename, qual from pg_policies
         where schemaname = 'public' and cmd = 'SELECT'
           and policyname like 'workspace members can read%'
           and tablename = any($1::text[])`,
        [TABLES],
      );
      expect(rows.map((row) => row.tablename).sort()).toEqual([...TABLES].sort());
      for (const row of rows) {
        expect(row.qual, row.tablename).toContain("current_user_workspace_ids()");
        expect(row.qual, row.tablename).not.toContain("is_workspace_member");
      }

      // workspace_members keeps the per-row check: the new function reads it.
      const { rows: members } = await client.query<{ qual: string }>(
        `select qual from pg_policies
         where schemaname = 'public' and tablename = 'workspace_members' and cmd = 'SELECT'`,
      );
      expect(members.map((row) => row.qual)).toContain("is_workspace_member(workspace_id)");
    });
  });

  it("returns exactly the caller's workspaces, and nothing for anon", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      for (const [userId, expected] of Object.entries(MEMBERSHIPS)) {
        const ids = await asUser(client, userId, async () => (
          (await client.query<{ id: string }>("select public.current_user_workspace_ids()::text as id order by 1")).rows.map((r) => r.id)
        ));
        expect(ids, userId).toEqual([...expected].sort());
      }
      const anon = await asUser(client, null, async () => (
        (await client.query("select public.current_user_workspace_ids()")).rows
      ));
      expect(anon).toEqual([]);
    });
  });

  it("shows every member exactly the rows of their own workspaces, in every table", async () => {
    await withRollback(async (client) => {
      await seedAll(client);
      const mismatches: string[] = [];
      for (const table of TABLES) {
        for (const [userId, memberships] of Object.entries(MEMBERSHIPS)) {
          const seen = await visibleWorkspaces(client, userId, table);
          const expected = [...memberships].sort();
          if (JSON.stringify(seen) !== JSON.stringify(expected)) {
            mismatches.push(`${table} as ${userId}: saw ${seen.join(",") || "nothing"}, expected ${expected.join(",")}`);
          }
        }
      }
      expect(mismatches).toEqual([]);
    });
  });

  it("matches the old per-row check row for row", async () => {
    await withRollback(async (client) => {
      await seedAll(client);
      for (const table of TABLES) {
        const column = READ_POLICY_TABLES[table];
        for (const userId of Object.keys(MEMBERSHIPS)) {
          const viaPolicy = await asUser(client, userId, async () => (
            (await client.query<{ n: string }>(`select count(*) as n from public.${table}`)).rows[0].n
          ));
          // The old expression, evaluated without RLS for the same caller.
          await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
          const { rows } = await client.query<{ n: string }>(
            `select count(*) as n from public.${table} where public.is_workspace_member(${column})`,
          );
          expect(viaPolicy, `${table} as ${userId}`).toBe(rows[0].n);
        }
      }
    });
  });

  it("shows anon nothing and raises no error where anon may read the table", async () => {
    await withRollback(async (client) => {
      await seedAll(client);
      for (const table of TABLES) {
        const { rows: priv } = await client.query<{ allowed: boolean }>(
          "select has_table_privilege('anon', $1, 'select') as allowed",
          [`public.${table}`],
        );
        if (!priv[0]?.allowed) continue; // no table grant: unchanged by 0165
        expect(await visibleWorkspaces(client, null, table), table).toEqual([]);
      }
    });
  });

  it("lets a viewer read, and drops access the moment the membership is gone", async () => {
    await withRollback(async (client) => {
      await seedAll(client);
      const viewer = TEST_USER_IDS.david;
      await client.query(
        "insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, 'viewer')",
        [W2, viewer],
      );
      for (const table of TABLES) {
        expect(await visibleWorkspaces(client, viewer, table), table).toEqual([W2, W3].sort());
      }

      await client.query("delete from public.workspace_members where workspace_id = $1 and user_id = $2", [W2, TEST_USER_IDS.charlie]);
      for (const table of TABLES) {
        expect(await visibleWorkspaces(client, TEST_USER_IDS.charlie, table), table).toEqual([W1]);
      }
    });
  });

  it("evaluates membership once in the timeline query plan", async () => {
    await withRollback(async (client) => {
      await seedAll(client);
      const plan = await asUser(client, TEST_USER_IDS.bob, async () => {
        const { rows } = await client.query<{ "QUERY PLAN": unknown }>(
          `explain (format json, costs off)
           select id from public.tasks
           where workspace_id = $1 and end_date >= date '2026-06-01' and start_date <= date '2026-12-01'`,
          [W2],
        );
        return JSON.stringify(rows[0]["QUERY PLAN"]);
      });
      // The membership set is computed once and hashed, not called per row.
      expect(plan).not.toContain("is_workspace_member");
      expect(plan).toContain("hashed SubPlan");
    });
  });

  it("keeps writes guarded by role: a viewer still cannot edit a task", async () => {
    await withRollback(async (client) => {
      await seedAll(client);
      await client.query(
        "insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, 'viewer')",
        [W2, TEST_USER_IDS.david],
      );
      const updated = await asUser(client, TEST_USER_IDS.david, async () => (
        (await client.query("update public.tasks set title = 'hacked' where workspace_id = $1 returning id", [W2])).rowCount
      ));
      expect(updated).toBe(0);

      const byEditor = await asUser(client, TEST_USER_IDS.bob, async () => (
        (await client.query("update public.tasks set title = 'renamed' where workspace_id = $1 returning id", [W2])).rowCount
      ));
      expect(byEditor).toBe(1);
    });
  });
});
