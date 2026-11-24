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

// 0192: a person added to the timeline by name can be invited from their row.
// The invitation remembers the row, and the membership trigger hands it over —
// tasks and all — instead of making a second, empty row for the new member.
//
// W1 (aliceSolo): Alice admin, Charlie editor. David is not a member; he is the
// one being invited. W2 (bobShared) is somebody else's workspace.

const PERSON_ROW = "eeeeeeee-1111-1111-1111-000000000001";
const OTHER_ROW = "eeeeeeee-1111-1111-1111-000000000002";
const TASK_ID = "eeeeeeee-2222-2222-2222-000000000001";

type Row = { id: string; user_id: string | null; name: string; is_active: boolean };

async function rowsOf(client: PoolClient, workspaceId: string, userId: string): Promise<Row[]> {
  const { rows } = await client.query<Row>(
    "select id, user_id, name, is_active from public.assignees where workspace_id = $1 and user_id = $2",
    [workspaceId, userId],
  );
  return rows;
}

async function emailOf(client: PoolClient, userId: string): Promise<string> {
  const { rows } = await client.query<{ email: string }>(
    "select email from public.profiles where id = $1",
    [userId],
  );
  return rows[0].email;
}

async function addPersonRow(
  client: PoolClient,
  options: { id?: string; workspaceId?: string; name?: string; sample?: boolean } = {},
) {
  await client.query(
    "insert into public.assignees (id, workspace_id, name, is_active, is_sample) values ($1, $2, $3, true, $4)",
    [
      options.id ?? PERSON_ROW,
      options.workspaceId ?? TEST_WORKSPACE_IDS.aliceSolo,
      options.name ?? "Dave from the workshop",
      options.sample ?? false,
    ],
  );
}

async function invite(
  client: PoolClient,
  options: { email: string; assigneeId: string | null; workspaceId?: string; revoked?: boolean },
) {
  await client.query(
    `insert into public.workspace_invites
       (workspace_id, email, email_normalized, role, invited_by, assignee_id, revoked_at)
     values ($1, $2, lower(trim($2)), 'editor', $3, $4, $5)`,
    [
      options.workspaceId ?? TEST_WORKSPACE_IDS.aliceSolo,
      options.email,
      TEST_USER_IDS.alice,
      options.assigneeId,
      options.revoked ? new Date().toISOString() : null,
    ],
  );
}

async function join(client: PoolClient, userId: string, workspaceId: string = TEST_WORKSPACE_IDS.aliceSolo) {
  await client.query(
    "insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, 'editor')",
    [workspaceId, userId],
  );
}

async function withFixture<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withRollback(async (client) => {
    await loadFixture(client, "account-deletion.sql");
    return fn(client);
  });
}

describe("an invitation sent from a person's row (0192)", () => {
  beforeAll(async () => {
    await assertCoreSchemaReady(getTestPool());
  });

  afterAll(async () => {
    await closeTestPool();
  });

  it("hands the row over, with its tasks, when the person joins", async () => {
    await withFixture(async (client) => {
      await addPersonRow(client);
      const status = await client.query<{ id: string }>(
        "insert into public.statuses (workspace_id, name, color) values ($1, 'To do', '#94a3b8') returning id",
        [TEST_WORKSPACE_IDS.aliceSolo],
      );
      const type = await client.query<{ id: string }>(
        "insert into public.task_types (workspace_id, name) values ($1, 'Task') returning id",
        [TEST_WORKSPACE_IDS.aliceSolo],
      );
      await client.query(
        `insert into public.tasks
           (id, workspace_id, title, start_date, end_date, status_id, type_id, assignee_id, assignee_ids)
         values ($1, $2, 'Fit the cabinets', current_date, current_date, $3, $4, $5, array[$5]::uuid[])`,
        [TASK_ID, TEST_WORKSPACE_IDS.aliceSolo, status.rows[0].id, type.rows[0].id, PERSON_ROW],
      );
      await invite(client, { email: await emailOf(client, TEST_USER_IDS.david), assigneeId: PERSON_ROW });

      await join(client, TEST_USER_IDS.david);

      const rows = await rowsOf(client, TEST_WORKSPACE_IDS.aliceSolo, TEST_USER_IDS.david);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(PERSON_ROW);
      expect(rows[0].is_active).toBe(true);
      const { rows: tasks } = await client.query<{ assignee_ids: string[] }>(
        "select assignee_ids from public.tasks where id = $1",
        [TASK_ID],
      );
      expect(tasks[0].assignee_ids).toEqual([PERSON_ROW]);
    });
  });

  it("takes the person's own name when they have one, and keeps the typed one otherwise", async () => {
    await withFixture(async (client) => {
      await addPersonRow(client);
      await invite(client, { email: await emailOf(client, TEST_USER_IDS.david), assigneeId: PERSON_ROW });
      await join(client, TEST_USER_IDS.david);
      expect((await rowsOf(client, TEST_WORKSPACE_IDS.aliceSolo, TEST_USER_IDS.david))[0].name).toBe("David Fixture");
    });

    await withFixture(async (client) => {
      await client.query("update public.profiles set display_name = null where id = $1", [TEST_USER_IDS.david]);
      await addPersonRow(client);
      await invite(client, { email: await emailOf(client, TEST_USER_IDS.david), assigneeId: PERSON_ROW });
      await join(client, TEST_USER_IDS.david);
      expect((await rowsOf(client, TEST_WORKSPACE_IDS.aliceSolo, TEST_USER_IDS.david))[0].name)
        .toBe("Dave from the workshop");
    });
  });

  it("matches the email whatever its case", async () => {
    await withFixture(async (client) => {
      await addPersonRow(client);
      const email = await emailOf(client, TEST_USER_IDS.david);
      await invite(client, { email: email.toUpperCase(), assigneeId: PERSON_ROW });
      await join(client, TEST_USER_IDS.david);
      expect((await rowsOf(client, TEST_WORKSPACE_IDS.aliceSolo, TEST_USER_IDS.david))[0].id).toBe(PERSON_ROW);
    });
  });

  it("leaves the row alone when the invitation names none, was revoked, or is for someone else", async () => {
    // A plain invitation: the member gets a row of their own, as always.
    await withFixture(async (client) => {
      await addPersonRow(client);
      await invite(client, { email: await emailOf(client, TEST_USER_IDS.david), assigneeId: null });
      await join(client, TEST_USER_IDS.david);
      const rows = await rowsOf(client, TEST_WORKSPACE_IDS.aliceSolo, TEST_USER_IDS.david);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).not.toBe(PERSON_ROW);
    });

    await withFixture(async (client) => {
      await addPersonRow(client);
      await invite(client, {
        email: await emailOf(client, TEST_USER_IDS.david),
        assigneeId: PERSON_ROW,
        revoked: true,
      });
      await join(client, TEST_USER_IDS.david);
      expect((await rowsOf(client, TEST_WORKSPACE_IDS.aliceSolo, TEST_USER_IDS.david))[0].id).not.toBe(PERSON_ROW);
    });

    // The invitation went to Bob's email; David joining by another road gets nothing of it.
    await withFixture(async (client) => {
      await addPersonRow(client);
      await invite(client, { email: await emailOf(client, TEST_USER_IDS.bob), assigneeId: PERSON_ROW });
      await join(client, TEST_USER_IDS.david);
      expect((await rowsOf(client, TEST_WORKSPACE_IDS.aliceSolo, TEST_USER_IDS.david))[0].id).not.toBe(PERSON_ROW);
      const { rows } = await client.query<{ user_id: string | null }>(
        "select user_id from public.assignees where id = $1",
        [PERSON_ROW],
      );
      expect(rows[0].user_id).toBeNull();
    });
  });

  it("never hands over a row from another workspace or a sample colleague", async () => {
    await withFixture(async (client) => {
      // The row lives in Bob's workspace; the invitation is to Alice's.
      await addPersonRow(client, { workspaceId: TEST_WORKSPACE_IDS.bobShared });
      await invite(client, { email: await emailOf(client, TEST_USER_IDS.david), assigneeId: PERSON_ROW });
      await join(client, TEST_USER_IDS.david);
      const { rows } = await client.query<{ user_id: string | null }>(
        "select user_id from public.assignees where id = $1",
        [PERSON_ROW],
      );
      expect(rows[0].user_id).toBeNull();
    });

    await withFixture(async (client) => {
      await addPersonRow(client, { sample: true });
      await invite(client, { email: await emailOf(client, TEST_USER_IDS.david), assigneeId: PERSON_ROW });
      await join(client, TEST_USER_IDS.david);
      expect((await rowsOf(client, TEST_WORKSPACE_IDS.aliceSolo, TEST_USER_IDS.david))[0].id).not.toBe(PERSON_ROW);
    });
  });

  it("keeps a returning member on the row they already have", async () => {
    await withFixture(async (client) => {
      // Charlie is a member of W1 and so has a row; he leaves, is invited from
      // someone else's row, and comes back.
      const before = await rowsOf(client, TEST_WORKSPACE_IDS.aliceSolo, TEST_USER_IDS.charlie);
      expect(before).toHaveLength(1);
      await client.query(
        "delete from public.workspace_members where workspace_id = $1 and user_id = $2",
        [TEST_WORKSPACE_IDS.aliceSolo, TEST_USER_IDS.charlie],
      );
      await addPersonRow(client, { id: OTHER_ROW, name: "Somebody else" });
      await invite(client, { email: await emailOf(client, TEST_USER_IDS.charlie), assigneeId: OTHER_ROW });

      await join(client, TEST_USER_IDS.charlie);

      const after = await rowsOf(client, TEST_WORKSPACE_IDS.aliceSolo, TEST_USER_IDS.charlie);
      expect(after).toHaveLength(1);
      expect(after[0].id).toBe(before[0].id);
      expect(after[0].is_active).toBe(true);
    });
  });

  it("forgets the link when the person's row is deleted", async () => {
    await withFixture(async (client) => {
      await addPersonRow(client);
      await invite(client, { email: await emailOf(client, TEST_USER_IDS.david), assigneeId: PERSON_ROW });
      await client.query("delete from public.assignees where id = $1", [PERSON_ROW]);
      const { rows } = await client.query<{ assignee_id: string | null }>(
        "select assignee_id from public.workspace_invites where workspace_id = $1",
        [TEST_WORKSPACE_IDS.aliceSolo],
      );
      expect(rows[0].assignee_id).toBeNull();
      await join(client, TEST_USER_IDS.david);
      expect(await rowsOf(client, TEST_WORKSPACE_IDS.aliceSolo, TEST_USER_IDS.david)).toHaveLength(1);
    });
  });
});
