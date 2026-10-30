import { createHash } from "node:crypto";
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

// A teammate sees a deleted comment go (0161), and a description save never
// overwrites a teammate's newer text (0162).

const WORKSPACE_ID = TEST_WORKSPACE_IDS.aliceSolo; // Alice admin, Charlie editor; David outside

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

async function createTask(client: PoolClient, description: string | null): Promise<string> {
  const { rows: statusRows } = await client.query<{ id: string }>(
    "insert into public.statuses (workspace_id, name, color) values ($1, 'Open', '#94a3b8') returning id",
    [WORKSPACE_ID],
  );
  const { rows: typeRows } = await client.query<{ id: string }>(
    "insert into public.task_types (workspace_id, name) values ($1, 'Task') returning id",
    [WORKSPACE_ID],
  );
  const { rows } = await client.query<{ id: string }>(
    `insert into public.tasks (workspace_id, title, start_date, end_date, status_id, type_id, description)
     values ($1, 'Prepare the offer', current_date, current_date, $2, $3, $4) returning id`,
    [WORKSPACE_ID, statusRows[0].id, typeRows[0].id, description],
  );
  return rows[0].id;
}

async function createComment(client: PoolClient, taskId: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `insert into public.task_comments (workspace_id, task_id, author_id, author_display_name_snapshot, content, mentioned_user_ids)
     values ($1, $2, $3, 'Alice Fixture', '<p>Call the client</p>', array[$4]::uuid[]) returning id`,
    [WORKSPACE_ID, taskId, TEST_USER_IDS.alice, TEST_USER_IDS.charlie],
  );
  return rows[0].id;
}

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

describe("Task card sync (0161, 0162)", () => {
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

  it("a deleted comment stays readable to members as an empty row, so its delete event reaches them", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const taskId = await createTask(client, null);
      const commentId = await createComment(client, taskId);

      await asAuthenticated(client, TEST_USER_IDS.alice, async () => {
        const { rows } = await client.query<{ ok: boolean }>(
          "select public.soft_delete_task_comment($1, $2) as ok",
          [WORKSPACE_ID, commentId],
        );
        expect(rows[0].ok).toBe(true);
      });

      await asAuthenticated(client, TEST_USER_IDS.charlie, async () => {
        const { rows } = await client.query<{ deleted: boolean; content: string; mentions: string[] }>(
          "select deleted_at is not null as deleted, content, mentioned_user_ids as mentions from public.task_comments where id = $1",
          [commentId],
        );
        expect(rows).toEqual([{ deleted: true, content: "", mentions: [] }]);
      });

      await asAuthenticated(client, TEST_USER_IDS.david, async () => {
        const { rows } = await client.query("select 1 from public.task_comments where id = $1", [commentId]);
        expect(rows).toHaveLength(0);
      });
    });
  });

  it("an author deleting through a direct update leaves no text behind either", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const taskId = await createTask(client, null);
      const commentId = await createComment(client, taskId);

      await asAuthenticated(client, TEST_USER_IDS.alice, async () => {
        const { rowCount } = await client.query(
          "update public.task_comments set deleted_at = now() where id = $1",
          [commentId],
        );
        expect(rowCount).toBe(1);
      });

      const { rows } = await client.query<{ content: string }>(
        "select content from public.task_comments where id = $1",
        [commentId],
      );
      expect(rows[0].content).toBe("");
    });
  });

  it("saves a description only over the text the editor started from", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const taskId = await createTask(client, "<p>Draft v1</p>");

      await asAuthenticated(client, TEST_USER_IDS.charlie, async () => {
        const saved = await client.query<{ description: string }>(
          "select description from public.update_task_description_if_unchanged($1, $2, $3)",
          [taskId, sha256("<p>Draft v1</p>"), "<p>Charlie's version</p>"],
        );
        expect(saved.rows).toEqual([{ description: "<p>Charlie's version</p>" }]);

        // Alice started from v1 too: her save must not erase Charlie's text.
        const stale = await client.query(
          "select * from public.update_task_description_if_unchanged($1, $2, $3)",
          [taskId, sha256("<p>Draft v1</p>"), "<p>Alice's version</p>"],
        );
        expect(stale.rows).toHaveLength(0);
      });

      const { rows } = await client.query<{ description: string }>(
        "select description from public.tasks where id = $1",
        [taskId],
      );
      expect(rows[0].description).toBe("<p>Charlie's version</p>");
    });
  });

  it("treats an empty description as the base for a task that has none, and keeps strangers out", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const taskId = await createTask(client, null);

      await asAuthenticated(client, TEST_USER_IDS.david, async () => {
        const { rows } = await client.query(
          "select * from public.update_task_description_if_unchanged($1, $2, $3)",
          [taskId, sha256(""), "<p>Not mine to write</p>"],
        );
        expect(rows).toHaveLength(0);
      });

      await asAuthenticated(client, TEST_USER_IDS.charlie, async () => {
        const { rows } = await client.query(
          "select * from public.update_task_description_if_unchanged($1, $2, $3)",
          [taskId, sha256(""), "<p>First words</p>"],
        );
        expect(rows).toHaveLength(1);
      });
    });
  });
});
