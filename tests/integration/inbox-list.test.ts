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

// 0166: inbox_list is the bell's single read — pending invites, the user's
// notifications and (on request) the invites they sent — in one query.

const W1 = TEST_WORKSPACE_IDS.aliceSolo; // Alice admin, Charlie editor
const W2 = TEST_WORKSPACE_IDS.bobShared; // Bob admin, Charlie admin
const W3 = TEST_WORKSPACE_IDS.davidAlone; // David only — Charlie is NOT a member
const { alice, bob, charlie, david } = TEST_USER_IDS;

type InboxResult = {
  invites: Array<Record<string, unknown>>;
  notifications: Array<Record<string, unknown>>;
  sentInvites: Array<Record<string, unknown>>;
};

async function inboxAs(client: PoolClient, userId: string | null, includeSent = false): Promise<InboxResult> {
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
  await client.query(userId ? "set local role authenticated" : "set local role anon");
  const { rows } = await client.query<{ result: InboxResult }>(
    "select public.inbox_list(60, 80, 120, $1) as result",
    [includeSent],
  );
  await client.query("reset role");
  return rows[0].result;
}

async function seedCatalog(client: PoolClient, workspaceId: string) {
  const status = await client.query<{ id: string }>(
    "insert into public.statuses (workspace_id, name, color) values ($1, 'Inbox open', '#94a3b8') returning id",
    [workspaceId],
  );
  const type = await client.query<{ id: string }>(
    "insert into public.task_types (workspace_id, name) values ($1, 'Inbox type') returning id",
    [workspaceId],
  );
  return { statusId: status.rows[0].id, typeId: type.rows[0].id };
}

async function createTask(client: PoolClient, workspaceId: string, title: string, startDate: string) {
  const { statusId, typeId } = await seedCatalog(client, workspaceId);
  const { rows } = await client.query<{ id: string }>(
    `insert into public.tasks (workspace_id, title, start_date, end_date, status_id, type_id)
     values ($1, $2, $3::date, $3::date, $4, $5) returning id`,
    [workspaceId, title, startDate, statusId, typeId],
  );
  return rows[0].id;
}

async function notify(
  client: PoolClient,
  row: {
    workspaceId: string | null;
    actor: string | null;
    type: string;
    taskId?: string | null;
    title?: string | null;
    startDate?: string | null;
    commentPreview?: string | null;
    minutesAgo: number;
    read?: boolean;
    deleted?: boolean;
  },
) {
  await client.query(
    `insert into public.user_notifications (
       recipient_user_id, workspace_id, actor_user_id, type, task_id,
       task_title_snapshot, task_start_date_snapshot, comment_preview,
       created_at, read_at, deleted_at
     ) values ($1, $2, $3, $4, $5, $6, $7::date, $8,
       now() - make_interval(mins => $9),
       case when $10 then now() end,
       case when $11 then now() end)`,
    [
      charlie, row.workspaceId, row.actor, row.type, row.taskId ?? null,
      row.title ?? null, row.startDate ?? null, row.commentPreview ?? null,
      row.minutesAgo, row.read ?? false, row.deleted ?? false,
    ],
  );
}

async function seedNotifications(client: PoolClient) {
  const liveTask = await createTask(client, W1, "Release plan (live title)", "2026-11-03");
  const otherTask = await createTask(client, W2, "Bug bash", "2026-11-05");
  const hiddenTask = await createTask(client, W3, "Secret", "2026-11-07");
  // Triggers on tasks may already have written notifications; start clean.
  await client.query("delete from public.user_notifications where recipient_user_id = $1", [charlie]);

  await notify(client, { workspaceId: W1, actor: alice, type: "task_assigned", taskId: liveTask, title: "Release plan (old)", startDate: "2026-11-01", minutesAgo: 1 });
  await notify(client, { workspaceId: W2, actor: bob, type: "comment_mention", taskId: otherTask, title: "Bug bash", commentPreview: "@Charlie look", minutesAgo: 2, read: true });
  await notify(client, { workspaceId: W2, actor: bob, type: "task_updated", taskId: null, title: "Deleted task", startDate: "2026-10-01", commentPreview: "must not show", minutesAgo: 3 });
  await notify(client, { workspaceId: W3, actor: david, type: "task_assigned", taskId: hiddenTask, title: "Secret", minutesAgo: 4 });
  await notify(client, { workspaceId: null, actor: null, type: "export_ready", title: null, commentPreview: "Your export is ready", minutesAgo: 5 });
  await notify(client, { workspaceId: W1, actor: alice, type: "deadline_approaching", taskId: liveTask, minutesAgo: 6 });
  await notify(client, { workspaceId: W1, actor: alice, type: "task_assigned", taskId: liveTask, title: "Deleted from inbox", minutesAgo: 7, deleted: true });
}

// Every notification the client parses (inboxRepository.parseTaskNotifications).
const NOTIFICATION_KEYS = [
  "actorDisplayName", "actorEmail", "actorUserId", "commentId", "commentPreview", "createdAt",
  "id", "readAt", "taskExists", "taskId", "taskStartDate", "taskTitle", "type",
  "workspaceId", "workspaceName",
];

describe("inbox_list (0166)", () => {
  beforeAll(async () => {
    const client = await getTestPool().connect();
    try {
      await assertCoreSchemaReady(client);
      const { rows } = await client.query<{ present: boolean }>(
        "select to_regprocedure('public.inbox_list(integer, integer, integer, boolean)') is not null as present",
      );
      if (!rows[0]?.present) throw new Error("0166 not applied: inbox_list is missing");
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await closeTestPool();
  });

  it("returns the visible notifications newest first, in the shape the client reads", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      await seedNotifications(client);

      const { notifications } = await inboxAs(client, charlie);

      expect(notifications.map((n) => n.type)).toEqual(["task_assigned", "comment_mention", "task_updated", "export_ready"]);
      for (const notification of notifications) {
        expect(Object.keys(notification).sort()).toEqual(NOTIFICATION_KEYS);
        expect(Date.parse(String(notification.createdAt))).not.toBeNaN();
      }
    });
  });

  it("covers every rule of the bell", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      await seedNotifications(client);
      const [assigned, mention, updated, exported] = (await inboxAs(client, charlie)).notifications;

      // Live task wins over the snapshot; actor comes from profiles.
      expect(assigned).toMatchObject({
        workspaceId: W1, workspaceName: "Alice Solo", actorUserId: alice, actorDisplayName: "Alice Fixture",
        actorEmail: "alice@fixture.local", taskTitle: "Release plan (live title)", taskStartDate: "2026-11-03",
        taskExists: true, commentId: null, commentPreview: null, readAt: null,
      });
      expect(mention).toMatchObject({ type: "comment_mention", commentPreview: "@Charlie look" });
      expect(mention.readAt).toEqual(expect.any(String));
      // A task that is gone falls back to the snapshot; non-mention previews are hidden.
      expect(updated).toMatchObject({ taskId: null, taskExists: false, taskTitle: "Deleted task", taskStartDate: "2026-10-01", commentPreview: null });
      // Account-level rows: no workspace, empty name, the export text as preview.
      expect(exported).toMatchObject({ workspaceId: null, workspaceName: "", taskTitle: "Untitled task", commentPreview: "Your export is ready" });
      // Dropped: not-a-member workspace (W3), retired type, deleted row.
      const titles = (await inboxAs(client, charlie)).notifications.map((n) => n.taskTitle);
      expect(titles).not.toContain("Secret");
      expect(titles).not.toContain("Deleted from inbox");
    });
  });

  it("lists pending invites to the user's email with the inviter", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      await client.query(
        `insert into public.workspace_invites (workspace_id, email, email_normalized, role, invited_by, created_at, expires_at, accepted_at, revoked_at)
         values
           ($1, ' Charlie@Fixture.local ', 'charlie@fixture.local', 'editor', $2, now() - interval '1 hour', now() + interval '3 days', null, null),
           ($1, 'charlie@fixture.local', 'charlie@fixture.local', 'viewer', $2, now() - interval '3 hours', now() + interval '3 days', now(), null),
           ($1, 'charlie@fixture.local', 'charlie@fixture.local', 'viewer', $2, now() - interval '4 hours', now() + interval '3 days', null, now())`,
        [W3, david],
      );
      // An expired one is still "active" for the uniqueness rule, so it lives
      // in another workspace.
      await client.query(
        `insert into public.workspace_invites (workspace_id, email, email_normalized, role, invited_by, created_at, expires_at)
         values ($1, 'charlie@fixture.local', 'charlie@fixture.local', 'viewer', $2, now() - interval '2 hours', now() - interval '1 minute')`,
        [W1, alice],
      );
      const { invites } = await inboxAs(client, charlie);
      expect(invites).toEqual([
        expect.objectContaining({
          workspaceId: W3, workspaceName: "David Alone", role: "editor",
          inviterDisplayName: "David Fixture", inviterEmail: "david@fixture.local",
          token: expect.any(String),
        }),
      ]);
      // Not addressed to Bob.
      expect((await inboxAs(client, bob)).invites).toEqual([]);
    });
  });

  it("returns sent invites with their status only when asked", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      await client.query(
        `insert into public.workspace_invites (workspace_id, email, email_normalized, role, invited_by, created_at, expires_at, accepted_at, revoked_at, revoked_reason)
         values
           ($1, 'p1@example.test', 'p1@example.test', 'viewer', $2, now() - interval '1 hour',  now() + interval '3 days', null, null, null),
           ($1, 'p2@example.test', 'p2@example.test', 'viewer', $2, now() - interval '2 hours', now() + interval '3 days', now() - interval '30 minutes', null, null),
           ($1, 'p3@example.test', 'p3@example.test', 'viewer', $2, now() - interval '3 hours', now() + interval '3 days', null, now() - interval '20 minutes', 'declined'),
           ($1, 'p4@example.test', 'p4@example.test', 'viewer', $2, now() - interval '4 hours', now() + interval '3 days', null, now() - interval '10 minutes', 'canceled'),
           ($1, 'p5@example.test', 'p5@example.test', 'viewer', $2, now() - interval '5 hours', now() - interval '1 minute', null, null, null),
           ($1, 'p6@example.test', 'p6@example.test', 'viewer', $2, now() - interval '100 days', now() + interval '3 days', null, null, null)`,
        [W2, bob],
      );
      expect((await inboxAs(client, bob, false)).sentInvites).toEqual([]);
      const { sentInvites } = await inboxAs(client, bob, true);
      expect(sentInvites.map((i) => [i.email, i.status, i.respondedAt === null])).toEqual([
        ["p1@example.test", "pending", true],
        ["p2@example.test", "accepted", false],
        ["p3@example.test", "declined", false],
        ["p4@example.test", "canceled", false],
        ["p5@example.test", "expired", false],
      ]);
      expect(sentInvites[0]).toMatchObject({ workspaceId: W2, workspaceName: "Bob Shared" });
    });
  });

  it("refuses anon and shows nobody else's bell", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      await seedNotifications(client);

      await client.query("savepoint anon_try");
      let code = "";
      try {
        await inboxAs(client, null);
      } catch (error) {
        code = (error as { code?: string }).code ?? "unknown";
      }
      await client.query("rollback to savepoint anon_try");
      expect(code).toBe("42501");

      // Alice gets her own (empty) bell, never Charlie's rows.
      expect((await inboxAs(client, alice)).notifications).toEqual([]);

      const { rows } = await client.query<{ anon: boolean; authenticated: boolean }>(
        `select has_function_privilege('anon', 'public.inbox_list(integer, integer, integer, boolean)', 'execute') as anon,
                has_function_privilege('authenticated', 'public.inbox_list(integer, integer, integer, boolean)', 'execute') as authenticated`,
      );
      expect(rows[0]).toEqual({ anon: false, authenticated: true });
    });
  });
});
