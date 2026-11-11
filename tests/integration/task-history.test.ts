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

// Task history (0183): the trigger on `tasks` writes one row per changed field,
// folds quick repeats by the same person, keeps no description text, and the
// app can only read the rows of its own workspaces.

const WORKSPACE_ID = TEST_WORKSPACE_IDS.aliceSolo;

interface HistoryRow {
  kind: string;
  actor_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
}

/** Runs as the given person with RLS bypassed: only the trigger is under test. */
async function actingAs<T>(client: PoolClient, actorId: string, action: () => Promise<T>): Promise<T> {
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [actorId]);
  try {
    return await action();
  } finally {
    await client.query("select set_config('request.jwt.claim.sub', '', true)");
  }
}

async function asAuthenticated<T>(client: PoolClient, userId: string, action: () => Promise<T>): Promise<T> {
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
  await client.query("set local role authenticated");
  try {
    return await action();
  } finally {
    await client.query("reset role");
    await client.query("select set_config('request.jwt.claim.sub', '', true)");
  }
}

async function createTask(client: PoolClient): Promise<string> {
  await loadFixture(client, "account-deletion.sql");
  const status = await client.query<{ id: string }>(
    "insert into public.statuses (workspace_id, name, color) values ($1, 'Open', '#94a3b8') returning id",
    [WORKSPACE_ID],
  );
  const type = await client.query<{ id: string }>(
    "insert into public.task_types (workspace_id, name) values ($1, 'Task') returning id",
    [WORKSPACE_ID],
  );
  const task = await client.query<{ id: string }>(
    `insert into public.tasks (workspace_id, title, start_date, end_date, status_id, type_id, description)
     values ($1, 'Prepare the offer', '2026-03-02', '2026-03-04', $2, $3, 'First draft') returning id`,
    [WORKSPACE_ID, status.rows[0].id, type.rows[0].id],
  );
  return task.rows[0].id;
}

async function history(client: PoolClient, taskId: string): Promise<HistoryRow[]> {
  const { rows } = await client.query<HistoryRow>(
    `select kind, actor_id, old_value, new_value from public.task_history
      where task_id = $1 order by created_at, kind`,
    [taskId],
  );
  return rows;
}

const moveTo = (client: PoolClient, taskId: string, start: string, end: string) =>
  client.query("update public.tasks set start_date = $2, end_date = $3 where id = $1", [taskId, start, end]);

describe("task history", () => {
  beforeAll(async () => {
    await assertCoreSchemaReady(getTestPool());
  });

  afterAll(async () => {
    await closeTestPool();
  });

  it("records a move with its dates and author, and nothing on creation", async () => {
    await withRollback(async (client) => {
      const taskId = await createTask(client);
      expect(await history(client, taskId)).toEqual([]);

      await actingAs(client, TEST_USER_IDS.alice, () => moveTo(client, taskId, "2026-03-09", "2026-03-11"));

      expect(await history(client, taskId)).toEqual([
        {
          kind: "dates",
          actor_id: TEST_USER_IDS.alice,
          old_value: { start: "2026-03-02", end: "2026-03-04" },
          new_value: { start: "2026-03-09", end: "2026-03-11" },
        },
      ]);
    });
  });

  it("folds quick repeats by one person and drops a move that was taken back", async () => {
    await withRollback(async (client) => {
      const taskId = await createTask(client);

      await actingAs(client, TEST_USER_IDS.alice, async () => {
        await moveTo(client, taskId, "2026-03-09", "2026-03-11");
        await moveTo(client, taskId, "2026-03-16", "2026-03-18");
      });
      const folded = await history(client, taskId);
      expect(folded).toHaveLength(1);
      expect(folded[0].old_value).toEqual({ start: "2026-03-02", end: "2026-03-04" });
      expect(folded[0].new_value).toEqual({ start: "2026-03-16", end: "2026-03-18" });

      await actingAs(client, TEST_USER_IDS.alice, () => moveTo(client, taskId, "2026-03-02", "2026-03-04"));
      expect(await history(client, taskId)).toEqual([]);
    });
  });

  it("keeps separate rows for another person and for a later edit", async () => {
    await withRollback(async (client) => {
      const taskId = await createTask(client);

      await actingAs(client, TEST_USER_IDS.alice, () => moveTo(client, taskId, "2026-03-09", "2026-03-11"));
      await actingAs(client, TEST_USER_IDS.bob, () => moveTo(client, taskId, "2026-03-10", "2026-03-12"));
      expect((await history(client, taskId)).map((row) => row.actor_id).sort()).toEqual(
        [TEST_USER_IDS.alice, TEST_USER_IDS.bob].sort(),
      );

      await client.query(
        "update public.task_history set created_at = now() - interval '10 minutes' where task_id = $1",
        [taskId],
      );
      await actingAs(client, TEST_USER_IDS.bob, () => moveTo(client, taskId, "2026-03-17", "2026-03-19"));
      expect(await history(client, taskId)).toHaveLength(3);
    });
  });

  it("says the description was edited without keeping its text", async () => {
    await withRollback(async (client) => {
      const taskId = await createTask(client);

      await actingAs(client, TEST_USER_IDS.alice, () =>
        client.query("update public.tasks set description = 'Second draft, confidential' where id = $1", [taskId]));

      const rows = await history(client, taskId);
      expect(rows.map((row) => row.kind)).toEqual(["description"]);
      expect(JSON.stringify(rows)).not.toContain("draft");
    });
  });

  it("records a rename and ignores fields it does not track", async () => {
    await withRollback(async (client) => {
      const taskId = await createTask(client);

      await actingAs(client, TEST_USER_IDS.alice, async () => {
        await client.query("update public.tasks set priority = 'high' where id = $1", [taskId]);
        await client.query("update public.tasks set title = 'Send the offer' where id = $1", [taskId]);
      });

      expect(await history(client, taskId)).toEqual([
        {
          kind: "title",
          actor_id: TEST_USER_IDS.alice,
          old_value: { v: "Prepare the offer" },
          new_value: { v: "Send the offer" },
        },
      ]);
    });
  });

  it("drops rows older than a year the next time the task changes", async () => {
    await withRollback(async (client) => {
      const taskId = await createTask(client);

      await actingAs(client, TEST_USER_IDS.alice, () => moveTo(client, taskId, "2026-03-09", "2026-03-11"));
      await client.query(
        "update public.task_history set created_at = now() - interval '13 months' where task_id = $1",
        [taskId],
      );
      await actingAs(client, TEST_USER_IDS.alice, () =>
        client.query("update public.tasks set title = 'Send the offer' where id = $1", [taskId]));

      expect((await history(client, taskId)).map((row) => row.kind)).toEqual(["title"]);
    });
  });

  it("purges every row past a year, also for tasks nobody touched since", async () => {
    await withRollback(async (client) => {
      const taskId = await createTask(client);
      await actingAs(client, TEST_USER_IDS.alice, async () => {
        await moveTo(client, taskId, "2026-03-09", "2026-03-11");
        await client.query("update public.tasks set title = 'Send the offer' where id = $1", [taskId]);
      });
      await client.query(
        "update public.task_history set created_at = now() - interval '13 months' where task_id = $1 and kind = 'dates'",
        [taskId],
      );

      await client.query("set local role service_role");
      const { rows } = await client.query<{ removed: number }>("select public.purge_task_history() as removed");
      await client.query("reset role");

      expect(rows[0].removed).toBe(1);
      expect((await history(client, taskId)).map((row) => row.kind)).toEqual(["title"]);

      await client.query("savepoint purge_attempt");
      await client.query("set local role authenticated");
      await expect(client.query("select public.purge_task_history()")).rejects.toThrow(/permission denied/);
      await client.query("rollback to savepoint purge_attempt");
    });
  });

  it("lets a member read the rows and nobody write them", async () => {
    await withRollback(async (client) => {
      const taskId = await createTask(client);
      await actingAs(client, TEST_USER_IDS.alice, () => moveTo(client, taskId, "2026-03-09", "2026-03-11"));

      const count = (userId: string) =>
        asAuthenticated(client, userId, async () => {
          const { rows } = await client.query<{ n: number }>(
            "select count(*)::int as n from public.task_history where task_id = $1",
            [taskId],
          );
          return rows[0].n;
        });
      expect(await count(TEST_USER_IDS.alice)).toBe(1);
      expect(await count(TEST_USER_IDS.david)).toBe(0);

      for (const statement of [
        "delete from public.task_history",
        "update public.task_history set kind = 'title'",
        `insert into public.task_history (workspace_id, task_id, kind) values ('${WORKSPACE_ID}', '${taskId}', 'title')`,
      ]) {
        // The failed statement aborts the transaction; rolling back to the
        // savepoint also undoes the role and claim set after it.
        await client.query("savepoint write_attempt");
        await client.query("select set_config('request.jwt.claim.sub', $1, true)", [TEST_USER_IDS.alice]);
        await client.query("set local role authenticated");
        await expect(client.query(statement)).rejects.toThrow(/permission denied/);
        await client.query("rollback to savepoint write_attempt");
      }
    });
  });
});
