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

const W1 = TEST_WORKSPACE_IDS.aliceSolo;
const W2 = TEST_WORKSPACE_IDS.bobShared;

interface Catalogs {
  workspaceId: string;
  statusId: string;
  typeId: string;
}

interface SearchRow {
  id: string;
  title: string;
  matched_subtask_title: string | null;
}

async function asUser<T>(client: PoolClient, userId: string, action: () => Promise<T>): Promise<T> {
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
  await client.query("set local role authenticated");
  try {
    return await action();
  } finally {
    await client.query("reset role");
    await client.query("select set_config('request.jwt.claim.sub', '', true)");
  }
}

async function catalogs(client: PoolClient, workspaceId = W1): Promise<Catalogs> {
  const status = await client.query<{ id: string }>(
    "insert into public.statuses (workspace_id, name, color) values ($1, 'Open', '#94a3b8') returning id",
    [workspaceId],
  );
  const type = await client.query<{ id: string }>(
    "insert into public.task_types (workspace_id, name) values ($1, 'Task') returning id",
    [workspaceId],
  );
  return { workspaceId, statusId: status.rows[0].id, typeId: type.rows[0].id };
}

async function createTask(
  client: PoolClient,
  context: Catalogs,
  title: string,
  date = "2030-01-01",
  description = "",
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `insert into public.tasks (workspace_id, title, start_date, end_date, status_id, type_id, description)
     values ($1, $2, $3, $3, $4, $5, $6) returning id`,
    [context.workspaceId, title, date, context.statusId, context.typeId, description],
  );
  return rows[0].id;
}

async function createSubtask(
  client: PoolClient,
  context: Catalogs,
  taskId: string,
  title: string,
  position = 0,
  id: string | null = null,
): Promise<void> {
  await client.query(
    `insert into public.task_subtasks (workspace_id, task_id, title, position, id)
     values ($1, $2, $3, $4, coalesce($5::uuid, gen_random_uuid()))`,
    [context.workspaceId, taskId, title, position, id],
  );
}

async function search(
  client: PoolClient,
  query: string | null,
  workspaceId = W1,
  userId = TEST_USER_IDS.alice,
): Promise<SearchRow[]> {
  return asUser(client, userId, async () => (
    await client.query<SearchRow>("select * from public.search_workspace_tasks($1, $2)", [workspaceId, query])
  ).rows);
}

describe("Workspace task and subtask search (0173)", () => {
  beforeAll(async () => {
    const client = await getTestPool().connect();
    try {
      await assertCoreSchemaReady(client);
      await client.query("select * from public.search_workspace_tasks(null, null)");
    } finally {
      client.release();
    }
  });

  afterAll(closeTestPool);

  it("returns parent tasks for title and subtask matches on any date without searching or returning descriptions", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const context = await catalogs(client);
      const direct = await createTask(client, context, "Review the offer", "2035-03-01");
      const parent = await createTask(client, context, "Prepare the drawings", "2010-01-01");
      await createSubtask(client, context, parent, "Review the dimensions");
      await createTask(client, context, "Unrelated", "2020-01-01", "Review only in description");

      const rows = await search(client, "review");

      expect(rows.map((row) => row.id)).toEqual([parent, direct]);
      expect(rows.map((row) => row.matched_subtask_title)).toEqual(["Review the dimensions", null]);
      rows.forEach((row) => expect(row).not.toHaveProperty("description"));
    });
  });

  it("returns one parent and the first matching subtask by position then id, even when the parent matches too", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const context = await catalogs(client);
      const parent = await createTask(client, context, "Needle parent");
      await createSubtask(client, context, parent, "Needle late", 2);
      await createSubtask(client, context, parent, "Needle second", 1, "44444444-4444-4444-4444-000000000002");
      await createSubtask(client, context, parent, "Needle first", 1, "44444444-4444-4444-4444-000000000001");

      const rows = await search(client, "needle");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: parent, matched_subtask_title: "Needle first" });
    });
  });

  it("applies the 200 limit to unique parents rather than matching subtasks", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const context = await catalogs(client);
      await client.query(
        `insert into public.tasks (id, workspace_id, title, start_date, end_date, status_id, type_id)
         select ('33333333-3333-3333-3333-' || lpad(n::text, 12, '0'))::uuid,
           $1, 'Parent ' || n, date '2030-01-01', date '2030-01-01', $2, $3
         from generate_series(1, 205) n`,
        [W1, context.statusId, context.typeId],
      );
      await client.query(
        `insert into public.task_subtasks (workspace_id, task_id, title, position)
         select $1, id, 'Needle', 0 from public.tasks where workspace_id = $1`,
        [W1],
      );
      await client.query(
        `insert into public.task_subtasks (workspace_id, task_id, title, position)
         select $1, '33333333-3333-3333-3333-000000000001'::uuid, 'Needle duplicate ' || n, n
         from generate_series(1, 300) n`,
        [W1],
      );

      const rows = await search(client, "needle");
      expect(rows).toHaveLength(200);
      expect(new Set(rows.map((row) => row.id)).size).toBe(200);
      expect(rows[0].id).toBe("33333333-3333-3333-3333-000000000001");
      expect(rows[199].id).toBe("33333333-3333-3333-3333-000000000200");
    });
  });

  it("folds case and е/ё for both titles and normalizes the query's whitespace", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const context = await catalogs(client);
      const direct = await createTask(client, context, "СВЕРИТЬ РАСЧЁТ", "2030-01-01");
      const parent = await createTask(client, context, "Смета", "2030-01-02");
      await createSubtask(client, context, parent, "Проверить расчет");

      expect((await search(client, "РАСЧЕТ")).map((row) => row.id)).toEqual([direct, parent]);
      expect((await search(client, "расчёт")).map((row) => row.id)).toEqual([direct, parent]);
      expect((await search(client, "\ufeff\u00a0Сверить\t\nРАСЧЕТ\u3000")).map((row) => row.id)).toEqual([direct]);
    });
  });

  it("treats percent, underscore and backslash as literal characters", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const context = await catalogs(client);
      const percent = await createTask(client, context, "100% ready");
      await createTask(client, context, "100x ready");
      const underscore = await createTask(client, context, "Parent");
      await createSubtask(client, context, underscore, "a_b");
      const other = await createTask(client, context, "Other");
      await createSubtask(client, context, other, "axb");
      const slash = await createTask(client, context, "x\\y");
      await createTask(client, context, "xy");

      expect((await search(client, "% ready")).map((row) => row.id)).toEqual([percent]);
      expect((await search(client, "a_")).map((row) => row.id)).toEqual([underscore]);
      expect((await search(client, "\\y")).map((row) => row.id)).toEqual([slash]);
    });
  });

  it("rejects queries shorter than two characters after normalization even when called directly", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const context = await catalogs(client);
      const parent = await createTask(client, context, "Abc");
      await createSubtask(client, context, parent, "Abc");

      for (const query of [null, "", "  ", " a ", "\u00a0\n\ufeff"]) {
        expect(await search(client, query), String(query)).toEqual([]);
      }
    });
  });

  it("scopes both tasks and subtasks to the requested workspace, including for a member of both", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const first = await catalogs(client, W1);
      const second = await catalogs(client, W2);
      const firstId = await createTask(client, first, "Needle first");
      const secondId = await createTask(client, second, "Second parent");
      await createSubtask(client, second, secondId, "Needle second");

      expect((await search(client, "needle", W1, TEST_USER_IDS.charlie)).map((row) => row.id)).toEqual([firstId]);
      expect((await search(client, "needle", W2, TEST_USER_IDS.charlie)).map((row) => row.id)).toEqual([secondId]);
      expect(await search(client, "needle", W2, TEST_USER_IDS.alice)).toEqual([]);
      expect(await search(client, "needle", W1, TEST_USER_IDS.david)).toEqual([]);
    });
  });

  it("allows a viewer to search and removes access as soon as membership ends", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const context = await catalogs(client);
      const parent = await createTask(client, context, "Parent");
      await createSubtask(client, context, parent, "Needle");
      await client.query(
        "insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, 'viewer')",
        [W1, TEST_USER_IDS.david],
      );

      expect((await search(client, "needle", W1, TEST_USER_IDS.david)).map((row) => row.id)).toEqual([parent]);
      await client.query("delete from public.workspace_members where workspace_id = $1 and user_id = $2", [W1, TEST_USER_IDS.david]);
      expect(await search(client, "needle", W1, TEST_USER_IDS.david)).toEqual([]);
    });
  });

  it("runs as invoker, grants only authenticated/service_role, and denies anonymous RPC calls", async () => {
    await withRollback(async (client) => {
      const { rows } = await client.query<{
        definer: boolean; authenticated: boolean; service_role: boolean; anon: boolean;
      }>(
        `select p.prosecdef as definer,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
           has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role,
           has_function_privilege('anon', p.oid, 'EXECUTE') as anon
         from pg_proc p where p.oid = 'public.search_workspace_tasks(uuid,text)'::regprocedure`,
      );
      expect(rows).toEqual([{ definer: false, authenticated: true, service_role: true, anon: false }]);

      await client.query("set local role anon");
      await client.query("savepoint denied_rpc");
      let code: string | undefined;
      try {
        await client.query("select * from public.search_workspace_tasks($1, 'needle')", [W1]);
      } catch (error) {
        code = (error as { code?: string }).code;
        await client.query("rollback to savepoint denied_rpc");
      }
      await client.query("reset role");
      expect(code).toBe("42501");
    });
  });
});
