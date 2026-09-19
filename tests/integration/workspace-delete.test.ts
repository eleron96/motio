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

// Deleting a workspace used to fail with tasks_workspace_id_fkey as soon as a
// task had a project and an assignee, two assignees, or an assignee and a tag:
// the cascade updated the same task twice after the workspace row was gone.
// 0149 deletes the workspace's tasks before the cascade starts.

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

async function insertId(client: PoolClient, sql: string, params: unknown[]): Promise<string> {
  const { rows } = await client.query<{ id: string }>(sql, params);
  return rows[0].id;
}

describe("deleting a workspace that holds real work", () => {
  beforeAll(async () => {
    const client = await getTestPool().connect();
    try {
      await assertCoreSchemaReady(client);
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await closeTestPool();
  });

  it("removes the workspace with its tasks, people and catalogs", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const workspaceId = TEST_WORKSPACE_IDS.aliceSolo;

      const statusId = await insertId(client,
        "insert into public.statuses (workspace_id, name, color) values ($1, 'Doing', '#3b82f6') returning id",
        [workspaceId]);
      const typeId = await insertId(client,
        "insert into public.task_types (workspace_id, name) values ($1, 'Task') returning id",
        [workspaceId]);
      const projectId = await insertId(client,
        "insert into public.projects (workspace_id, name, color) values ($1, 'Website', '#a3d5ff') returning id",
        [workspaceId]);
      const tagId = await insertId(client,
        "insert into public.tags (workspace_id, name, color) values ($1, 'Urgent', '#ef4444') returning id",
        [workspaceId]);
      const vendorId = await insertId(client,
        "insert into public.assignees (workspace_id, name) values ($1, 'External Vendor') returning id",
        [workspaceId]);
      const aliceId = await assigneeIdFor(client, workspaceId, TEST_USER_IDS.alice);

      // Project, two assignees and a tag: every update the cascade can make.
      await client.query(
        `insert into public.tasks
           (workspace_id, title, project_id, assignee_ids, start_date, end_date, status_id, type_id, tag_ids)
         values ($1, 'Shared task', $2, array[$3, $4]::uuid[], current_date, current_date + 2, $5, $6, array[$7]::uuid[])`,
        [workspaceId, projectId, aliceId, vendorId, statusId, typeId, tagId],
      );

      await asAuthenticated(client, TEST_USER_IDS.alice, () =>
        client.query("select public.delete_workspace($1)", [workspaceId]),
      );

      const { rows } = await client.query<{ workspaces: number; tasks: number; assignees: number; tags: number }>(
        `select (select count(*) from public.workspaces where id = $1)::int as workspaces,
                (select count(*) from public.tasks where workspace_id = $1)::int as tasks,
                (select count(*) from public.assignees where workspace_id = $1)::int as assignees,
                (select count(*) from public.tags where workspace_id = $1)::int as tags`,
        [workspaceId],
      );
      expect(rows[0]).toEqual({ workspaces: 0, tasks: 0, assignees: 0, tags: 0 });
    });
  });
});
