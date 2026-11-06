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

const WORKSPACE_ID = TEST_WORKSPACE_IDS.aliceSolo;
const INITIAL_TIME = "2020-01-01T00:00:00.000Z";

interface Catalogs {
  statusId: string;
  typeId: string;
}

interface Attribution {
  created_by: string | null;
  updated_by: string | null;
  updated_at: Date;
}

async function asActor<T>(
  client: PoolClient,
  actorId: string | null,
  action: () => Promise<T>,
): Promise<T> {
  const { rows } = await client.query<{ actor: string | null }>(
    "select current_setting('request.jwt.claim.sub', true) as actor",
  );
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [actorId ?? ""]);
  await client.query(actorId ? "set local role authenticated" : "set local role service_role");
  try {
    return await action();
  } finally {
    await client.query("reset role");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [rows[0].actor ?? ""]);
  }
}

async function setup(client: PoolClient): Promise<Catalogs> {
  await loadFixture(client, "account-deletion.sql");
  const status = await client.query<{ id: string }>(
    "insert into public.statuses (workspace_id, name, color) values ($1, 'Open', '#94a3b8') returning id",
    [WORKSPACE_ID],
  );
  const type = await client.query<{ id: string }>(
    "insert into public.task_types (workspace_id, name) values ($1, 'Task') returning id",
    [WORKSPACE_ID],
  );
  return { statusId: status.rows[0].id, typeId: type.rows[0].id };
}

async function createTask(
  client: PoolClient,
  catalogs: Catalogs,
  actorId: string | null = TEST_USER_IDS.alice,
  suppliedAuthor: string | null = null,
): Promise<string> {
  return asActor(client, actorId, async () => {
    const { rows } = await client.query<{ id: string }>(
      `insert into public.tasks (
         workspace_id, title, start_date, end_date, status_id, type_id,
         created_by, updated_by, updated_at
       ) values ($1, 'Prepare the offer', current_date, current_date, $2, $3, $4, $4, $5)
       returning id`,
      [WORKSPACE_ID, catalogs.statusId, catalogs.typeId, suppliedAuthor, INITIAL_TIME],
    );
    return rows[0].id;
  });
}

async function attribution(client: PoolClient, taskId: string): Promise<Attribution> {
  const { rows } = await client.query<Attribution>(
    "select created_by, updated_by, updated_at from public.tasks where id = $1",
    [taskId],
  );
  return rows[0];
}

describe("Task attribution (0172)", () => {
  beforeAll(async () => {
    const client = await getTestPool().connect();
    try {
      await assertCoreSchemaReady(client);
      await client.query("select created_by, updated_by from public.tasks limit 0");
    } finally {
      client.release();
    }
  });

  afterAll(closeTestPool);

  it("uses the authenticated creator even when an insert supplies somebody else's identity", async () => {
    await withRollback(async (client) => {
      const catalogs = await setup(client);
      const taskId = await createTask(client, catalogs, TEST_USER_IDS.alice, TEST_USER_IDS.charlie);

      expect(await attribution(client, taskId)).toMatchObject({
        created_by: TEST_USER_IDS.alice,
        updated_by: TEST_USER_IDS.alice,
      });
    });
  });

  it("keeps the creator and records the actual editor, ignoring supplied attribution", async () => {
    await withRollback(async (client) => {
      const catalogs = await setup(client);
      const taskId = await createTask(client, catalogs);

      await asActor(client, TEST_USER_IDS.charlie, () => client.query(
        "update public.tasks set title = 'Revised offer', created_by = $2, updated_by = $2 where id = $1",
        [taskId, TEST_USER_IDS.david],
      ));

      const saved = await attribution(client, taskId);
      expect(saved.created_by).toBe(TEST_USER_IDS.alice);
      expect(saved.updated_by).toBe(TEST_USER_IDS.charlie);
      expect(saved.updated_at.toISOString()).not.toBe(INITIAL_TIME);
    });
  });

  it("does not attribute no-op, timestamp-only or author-only writes as edits", async () => {
    await withRollback(async (client) => {
      const catalogs = await setup(client);
      const taskId = await createTask(client, catalogs);
      const before = await attribution(client, taskId);

      await asActor(client, TEST_USER_IDS.charlie, async () => {
        await client.query("update public.tasks set title = title where id = $1", [taskId]);
        await client.query("update public.tasks set updated_at = now() where id = $1", [taskId]);
        await client.query(
          "update public.tasks set created_by = $2, updated_by = $2 where id = $1",
          [taskId, TEST_USER_IDS.charlie],
        );
        await client.query(
          "update public.tasks set created_by = null, updated_by = null where id = $1",
          [taskId],
        );
      });

      expect(await attribution(client, taskId)).toEqual(before);
    });
  });

  it("checks the normalized task, so a duplicate assignee does not count as an edit", async () => {
    await withRollback(async (client) => {
      const catalogs = await setup(client);
      const taskId = await createTask(client, catalogs);
      const { rows } = await client.query<{ id: string }>(
        "select id from public.assignees where workspace_id = $1 and user_id = $2",
        [WORKSPACE_ID, TEST_USER_IDS.alice],
      );
      const assigneeId = rows[0].id;
      await asActor(client, TEST_USER_IDS.alice, () => client.query(
        "update public.tasks set assignee_ids = array[$2]::uuid[] where id = $1",
        [taskId, assigneeId],
      ));
      const before = await attribution(client, taskId);

      await asActor(client, TEST_USER_IDS.charlie, () => client.query(
        "update public.tasks set assignee_ids = array[$2, $2]::uuid[] where id = $1",
        [taskId, assigneeId],
      ));

      expect(await attribution(client, taskId)).toEqual(before);
    });
  });

  it("leaves unknown creators unknown and clears the editor after a real system change", async () => {
    await withRollback(async (client) => {
      const catalogs = await setup(client);
      const taskId = await createTask(client, catalogs, null, TEST_USER_IDS.alice);
      expect(await attribution(client, taskId)).toMatchObject({ created_by: null, updated_by: null });

      await asActor(client, TEST_USER_IDS.charlie, () => client.query(
        "update public.tasks set title = 'Edited by a member' where id = $1",
        [taskId],
      ));
      expect(await attribution(client, taskId)).toMatchObject({
        created_by: null,
        updated_by: TEST_USER_IDS.charlie,
      });

      await asActor(client, null, () => client.query(
        "update public.tasks set title = 'Updated by a system job' where id = $1",
        [taskId],
      ));
      expect(await attribution(client, taskId)).toMatchObject({ created_by: null, updated_by: null });
    });
  });

  it("attributes description RPC writes and leaves a failed comparison unchanged", async () => {
    await withRollback(async (client) => {
      const catalogs = await setup(client);
      const taskId = await createTask(client, catalogs);
      const emptyHash = createHash("sha256").update("").digest("hex");

      await asActor(client, TEST_USER_IDS.charlie, () => client.query(
        "select id from public.update_task_description_if_unchanged($1, $2, $3)",
        [taskId, emptyHash, "<p>Updated description</p>"],
      ));
      const beforeConflict = await attribution(client, taskId);
      expect(beforeConflict.updated_by).toBe(TEST_USER_IDS.charlie);

      await asActor(client, TEST_USER_IDS.alice, async () => {
        const { rows } = await client.query(
          "select id from public.update_task_description_if_unchanged($1, $2, $3)",
          [taskId, emptyHash, "<p>Stale draft</p>"],
        );
        expect(rows).toHaveLength(0);
      });
      expect(await attribution(client, taskId)).toEqual(beforeConflict);
    });
  });

  it("does not let profile visibility turn an existing author into an unknown one", async () => {
    await withRollback(async (client) => {
      const catalogs = await setup(client);
      const taskId = await createTask(client, catalogs, TEST_USER_IDS.charlie);
      await client.query(
        "delete from public.workspace_members where workspace_id = $1 and user_id = $2",
        [WORKSPACE_ID, TEST_USER_IDS.charlie],
      );
      const before = await attribution(client, taskId);

      await asActor(client, TEST_USER_IDS.alice, async () => {
        const { rows } = await client.query("select id from public.profiles where id = $1", [TEST_USER_IDS.charlie]);
        expect(rows).toHaveLength(0);
        await client.query(
          "update public.tasks set created_by = null, updated_by = null where id = $1",
          [taskId],
        );
      });

      expect(await attribution(client, taskId)).toEqual(before);
    });
  });

  it("clears either or both author FKs on profile deletion without modifying the task's edit time", async () => {
    await withRollback(async (client) => {
      const catalogs = await setup(client);
      const both = await createTask(client, catalogs, TEST_USER_IDS.charlie);
      const creatorOnly = await createTask(client, catalogs, TEST_USER_IDS.charlie);
      const editorOnly = await createTask(client, catalogs);
      await asActor(client, TEST_USER_IDS.alice, () => client.query(
        "update public.tasks set title = 'Edited by Alice' where id = $1", [creatorOnly],
      ));
      await asActor(client, TEST_USER_IDS.charlie, () => client.query(
        "update public.tasks set title = 'Edited by Charlie' where id = $1", [editorOnly],
      ));
      const before: Attribution[] = [];
      for (const id of [both, creatorOnly, editorOnly]) {
        before.push(await attribution(client, id));
      }

      await client.query("delete from auth.users where id = $1", [TEST_USER_IDS.charlie]);

      expect(await attribution(client, both)).toEqual({ ...before[0], created_by: null, updated_by: null });
      expect(await attribution(client, creatorOnly)).toEqual({ ...before[1], created_by: null });
      expect(await attribution(client, editorOnly)).toEqual({ ...before[2], updated_by: null });
    });
  });

  it("keeps task RLS in force and does not expose the trigger as a client RPC", async () => {
    await withRollback(async (client) => {
      const catalogs = await setup(client);
      const taskId = await createTask(client, catalogs);
      const before = await attribution(client, taskId);

      await asActor(client, TEST_USER_IDS.david, async () => {
        const read = await client.query("select created_by, updated_by from public.tasks where id = $1", [taskId]);
        expect(read.rows).toHaveLength(0);
        const update = await client.query("update public.tasks set title = 'Outside edit' where id = $1", [taskId]);
        expect(update.rowCount).toBe(0);
      });
      const { rows } = await client.query<{ authenticated: boolean; anon: boolean }>(
        `select
           has_function_privilege('authenticated', 'public.set_task_attribution()', 'EXECUTE') as authenticated,
           has_function_privilege('anon', 'public.set_task_attribution()', 'EXECUTE') as anon`,
      );
      expect(rows[0]).toEqual({ authenticated: false, anon: false });
      expect(await attribution(client, taskId)).toEqual(before);
    });
  });

  it("keeps subtask and comment edits separate from the task's last editor", async () => {
    await withRollback(async (client) => {
      const catalogs = await setup(client);
      const taskId = await createTask(client, catalogs);
      const before = await attribution(client, taskId);

      await asActor(client, TEST_USER_IDS.charlie, async () => {
        await client.query(
          "insert into public.task_subtasks (workspace_id, task_id, title) values ($1, $2, 'Review the offer')",
          [WORKSPACE_ID, taskId],
        );
        await client.query(
          `insert into public.task_comments (workspace_id, task_id, author_id, author_display_name_snapshot, content)
           values ($1, $2, $3, 'Charlie Fixture', '<p>Ready for review</p>')`,
          [WORKSPACE_ID, taskId, TEST_USER_IDS.charlie],
        );
      });

      expect(await attribution(client, taskId)).toEqual(before);
    });
  });
});
