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

// 0134: one action that touches a whole repeat series must produce ONE
// notification per recipient, not one per occurrence. Production hit this with
// a 52-occurrence weekly series: rebuilding it wrote 52 'task_updated' rows for
// the same assignee, all delivered as pushes.
//
// 0146: the same rule now holds when the client spends one transaction per
// occurrence instead of one for the whole series — dragging a series with scope
// "this and following" does exactly that, and it wrote 74 rows in production.
// A test runs inside a single transaction, so now() cannot advance between
// updates; the row-by-row case is modelled by ageing the notifications already
// written, which moves the same distance the other way.

const WORKSPACE_ID = TEST_WORKSPACE_IDS.bobShared;
const ACTOR_ID = TEST_USER_IDS.bob;
const RECIPIENT_ID = TEST_USER_IDS.charlie;
const REPEAT_ID = "33333333-3333-3333-3333-000000000001";

async function assigneeIdFor(
  client: PoolClient,
  workspaceId: string,
  userId: string,
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    "select id from public.assignees where workspace_id = $1 and user_id = $2",
    [workspaceId, userId],
  );
  expect(rows[0]?.id, "the member-sync trigger must provide an assignee row").toBeTruthy();
  return rows[0].id;
}

// The fixture inserts workspaces directly, so they carry no seeded statuses/types.
async function seedTaskCatalog(client: PoolClient): Promise<{ statusId: string; typeId: string }> {
  const { rows: statusRows } = await client.query<{ id: string }>(
    "insert into public.statuses (workspace_id, name, color) values ($1, 'Open', '#94a3b8') returning id",
    [WORKSPACE_ID],
  );
  const { rows: typeRows } = await client.query<{ id: string }>(
    "insert into public.task_types (workspace_id, name) values ($1, 'Task') returning id",
    [WORKSPACE_ID],
  );
  return { statusId: statusRows[0].id, typeId: typeRows[0].id };
}

async function createSeries(
  client: PoolClient,
  options: { assigneeIds: string[]; repeatId: string | null; count: number },
): Promise<string[]> {
  const { statusId, typeId } = await seedTaskCatalog(client);

  const { rows } = await client.query<{ id: string }>(
    `insert into public.tasks (
       workspace_id, title, assignee_id, assignee_ids,
       start_date, end_date, status_id, type_id, repeat_id
     )
     select $1, 'Weekly audit', $2, $3::uuid[],
            date '2026-08-06' + (week * 7),
            date '2026-08-06' + (week * 7),
            $4, $5, $6
     from generate_series(0, $7::int - 1) as week
     returning id`,
    [
      WORKSPACE_ID,
      options.assigneeIds[0] ?? null,
      options.assigneeIds,
      statusId,
      typeId,
      options.repeatId,
      options.count,
    ],
  );
  return rows.map((row) => row.id);
}

async function actAs(client: PoolClient, userId: string): Promise<void> {
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
}

async function clearNotifications(client: PoolClient): Promise<void> {
  await client.query("delete from public.user_notifications where workspace_id = $1", [
    WORKSPACE_ID,
  ]);
}

// One request per occurrence means one transaction per occurrence, each with a
// later now() than the notification written by the previous one. Inside a test
// transaction now() is frozen, so the distance is created by ageing the rows.
async function ageNotifications(client: PoolClient, seconds: number): Promise<void> {
  await client.query(
    `update public.user_notifications
     set created_at = created_at - make_interval(secs => $1)
     where workspace_id = $2`,
    [seconds, WORKSPACE_ID],
  );
}

async function countNotifications(client: PoolClient, type: string): Promise<number> {
  const { rows } = await client.query<{ count: string }>(
    `select count(*) as count
     from public.user_notifications
     where workspace_id = $1 and recipient_user_id = $2 and type = $3`,
    [WORKSPACE_ID, RECIPIENT_ID, type],
  );
  return Number(rows[0].count);
}

describe("repeat-series notification bursts (0134, 0146)", () => {
  beforeAll(async () => {
    const pool = getTestPool();
    const client = await pool.connect();
    try {
      await assertCoreSchemaReady(client);
      const { rows } = await client.query<{ guarded: boolean }>(
        `select bool_and(pg_get_functiondef(p.oid) like '%n.created_at > now() - interval ''60 seconds''%') as guarded
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in ('notify_task_assignment', 'notify_task_updated')`,
      );
      if (!rows[0]?.guarded) {
        throw new Error("0146 not applied: the windowed series guard is missing");
      }
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await closeTestPool();
  });

  it("collapses a series-wide date shift into a single notification", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const assigneeId = await assigneeIdFor(client, WORKSPACE_ID, RECIPIENT_ID);
      const taskIds = await createSeries(client, {
        assigneeIds: [assigneeId],
        repeatId: REPEAT_ID,
        count: 5,
      });
      await clearNotifications(client);
      await actAs(client, ACTOR_ID);

      // What rebuild_repeat_series does first: reposition every occurrence.
      await client.query(
        `update public.tasks
         set start_date = start_date + 1, end_date = end_date + 1
         where id = any($1::uuid[])`,
        [taskIds],
      );

      expect(await countNotifications(client, "task_updated")).toBe(1);
    });
  });

  it("collapses a series-wide assignee change into a single notification", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const assigneeId = await assigneeIdFor(client, WORKSPACE_ID, RECIPIENT_ID);
      const taskIds = await createSeries(client, {
        assigneeIds: [],
        repeatId: REPEAT_ID,
        count: 5,
      });
      await clearNotifications(client);
      await actAs(client, ACTOR_ID);

      await client.query(
        `update public.tasks
         set assignee_id = $1, assignee_ids = array[$1]::uuid[]
         where id = any($2::uuid[])`,
        [assigneeId, taskIds],
      );

      expect(await countNotifications(client, "task_assigned")).toBe(1);
    });
  });

  it("collapses a row-by-row series move into a single notification", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const assigneeId = await assigneeIdFor(client, WORKSPACE_ID, RECIPIENT_ID);
      const taskIds = await createSeries(client, {
        assigneeIds: [assigneeId],
        repeatId: REPEAT_ID,
        count: 5,
      });
      await clearNotifications(client);
      await actAs(client, ACTOR_ID);

      // What dragging a series with scope "this and following" does: one
      // UPDATE per occurrence, each in its own transaction.
      for (const taskId of taskIds) {
        await client.query(
          `update public.tasks
           set start_date = start_date + 1, end_date = end_date + 1
           where id = $1`,
          [taskId],
        );
        await ageNotifications(client, 1);
      }

      expect(await countNotifications(client, "task_updated")).toBe(1);
    });
  });

  it("notifies again once the collapse window has passed", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const assigneeId = await assigneeIdFor(client, WORKSPACE_ID, RECIPIENT_ID);
      const taskIds = await createSeries(client, {
        assigneeIds: [assigneeId],
        repeatId: REPEAT_ID,
        count: 5,
      });
      await clearNotifications(client);
      await actAs(client, ACTOR_ID);

      await client.query(
        `update public.tasks
         set start_date = start_date + 1, end_date = end_date + 1
         where id = $1`,
        [taskIds[0]],
      );
      // Two unrelated edits minutes apart are two pieces of news, not a burst.
      await ageNotifications(client, 120);
      await client.query(
        `update public.tasks
         set start_date = start_date + 1, end_date = end_date + 1
         where id = $1`,
        [taskIds[1]],
      );

      expect(await countNotifications(client, "task_updated")).toBe(2);
    });
  });

  it("still notifies per task when the tasks are not a series", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const assigneeId = await assigneeIdFor(client, WORKSPACE_ID, RECIPIENT_ID);
      const taskIds = await createSeries(client, {
        assigneeIds: [assigneeId],
        repeatId: null,
        count: 3,
      });
      await clearNotifications(client);
      await actAs(client, ACTOR_ID);

      await client.query(
        `update public.tasks
         set start_date = start_date + 1, end_date = end_date + 1
         where id = any($1::uuid[])`,
        [taskIds],
      );

      expect(await countNotifications(client, "task_updated")).toBe(3);
    });
  });

  it("keeps notifying the assignee of a single occurrence edited on its own", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const assigneeId = await assigneeIdFor(client, WORKSPACE_ID, RECIPIENT_ID);
      const taskIds = await createSeries(client, {
        assigneeIds: [assigneeId],
        repeatId: REPEAT_ID,
        count: 5,
      });
      await clearNotifications(client);
      await actAs(client, ACTOR_ID);

      await client.query(
        `update public.tasks
         set start_date = start_date + 1, end_date = end_date + 1
         where id = $1`,
        [taskIds[2]],
      );

      expect(await countNotifications(client, "task_updated")).toBe(1);
    });
  });
});
