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

// 0164: a repeat series moves in one call and one transaction instead of an
// UPDATE per occurrence. The client computes the dates; the function only
// applies them inside (workspace_id, repeat_id) and only for editors.

const WORKSPACE_ID = TEST_WORKSPACE_IDS.bobShared; // Bob + Charlie are admins
const OTHER_WORKSPACE_ID = TEST_WORKSPACE_IDS.aliceSolo; // Alice admin, Charlie editor
const EDITOR_ID = TEST_USER_IDS.bob;
const ASSIGNEE_USER_ID = TEST_USER_IDS.charlie;
const VIEWER_ID = TEST_USER_IDS.david;
const REPEAT_ID = "33333333-3333-3333-3333-000000000101";
const OTHER_REPEAT_ID = "33333333-3333-3333-3333-000000000102";

// The fixture inserts workspaces directly, so they carry no statuses/types yet;
// one of each per workspace is enough (status names are unique per workspace).
async function seedTaskCatalog(client: PoolClient, workspaceId: string) {
  const { rows: existing } = await client.query<{ status_id: string; type_id: string }>(
    `select (select id from public.statuses where workspace_id = $1 limit 1) as status_id,
            (select id from public.task_types where workspace_id = $1 limit 1) as type_id`,
    [workspaceId],
  );
  if (existing[0]?.status_id && existing[0]?.type_id) {
    return { statusId: existing[0].status_id, typeId: existing[0].type_id };
  }
  const { rows: statusRows } = await client.query<{ id: string }>(
    "insert into public.statuses (workspace_id, name, color) values ($1, 'Open', '#94a3b8') returning id",
    [workspaceId],
  );
  const { rows: typeRows } = await client.query<{ id: string }>(
    "insert into public.task_types (workspace_id, name) values ($1, 'Task') returning id",
    [workspaceId],
  );
  return { statusId: statusRows[0].id, typeId: typeRows[0].id };
}

async function createSeries(
  client: PoolClient,
  options: { workspaceId: string; repeatId: string; count: number; assigneeId?: string | null },
): Promise<string[]> {
  const { statusId, typeId } = await seedTaskCatalog(client, options.workspaceId);
  const assigneeIds = options.assigneeId ? [options.assigneeId] : [];
  const { rows } = await client.query<{ id: string }>(
    `insert into public.tasks (
       workspace_id, title, assignee_id, assignee_ids,
       start_date, end_date, status_id, type_id, repeat_id
     )
     select $1, 'Weekly sync', $2, $3::uuid[],
            date '2026-08-03' + (week * 7),
            date '2026-08-04' + (week * 7),
            $4, $5, $6
     from generate_series(0, $7::int - 1) as week
     order by week
     returning id`,
    [options.workspaceId, assigneeIds[0] ?? null, assigneeIds, statusId, typeId, options.repeatId, options.count],
  );
  return rows.map((row) => row.id);
}

async function assigneeIdFor(client: PoolClient, workspaceId: string, userId: string) {
  const { rows } = await client.query<{ id: string }>(
    "select id from public.assignees where workspace_id = $1 and user_id = $2",
    [workspaceId, userId],
  );
  return rows[0]?.id ?? null;
}

async function datesOf(client: PoolClient, ids: string[]) {
  const { rows } = await client.query<{ id: string; start_date: string; end_date: string }>(
    `select id, start_date::text, end_date::text from public.tasks
     where id = any($1::uuid[]) order by start_date, id`,
    [ids],
  );
  return rows;
}

// Calls the function the way PostgREST does: as the authenticated role, with
// the caller's id in the JWT claims.
async function shiftAs(
  client: PoolClient,
  userId: string,
  workspaceId: string,
  repeatId: string,
  rows: Array<{ id: string; start_date: string; end_date: string; expect_start_date?: string; expect_end_date?: string }>,
) {
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
  await client.query("set local role authenticated");
  // On an error the transaction is aborted: the caller rolls back to its
  // savepoint, which also undoes the SET LOCAL role.
  const result = await client.query<{ id: string; start_date: string; end_date: string }>(
    `select id, start_date::text, end_date::text
     from public.shift_repeat_series($1, $2, $3::jsonb)`,
    [workspaceId, repeatId, JSON.stringify(rows)],
  );
  await client.query("reset role");
  return result.rows;
}

const plusDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

describe("shift_repeat_series (0164)", () => {
  beforeAll(async () => {
    const client = await getTestPool().connect();
    try {
      await assertCoreSchemaReady(client);
      const { rows } = await client.query<{ present: boolean }>(
        "select to_regprocedure('public.shift_repeat_series(uuid, uuid, jsonb)') is not null as present",
      );
      if (!rows[0]?.present) throw new Error("0164 not applied: shift_repeat_series is missing");
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await closeTestPool();
  });

  it("moves every given occurrence in one call and returns the moved rows", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const ids = await createSeries(client, { workspaceId: WORKSPACE_ID, repeatId: REPEAT_ID, count: 5 });
      const before = await datesOf(client, ids);
      const shifted = before.map((row) => ({
        id: row.id,
        start_date: plusDays(row.start_date, 2),
        end_date: plusDays(row.end_date, 2),
      }));

      const returned = await shiftAs(client, EDITOR_ID, WORKSPACE_ID, REPEAT_ID, shifted);

      expect(returned).toEqual(shifted);
      expect(await datesOf(client, ids)).toEqual(shifted);
    });
  });

  it("moves a row with expected dates only while it still has them (undo, 0168)", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const ids = await createSeries(client, { workspaceId: WORKSPACE_ID, repeatId: REPEAT_ID, count: 2 });
      const [first, second] = await datesOf(client, ids);
      // A teammate moved the second occurrence after our move.
      await client.query(
        "update public.tasks set start_date = start_date + 1, end_date = end_date + 1 where id = $1",
        [second.id],
      );
      const secondNow = (await datesOf(client, [second.id]))[0];

      const returned = await shiftAs(client, EDITOR_ID, WORKSPACE_ID, REPEAT_ID, [first, second].map((row) => ({
        id: row.id,
        start_date: plusDays(row.start_date, -7),
        end_date: plusDays(row.end_date, -7),
        expect_start_date: row.start_date,
        expect_end_date: row.end_date,
      })));

      expect(returned.map((row) => row.id)).toEqual([first.id]);
      expect(await datesOf(client, [first.id])).toEqual([{
        id: first.id,
        start_date: plusDays(first.start_date, -7),
        end_date: plusDays(first.end_date, -7),
      }]);
      expect(await datesOf(client, [second.id])).toEqual([secondNow]);
    });
  });

  it("never touches another series or another workspace, even if their ids are passed", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const ids = await createSeries(client, { workspaceId: WORKSPACE_ID, repeatId: REPEAT_ID, count: 2 });
      const otherSeries = await createSeries(client, { workspaceId: WORKSPACE_ID, repeatId: OTHER_REPEAT_ID, count: 2 });
      const otherWorkspace = await createSeries(client, { workspaceId: OTHER_WORKSPACE_ID, repeatId: REPEAT_ID, count: 2 });
      const untouchedBefore = await datesOf(client, [...otherSeries, ...otherWorkspace]);

      const all = await datesOf(client, [...ids, ...otherSeries, ...otherWorkspace]);
      const returned = await shiftAs(client, EDITOR_ID, WORKSPACE_ID, REPEAT_ID, all.map((row) => ({
        id: row.id,
        start_date: plusDays(row.start_date, 1),
        end_date: plusDays(row.end_date, 1),
      })));

      expect(returned.map((row) => row.id).sort()).toEqual([...ids].sort());
      expect(await datesOf(client, [...otherSeries, ...otherWorkspace])).toEqual(untouchedBefore);
    });
  });

  it("refuses a viewer and moves nothing", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      await client.query(
        "insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, 'viewer')",
        [WORKSPACE_ID, VIEWER_ID],
      );
      const ids = await createSeries(client, { workspaceId: WORKSPACE_ID, repeatId: REPEAT_ID, count: 3 });
      const before = await datesOf(client, ids);

      await client.query("savepoint viewer_try");
      let code = "";
      try {
        await shiftAs(client, VIEWER_ID, WORKSPACE_ID, REPEAT_ID, before.map((row) => ({
          id: row.id,
          start_date: plusDays(row.start_date, 7),
          end_date: plusDays(row.end_date, 7),
        })));
      } catch (error) {
        code = (error as { code?: string }).code ?? "unknown";
      }
      await client.query("rollback to savepoint viewer_try");

      expect(code).toBe("42501");
      expect(await datesOf(client, ids)).toEqual(before);
    });
  });

  it("refuses a non-member and is not executable by anon", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const ids = await createSeries(client, { workspaceId: OTHER_WORKSPACE_ID, repeatId: REPEAT_ID, count: 2 });
      const before = await datesOf(client, ids);

      await client.query("savepoint outsider_try");
      let code = "";
      try {
        // Bob is not a member of Alice's workspace.
        await shiftAs(client, EDITOR_ID, OTHER_WORKSPACE_ID, REPEAT_ID, before);
      } catch (error) {
        code = (error as { code?: string }).code ?? "unknown";
      }
      await client.query("rollback to savepoint outsider_try");
      expect(code).toBe("42501");

      const { rows } = await client.query<{ anon: boolean; authenticated: boolean }>(
        `select has_function_privilege('anon', 'public.shift_repeat_series(uuid, uuid, jsonb)', 'execute') as anon,
                has_function_privilege('authenticated', 'public.shift_repeat_series(uuid, uuid, jsonb)', 'execute') as authenticated`,
      );
      expect(rows[0]).toEqual({ anon: false, authenticated: true });
    });
  });

  it("writes one notification for the whole shift", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const assigneeId = await assigneeIdFor(client, WORKSPACE_ID, ASSIGNEE_USER_ID);
      expect(assigneeId, "the member-sync trigger must provide an assignee row").toBeTruthy();
      const ids = await createSeries(client, { workspaceId: WORKSPACE_ID, repeatId: REPEAT_ID, count: 6, assigneeId });
      await client.query("delete from public.user_notifications where workspace_id = $1", [WORKSPACE_ID]);
      const before = await datesOf(client, ids);

      await shiftAs(client, EDITOR_ID, WORKSPACE_ID, REPEAT_ID, before.map((row) => ({
        id: row.id,
        start_date: plusDays(row.start_date, 3),
        end_date: plusDays(row.end_date, 3),
      })));

      const { rows } = await client.query<{ count: string }>(
        `select count(*) as count from public.user_notifications
         where workspace_id = $1 and recipient_user_id = $2 and type = 'task_updated'`,
        [WORKSPACE_ID, ASSIGNEE_USER_ID],
      );
      expect(Number(rows[0].count)).toBe(1);
    });
  });
});
