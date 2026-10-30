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

// Pictures on a subtask (0159): `task_subtasks.images` holds task-media
// references `{ id, token }`, at most 10, writable by the same editors who may
// write the subtask, and findable by id for media GC.

const WORKSPACE_ID = TEST_WORKSPACE_IDS.aliceSolo;
const MEDIA_ID = "33333333-3333-3333-3333-000000000001";

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

async function createSubtask(client: PoolClient): Promise<string> {
  const { rows: statusRows } = await client.query<{ id: string }>(
    "insert into public.statuses (workspace_id, name, color) values ($1, 'Open', '#94a3b8') returning id",
    [WORKSPACE_ID],
  );
  const { rows: typeRows } = await client.query<{ id: string }>(
    "insert into public.task_types (workspace_id, name) values ($1, 'Task') returning id",
    [WORKSPACE_ID],
  );
  const { rows: taskRows } = await client.query<{ id: string }>(
    `insert into public.tasks (workspace_id, title, start_date, end_date, status_id, type_id)
     values ($1, 'Fix the stairs', current_date, current_date, $2, $3) returning id`,
    [WORKSPACE_ID, statusRows[0].id, typeRows[0].id],
  );
  const { rows } = await client.query<{ id: string }>(
    `insert into public.task_subtasks (workspace_id, task_id, title) values ($1, $2, 'Photo of the crack') returning id`,
    [WORKSPACE_ID, taskRows[0].id],
  );
  return rows[0].id;
}

async function errorCodeOf(client: PoolClient, sql: string, params: unknown[]): Promise<string> {
  await client.query("savepoint attempt");
  try {
    await client.query(sql, params);
    await client.query("release savepoint attempt");
    return "";
  } catch (error) {
    await client.query("rollback to savepoint attempt");
    return (error as { code?: string }).code ?? "unknown";
  }
}

describe("Subtask images (0159)", () => {
  beforeAll(async () => {
    const pool = getTestPool();
    const client = await pool.connect();
    try {
      await assertCoreSchemaReady(client);
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await closeTestPool();
  });

  it("starts empty and lets an editor attach a picture reference", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const subtaskId = await createSubtask(client);

      const { rows: before } = await client.query<{ images: unknown }>(
        "select images from public.task_subtasks where id = $1",
        [subtaskId],
      );
      expect(before[0].images).toEqual([]);

      const images = JSON.stringify([{ id: MEDIA_ID, token: "t1" }]);
      await asAuthenticated(client, TEST_USER_IDS.charlie, async () => {
        const { rowCount } = await client.query(
          "update public.task_subtasks set images = $2::jsonb where id = $1",
          [subtaskId, images],
        );
        expect(rowCount).toBe(1);
      });

      // Media GC finds it by id alone, without knowing the token.
      const { rows: found } = await client.query<{ id: string }>(
        "select id from public.task_subtasks where workspace_id = $1 and images @> $2::jsonb",
        [WORKSPACE_ID, JSON.stringify([{ id: MEDIA_ID }])],
      );
      expect(found.map((row) => row.id)).toEqual([subtaskId]);
    });
  });

  it("rejects malformed references and more than ten pictures", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const subtaskId = await createSubtask(client);
      const update = "update public.task_subtasks set images = $2::jsonb where id = $1";

      expect(await errorCodeOf(client, update, [subtaskId, '{"id":"x","token":"y"}'])).toBe("23514");
      expect(await errorCodeOf(client, update, [subtaskId, '[{"id":"x"}]'])).toBe("23514");
      expect(await errorCodeOf(client, update, [subtaskId, '["https://example.com/a.png"]'])).toBe("23514");
      const eleven = JSON.stringify(Array.from({ length: 11 }, (_, index) => ({ id: `m${index}`, token: "t" })));
      expect(await errorCodeOf(client, update, [subtaskId, eleven])).toBe("23514");
      const ten = JSON.stringify(Array.from({ length: 10 }, (_, index) => ({ id: `m${index}`, token: "t" })));
      expect(await errorCodeOf(client, update, [subtaskId, ten])).toBe("");
    });
  });

  it("an outsider can neither see nor change a subtask's pictures", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const subtaskId = await createSubtask(client);
      const images = JSON.stringify([{ id: MEDIA_ID, token: "t1" }]);

      await asAuthenticated(client, TEST_USER_IDS.david, async () => {
        const { rows } = await client.query("select images from public.task_subtasks where id = $1", [subtaskId]);
        expect(rows).toHaveLength(0);
        const { rowCount } = await client.query(
          "update public.task_subtasks set images = $2::jsonb where id = $1",
          [subtaskId, images],
        );
        expect(rowCount).toBe(0);
      });
    });
  });
});
