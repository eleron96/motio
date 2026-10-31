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

// 0167: comment counts by date window, so the planner asks for them together
// with the tasks. Same numbers as task_comment_counts_batch for the window's
// tasks; the read policies decide what the caller sees.

const WORKSPACE_ID = TEST_WORKSPACE_IDS.bobShared; // Bob + Charlie are admins
const MEMBER_ID = TEST_USER_IDS.bob;
const OUTSIDER_ID = TEST_USER_IDS.alice; // not a member of Bob's workspace

async function seedTask(client: PoolClient, title: string, date: string): Promise<string> {
  const { rows: catalog } = await client.query<{ status_id: string | null; type_id: string | null }>(
    `select (select id from public.statuses where workspace_id = $1 limit 1) as status_id,
            (select id from public.task_types where workspace_id = $1 limit 1) as type_id`,
    [WORKSPACE_ID],
  );
  let statusId = catalog[0]?.status_id;
  let typeId = catalog[0]?.type_id;
  if (!statusId) {
    const { rows } = await client.query<{ id: string }>(
      "insert into public.statuses (workspace_id, name, color) values ($1, 'Open', '#94a3b8') returning id",
      [WORKSPACE_ID],
    );
    statusId = rows[0].id;
  }
  if (!typeId) {
    const { rows } = await client.query<{ id: string }>(
      "insert into public.task_types (workspace_id, name) values ($1, 'Task') returning id",
      [WORKSPACE_ID],
    );
    typeId = rows[0].id;
  }
  const { rows } = await client.query<{ id: string }>(
    `insert into public.tasks (workspace_id, title, start_date, end_date, status_id, type_id)
     values ($1, $2, $3::date, $3::date, $4, $5) returning id`,
    [WORKSPACE_ID, title, date, statusId, typeId],
  );
  return rows[0].id;
}

async function addComments(client: PoolClient, taskId: string, count: number, deleted = false) {
  await client.query(
    `insert into public.task_comments (workspace_id, task_id, author_id, author_display_name_snapshot, content, deleted_at)
     select $1, $2, $3, 'Bob', 'Looks good', $5
     from generate_series(1, $4::int)`,
    [WORKSPACE_ID, taskId, MEMBER_ID, count, deleted ? new Date().toISOString() : null],
  );
}

// Calls the function the way PostgREST does: as the authenticated role, with
// the caller's id in the JWT claims.
async function countsAs(client: PoolClient, userId: string, start: string, end: string) {
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
  await client.query("set local role authenticated");
  const { rows } = await client.query<{ task_id: string; comment_count: string }>(
    "select task_id, comment_count from public.task_comment_counts_in_window($1, $2::date, $3::date)",
    [WORKSPACE_ID, start, end],
  );
  await client.query("reset role");
  return Object.fromEntries(rows.map((row) => [row.task_id, Number(row.comment_count)]));
}

describe("task_comment_counts_in_window (0167)", () => {
  beforeAll(async () => {
    const client = await getTestPool().connect();
    try {
      await assertCoreSchemaReady(client);
      const { rows } = await client.query<{ present: boolean }>(
        "select to_regprocedure('public.task_comment_counts_in_window(uuid, date, date)') is not null as present",
      );
      if (!rows[0]?.present) throw new Error("0167 not applied: task_comment_counts_in_window is missing");
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await closeTestPool();
  });

  it("counts live comments of the tasks that overlap the window", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const inside = await seedTask(client, "Inside", "2026-03-10");
      const quiet = await seedTask(client, "No comments", "2026-03-11");
      const outside = await seedTask(client, "Outside", "2026-08-01");
      await addComments(client, inside, 2);
      await addComments(client, inside, 1, true);
      await addComments(client, outside, 4);

      const counts = await countsAs(client, MEMBER_ID, "2026-01-01", "2026-06-30");

      expect(counts).toEqual({ [inside]: 2 });
      expect(counts[quiet]).toBeUndefined();
    });
  });

  it("matches the per-id counts for the same tasks", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const first = await seedTask(client, "First", "2026-03-10");
      const second = await seedTask(client, "Second", "2026-04-02");
      await addComments(client, first, 3);
      await addComments(client, second, 1);
      await addComments(client, second, 2, true);

      const windowCounts = await countsAs(client, MEMBER_ID, "2026-01-01", "2026-06-30");

      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [MEMBER_ID]);
      await client.query("set local role authenticated");
      const { rows } = await client.query<{ task_id: string; comment_count: string }>(
        "select task_id, comment_count from public.task_comment_counts_batch($1, $2::uuid[])",
        [WORKSPACE_ID, [first, second]],
      );
      await client.query("reset role");
      const batchCounts = Object.fromEntries(rows.map((row) => [row.task_id, Number(row.comment_count)]));

      expect(windowCounts).toEqual(batchCounts);
    });
  });

  it("shows an outsider nothing and is not executable by anon", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const task = await seedTask(client, "Private", "2026-03-10");
      await addComments(client, task, 2);

      expect(await countsAs(client, OUTSIDER_ID, "2026-01-01", "2026-06-30")).toEqual({});

      const { rows } = await client.query<{ anon: boolean; authenticated: boolean }>(
        `select has_function_privilege('anon', 'public.task_comment_counts_in_window(uuid, date, date)', 'execute') as anon,
                has_function_privilege('authenticated', 'public.task_comment_counts_in_window(uuid, date, date)', 'execute') as authenticated`,
      );
      expect(rows[0]).toEqual({ anon: false, authenticated: true });
    });
  });
});
