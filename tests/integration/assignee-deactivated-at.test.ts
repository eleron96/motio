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

// assignees.deactivated_at (0186): the day a person stopped being on the team.
// The workload heatmap divides a past day by the team it had THEN, so the date
// has to be stamped wherever is_active is flipped — the client, a member being
// removed, a member coming back — and must not be something a caller can set.

type Row = { is_active: boolean; stamped_now: boolean | null; deactivated_at: Date | null };

async function assigneeIdFor(client: PoolClient, workspaceId: string, userId: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    "select id from public.assignees where workspace_id = $1 and user_id = $2",
    [workspaceId, userId],
  );
  expect(rows[0]?.id, "fixture must provide an assignee row").toBeTruthy();
  return rows[0].id;
}

// now() is fixed for the whole transaction, so "stamped by this transaction" is
// an exact comparison.
async function read(client: PoolClient, assigneeId: string): Promise<Row> {
  const { rows } = await client.query<Row>(
    `select is_active, deactivated_at, deactivated_at = now() as stamped_now
       from public.assignees where id = $1`,
    [assigneeId],
  );
  return rows[0];
}

async function withFixture<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withRollback(async (client) => {
    await loadFixture(client, "account-deletion.sql");
    return fn(client);
  });
}

describe("assignee leaving day (0186)", () => {
  beforeAll(async () => {
    const client = await getTestPool().connect();
    try {
      await assertCoreSchemaReady(client);
      const { rows } = await client.query<{ present: boolean }>(
        `select exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'assignees' and column_name = 'deactivated_at'
         ) as present`,
      );
      if (!rows[0]?.present) {
        throw new Error("0186 not applied: assignees.deactivated_at is missing");
      }
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await closeTestPool();
  });

  it("starts empty for an active person", async () => {
    await withFixture(async (client) => {
      const id = await assigneeIdFor(client, TEST_WORKSPACE_IDS.bobShared, TEST_USER_IDS.bob);
      const row = await read(client, id);
      expect(row.is_active).toBe(true);
      expect(row.deactivated_at).toBeNull();
    });
  });

  it("stamps the moment a person is switched off and clears it when they are back", async () => {
    await withFixture(async (client) => {
      const id = await assigneeIdFor(client, TEST_WORKSPACE_IDS.bobShared, TEST_USER_IDS.bob);

      await client.query("update public.assignees set is_active = false where id = $1", [id]);
      expect((await read(client, id)).stamped_now).toBe(true);

      await client.query("update public.assignees set is_active = true where id = $1", [id]);
      expect((await read(client, id)).deactivated_at).toBeNull();
    });
  });

  it("does not let a caller write its own date", async () => {
    await withFixture(async (client) => {
      const id = await assigneeIdFor(client, TEST_WORKSPACE_IDS.bobShared, TEST_USER_IDS.bob);

      // On an active person the date stays empty…
      await client.query(
        "update public.assignees set deactivated_at = '2020-01-01T00:00:00Z' where id = $1",
        [id],
      );
      expect((await read(client, id)).deactivated_at).toBeNull();

      // …a status change stamps now, whatever date came with it…
      await client.query(
        "update public.assignees set is_active = false, deactivated_at = '2020-01-01T00:00:00Z' where id = $1",
        [id],
      );
      expect((await read(client, id)).stamped_now).toBe(true);

      // …and an unrelated edit afterwards keeps the stamp.
      await client.query(
        "update public.assignees set name = 'Renamed', deactivated_at = null where id = $1",
        [id],
      );
      expect((await read(client, id)).stamped_now).toBe(true);
    });
  });

  it("stamps a person who is created switched off", async () => {
    await withFixture(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `insert into public.assignees (workspace_id, name, is_active)
         values ($1, 'External, off', false), ($1, 'External, on', true)
         returning id`,
        [TEST_WORKSPACE_IDS.bobShared],
      );
      expect((await read(client, rows[0].id)).stamped_now).toBe(true);
      expect((await read(client, rows[1].id)).deactivated_at).toBeNull();
    });
  });

  it("stamps a member who is removed from the workspace and clears it when they return", async () => {
    await withFixture(async (client) => {
      const { rows: members } = await client.query<{ user_id: string; role: string }>(
        `select wm.user_id, wm.role
           from public.workspace_members wm
           join public.workspaces w on w.id = wm.workspace_id
          where wm.workspace_id = $1 and wm.user_id <> w.owner_id
          limit 1`,
        [TEST_WORKSPACE_IDS.bobShared],
      );
      expect(members[0]?.user_id, "fixture must have a non-owner member in the shared workspace").toBeTruthy();
      const { user_id: userId, role } = members[0];
      const id = await assigneeIdFor(client, TEST_WORKSPACE_IDS.bobShared, userId);

      await client.query(
        "delete from public.workspace_members where workspace_id = $1 and user_id = $2",
        [TEST_WORKSPACE_IDS.bobShared, userId],
      );
      const gone = await read(client, id);
      expect(gone.is_active).toBe(false);
      expect(gone.stamped_now).toBe(true);

      await client.query(
        "insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, $3)",
        [TEST_WORKSPACE_IDS.bobShared, userId, role],
      );
      const back = await read(client, id);
      expect(back.is_active).toBe(true);
      expect(back.deactivated_at).toBeNull();
    });
  });
});
