import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildStarterTemplatePayload } from "@/shared/domain/starterTemplate";
import { readPoCatalog } from "@/test/helpers/poCatalog";
import {
  TEST_USER_IDS,
  assertCoreSchemaReady,
  closeTestPool,
  getTestPool,
  loadFixture,
  withRollback,
} from "../helpers/setup-test-db";

// Starter templates (0169): a new workspace waits for its owner to pick a
// template, and apply_workspace_template lays it into the empty workspace in
// one go — catalogs replaced, everything else marked as an example.

const translations = vi.hoisted(() => ({ catalog: new Map<string, string>(), missing: [] as string[] }));

vi.mock("@lingui/macro", async () => {
  const helpers = await import("@/test/helpers/poCatalog");
  return { t: helpers.translateThrough(translations) };
});

const { STARTER_TEMPLATES } = await import("@/features/workspace/lib/starterTemplates");

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

const errorCodeOf = async (client: PoolClient, sql: string, params: unknown[] = []) => {
  await client.query("savepoint expect_error");
  try {
    await client.query(sql, params);
    await client.query("release savepoint expect_error");
    return null;
  } catch (error) {
    await client.query("rollback to savepoint expect_error");
    return (error as { code?: string; message?: string }).message ?? "error";
  }
};

const template = {
  statuses: [
    { key: "todo", name: "Planned", emoji: "📝", color: "#94a3b8", is_final: false, is_cancelled: false },
    { key: "doing", name: "Working", emoji: "🚧", color: "#3b82f6", is_final: false, is_cancelled: false },
    { key: "done", name: "Finished", emoji: "✅", color: "#22c55e", is_final: true, is_cancelled: false },
    { key: "cancelled", name: "Dropped", emoji: "🚫", color: "#ef4444", is_final: false, is_cancelled: true },
  ],
  task_types: [{ key: "work", name: "Work" }, { key: "meeting", name: "Sync" }],
  tags: [{ key: "arch", name: "Architecture", color: "#8b5cf6" }],
  projects: [{ key: "house", name: "House by the park", code: "HSE", color: "#3b82f6" }],
  people: [{ key: "anna", name: "Anna Example" }, { key: "tom", name: "Tom Example" }],
  tasks: [
    { title: "Floor plans", project: "house", people: ["anna", "tom"], status: "doing", type: "work", tags: ["arch"], start: -1, end: 2 },
    { title: "Weekly sync", project: null, people: ["anna"], status: "todo", type: "meeting", tags: [], start: 3, end: 3, repeat: "sync", repeat_ends: "after" },
    { title: "Weekly sync", project: null, people: ["anna"], status: "todo", type: "meeting", tags: [], start: 10, end: 10, repeat: "sync", repeat_ends: "after" },
    { title: "Unknown keys stay empty", project: "nope", people: ["ghost"], status: "nope", type: "nope", tags: ["nope"], start: 0, end: 0 },
  ],
  milestones: [{ project: "house", title: "Concept presentation", day: 5 }],
  time_off: [{ person: "tom", start: 8, end: 12, note: "Vacation" }],
};

const createWorkspace = (client: PoolClient, userId = TEST_USER_IDS.alice) => asAuthenticated(client, userId, async () => {
  const { rows } = await client.query<{ id: string }>(`select public.create_workspace('Templates', 'en') as id`);
  return rows[0].id;
});

const applyTemplate = (client: PoolClient, workspaceId: string, userId = TEST_USER_IDS.alice) => (
  asAuthenticated(client, userId, () => errorCodeOf(
    client,
    "select public.apply_workspace_template($1, $2::jsonb)",
    [workspaceId, JSON.stringify(template)],
  ))
);

describe("workspace starter templates (0169)", () => {
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

  it("marks a new workspace as waiting for a template, unless the owner keeps their own", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const pendingId = await createWorkspace(client);

      await client.query(
        `insert into public.user_workspace_templates (user_id, statuses) values ($1, $2::jsonb)`,
        [TEST_USER_IDS.alice, JSON.stringify([{ name: "Mine", color: "#000000" }])],
      );
      const ownTemplateId = await createWorkspace(client);

      const { rows } = await client.query<{ id: string; template_pending: boolean }>(
        `select id, template_pending from public.workspaces where id = any($1)`,
        [[pendingId, ownTemplateId]],
      );
      const pending = Object.fromEntries(rows.map((row) => [row.id, row.template_pending]));
      expect(pending[pendingId]).toBe(true);
      expect(pending[ownTemplateId]).toBe(false);
    });
  });

  // 0170: the template is picked in the "Create workspace" dialog, before the
  // workspace exists, and that choice wins over the saved personal set.
  it("respects an explicit choice made while creating", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const create = (awaitTemplate: boolean) => asAuthenticated(client, TEST_USER_IDS.alice, async () => {
        const { rows } = await client.query<{ id: string }>(
          `select public.create_workspace('Chosen', 'en', $1) as id`,
          [awaitTemplate],
        );
        return rows[0].id;
      });

      const noTemplateId = await create(false);
      await client.query(
        `insert into public.user_workspace_templates (user_id, statuses) values ($1, $2::jsonb)`,
        [TEST_USER_IDS.alice, JSON.stringify([{ name: "Mine", color: "#000000" }])],
      );
      const templateId = await create(true);

      const { rows } = await client.query<{ id: string; template_pending: boolean }>(
        `select id, template_pending from public.workspaces where id = any($1)`,
        [[noTemplateId, templateId]],
      );
      const pending = Object.fromEntries(rows.map((row) => [row.id, row.template_pending]));
      expect(pending[noTemplateId]).toBe(false);
      expect(pending[templateId]).toBe(true);
      expect(await applyTemplate(client, templateId)).toBeNull();
    });
  });

  it("no longer seeds examples into the first workspace by itself", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      // Charlie is only an editor in someone else's workspace: without that
      // membership he is a newcomer with no workspace of his own.
      await client.query(`delete from public.workspace_members where user_id = $1`, [TEST_USER_IDS.charlie]);
      const workspaceId = await asAuthenticated(client, TEST_USER_IDS.charlie, async () => {
        const { rows } = await client.query<{ id: string }>(
          `select public.ensure_initial_workspace('My Workspace', 'en') as id`,
        );
        return rows[0].id;
      });

      const { rows } = await client.query<{ tasks: string; pending: boolean }>(
        `select (select count(*) from public.tasks where workspace_id = $1)::text as tasks,
                (select template_pending from public.workspaces where id = $1) as pending`,
        [workspaceId],
      );
      expect(rows[0]).toEqual({ tasks: "0", pending: true });
    });
  });

  it("replaces the catalogs and lays the examples in, linked by key", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const workspaceId = await createWorkspace(client);

      expect(await applyTemplate(client, workspaceId)).toBeNull();

      const { rows: statuses } = await client.query<{ name: string }>(
        `select name from public.statuses where workspace_id = $1 order by name`,
        [workspaceId],
      );
      expect(statuses.map((row) => row.name)).toEqual(["Dropped", "Finished", "Planned", "Working"]);

      const { rows: tasks } = await client.query<{
        title: string; is_sample: boolean; people: number; tags: number;
        project: string | null; status: string; type: string; repeat_id: string | null;
      }>(
        `select t.title, t.is_sample, cardinality(t.assignee_ids) as people, cardinality(t.tag_ids) as tags,
                p.name as project, s.name as status, tt.name as type, t.repeat_id
           from public.tasks t
           left join public.projects p on p.id = t.project_id
           join public.statuses s on s.id = t.status_id
           join public.task_types tt on tt.id = t.type_id
          where t.workspace_id = $1
          order by t.start_date, t.title`,
        [workspaceId],
      );
      expect(tasks.every((task) => task.is_sample)).toBe(true);
      expect(tasks.find((task) => task.title === "Floor plans")).toMatchObject({
        people: 2, tags: 1, project: "House by the park", status: "Working", type: "Work",
      });
      // Unknown keys leave a link empty and fall back to the first open status / first type.
      expect(tasks.find((task) => task.title === "Unknown keys stay empty")).toMatchObject({
        people: 0, tags: 0, project: null, status: "Planned", type: "Work",
      });
      const repeats = tasks.filter((task) => task.title === "Weekly sync");
      expect(repeats).toHaveLength(2);
      expect(repeats[0].repeat_id).not.toBeNull();
      expect(repeats[1].repeat_id).toBe(repeats[0].repeat_id);

      const { rows: extras } = await client.query<{ milestones: string; time_off: string; pending: boolean }>(
        `select (select count(*) from public.milestones where workspace_id = $1 and is_sample)::text as milestones,
                (select count(*) from public.time_off where workspace_id = $1)::text as time_off,
                (select template_pending from public.workspaces where id = $1) as pending`,
        [workspaceId],
      );
      expect(extras[0]).toEqual({ milestones: "1", time_off: "1", pending: false });
    });
  });

  it("is refused for a second time, for a stranger and for anon", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const workspaceId = await createWorkspace(client);

      expect(await applyTemplate(client, workspaceId, TEST_USER_IDS.bob)).toMatch(/not allowed/);
      expect(await applyTemplate(client, workspaceId)).toBeNull();
      expect(await applyTemplate(client, workspaceId)).toMatch(/not waiting for a template/);

      await client.query("set local role anon");
      const anonError = await errorCodeOf(
        client,
        "select public.apply_workspace_template($1, '{}'::jsonb)",
        [workspaceId],
      );
      await client.query("reset role");
      expect(anonError).toMatch(/permission denied/);
    });
  });

  it("refuses to replace the catalogs of a workspace that already has work", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const workspaceId = await createWorkspace(client);
      await client.query(
        `insert into public.projects (workspace_id, name, color) values ($1, 'Real project', '#000000')`,
        [workspaceId],
      );

      expect(await applyTemplate(client, workspaceId)).toMatch(/not empty/);
    });
  });

  /**
   * The real templates, built in each interface language exactly as the client
   * builds them, must go into the database whole: unique status names, time
   * off that does not overlap, every link resolved.
   */
  it.each(["en", "ru", "de"])("lays every real template into the database in %s", async (locale) => {
    translations.catalog = readPoCatalog(locale);
    for (const starter of STARTER_TEMPLATES) {
      await withRollback(async (client) => {
        await loadFixture(client, "account-deletion.sql");
        const workspaceId = await createWorkspace(client);
        const payload = buildStarterTemplatePayload(starter.build(), new Date());

        const failure = await asAuthenticated(client, TEST_USER_IDS.alice, () => errorCodeOf(
          client,
          "select public.apply_workspace_template($1, $2::jsonb)",
          [workspaceId, JSON.stringify(payload)],
        ));
        expect(failure, `${starter.id} in ${locale}`).toBeNull();

        const { rows } = await client.query<{ tasks: number; unlinked: number }>(
          `select count(*)::int as tasks,
                  count(*) filter (
                    where cardinality(assignee_ids) = 0
                       or (project_id is null and repeat_id is null)
                  )::int as unlinked
             from public.tasks where workspace_id = $1`,
          [workspaceId],
        );
        expect(rows[0].tasks, `${starter.id} in ${locale}`).toBe(payload.tasks.length);
        // Every example has someone on it, and only series may stand outside a project.
        expect(rows[0].unlinked, `${starter.id} in ${locale}`).toBe(starter.id === "bim" ? 1 : 0);
      });
    }
  });

  it("takes every example away with 'Remove examples', the time off of fictional people included", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const workspaceId = await createWorkspace(client);
      await applyTemplate(client, workspaceId);

      await asAuthenticated(client, TEST_USER_IDS.alice, () => (
        client.query(`select public.clear_workspace_sample_data($1)`, [workspaceId])
      ));

      const { rows } = await client.query<Record<string, string>>(
        `select (select count(*) from public.tasks where workspace_id = $1)::text as tasks,
                (select count(*) from public.projects where workspace_id = $1)::text as projects,
                (select count(*) from public.milestones where workspace_id = $1)::text as milestones,
                (select count(*) from public.assignees where workspace_id = $1 and is_sample)::text as people,
                (select count(*) from public.time_off where workspace_id = $1)::text as time_off,
                (select count(*) from public.statuses where workspace_id = $1)::text as statuses`,
        [workspaceId],
      );
      // The template's catalogs are what the team keeps working with.
      expect(rows[0]).toEqual({
        tasks: "0", projects: "0", milestones: "0", people: "0", time_off: "0", statuses: "4",
      });
    });
  });
});
