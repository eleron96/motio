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

// Workspace API, reading (0187): token scopes and the api_* functions behind
// GET /members, /projects, /tasks, /tasks/{id} and /milestones. Every function
// is bound to the workspace it is given and runs only as service_role.

const W1 = TEST_WORKSPACE_IDS.aliceSolo; // Alice admin, Charlie editor
const W2 = TEST_WORKSPACE_IDS.bobShared; // Bob and Charlie

async function asAuthenticated<T>(client: PoolClient, userId: string, fn: () => Promise<T>): Promise<T> {
  await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
  await client.query("set local role authenticated");
  try {
    return await fn();
  } finally {
    await client.query("reset role");
  }
}

async function asServiceRole<T>(client: PoolClient, fn: () => Promise<T>): Promise<T> {
  await client.query("set local role service_role");
  try {
    return await fn();
  } finally {
    await client.query("reset role");
  }
}

async function expectRejected(client: PoolClient, run: () => Promise<unknown>): Promise<string> {
  await client.query("savepoint guard_sp");
  let code = "";
  try {
    await run();
  } catch (error) {
    code = (error as { code?: string }).code ?? "unknown";
  }
  await client.query(code ? "rollback to savepoint guard_sp" : "release savepoint guard_sp");
  expect(code, "expected the statement to be rejected").not.toBe("");
  return code;
}

const one = async (client: PoolClient, sql: string, params: unknown[] = []): Promise<string> => {
  const { rows } = await client.query<{ id: string }>(sql, params);
  return rows[0].id;
};

type Seeded = {
  project: string;
  otherProject: string;
  tasks: string[];
  foreignTask: string;
  external: string;
  alice: string;
};

// Three tasks, two projects and a milestone in W1; one of each in W2, which a
// W1 token must never see.
const seed = async (client: PoolClient): Promise<Seeded> => {
  const ids = async (workspace: string) => ({
    status: await one(client, "insert into public.statuses (workspace_id, name, color, is_final) values ($1, 'Done', '#22c55e', true) returning id", [workspace]),
    type: await one(client, "insert into public.task_types (workspace_id, name) values ($1, 'Review') returning id", [workspace]),
  });
  const w1 = await ids(W1);
  const w2 = await ids(W2);
  const customer = await one(client, "insert into public.customers (workspace_id, name) values ($1, 'North') returning id", [W1]);
  const project = await one(client, "insert into public.projects (workspace_id, name, color, code, customer_id) values ($1, 'Bridge', '#3b82f6', 'BR', $2) returning id", [W1, customer]);
  const otherProject = await one(client, "insert into public.projects (workspace_id, name, color, archived) values ($1, 'Archive', '#64748b', true) returning id", [W1]);
  const foreignProject = await one(client, "insert into public.projects (workspace_id, name, color) values ($1, 'Foreign', '#ef4444') returning id", [W2]);
  const tag = await one(client, "insert into public.tags (workspace_id, name, color) values ($1, 'urgent', '#ef4444') returning id", [W1]);
  const alice = await one(client, "select id from public.assignees where workspace_id = $1 and user_id = $2", [W1, TEST_USER_IDS.alice]);
  const external = await one(client, "insert into public.assignees (workspace_id, name) values ($1, 'Outside Person') returning id", [W1]);

  const task = (workspace: string, refs: { status: string; type: string }, title: string, start: string, end: string, projectId: string | null, assignees: string[], tags: string[]) =>
    one(
      client,
      `insert into public.tasks (workspace_id, title, start_date, end_date, status_id, type_id, project_id, assignee_ids, tag_ids, description)
       values ($1, $2, $3, $4, $5, $6, $7, $8::uuid[], $9::uuid[], $10) returning id`,
      [workspace, title, start, end, refs.status, refs.type, projectId, assignees, tags, `<p>${title}</p>`],
    );
  const tasks = [
    await task(W1, w1, "First", "2031-05-01", "2031-05-03", project, [alice], [tag]),
    await task(W1, w1, "Second", "2031-05-05", "2031-05-09", project, [external], []),
    await task(W1, w1, "Third", "2031-05-05", "2031-05-06", otherProject, [], []),
  ];
  const foreignTask = await task(W2, w2, "Foreign task", "2031-05-02", "2031-05-04", foreignProject, [], []);
  await client.query(
    "insert into public.task_subtasks (workspace_id, task_id, title, is_done, done_at, position) values ($1, $2, 'Check the drawings', true, now(), 0)",
    [W1, tasks[0]],
  );
  await client.query("insert into public.milestones (workspace_id, project_id, date, title) values ($1, $2, '2031-05-10', 'Handover')", [W1, project]);
  await client.query("insert into public.milestones (workspace_id, project_id, date, title) values ($1, $2, '2031-05-10', 'Foreign milestone')", [W2, foreignProject]);
  return { project, otherProject, tasks, foreignTask, external, alice };
};

async function withSeed<T>(fn: (client: PoolClient, seeded: Seeded) => Promise<T>): Promise<T> {
  return withRollback(async (client) => {
    await loadFixture(client, "account-deletion.sql");
    return fn(client, await seed(client));
  });
}

const LIST_TASKS = `select id, title, start_date::text, status, is_done, type, tags, assignee_ids
  from public.api_list_tasks($1, $2, $3, $4, $5, $6, $7, $8, $9)`;

type TaskRow = { id: string; title: string; start_date: string; status: string | null; is_done: boolean; type: string | null; tags: string[]; assignee_ids: string[] };

const listTasks = async (client: PoolClient, workspace: string, args: Partial<{
  from: string; to: string; project: string; assignee: string; since: string; afterDate: string; afterId: string; limit: number;
}> = {}) => {
  const { rows } = await asServiceRole(client, () => client.query<TaskRow>(LIST_TASKS, [
    workspace, args.from ?? null, args.to ?? null, args.project ?? null, args.assignee ?? null,
    args.since ?? null, args.afterDate ?? null, args.afterId ?? null, args.limit ?? null,
  ]));
  return rows;
};

describe("workspace API: scopes and reading (0187)", () => {
  beforeAll(async () => {
    const client = await getTestPool().connect();
    try {
      await assertCoreSchemaReady(client);
      const { rows } = await client.query<{ present: boolean }>(
        "select to_regprocedure('public.api_token_access(text)') is not null as present",
      );
      if (!rows[0]?.present) throw new Error("0187 not applied: api_token_access is missing");
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await closeTestPool();
  });

  it("keeps the read functions away from clients", async () => {
    await withRollback(async (client) => {
      const functions = [
        "api_token_access(text)",
        "api_get_workspace(uuid)",
        "api_list_members(uuid)",
        "api_list_projects(uuid,boolean)",
        "api_list_tasks(uuid,date,date,uuid,uuid,timestamptz,date,uuid,integer)",
        "api_get_task(uuid,uuid)",
        "api_list_milestones(uuid,date,date,uuid,date,uuid,integer)",
      ];
      for (const fn of functions) {
        const { rows } = await client.query<{ anon: boolean; auth: boolean; service: boolean }>(
          `select has_function_privilege('anon', $1, 'EXECUTE') as anon,
                  has_function_privilege('authenticated', $1, 'EXECUTE') as auth,
                  has_function_privilege('service_role', $1, 'EXECUTE') as service`,
          [`public.${fn}`],
        );
        expect(rows[0], fn).toEqual({ anon: false, auth: false, service: true });
      }
    });
  });

  it("gives a token only the scopes chosen for it; older calls get time_off alone", async () => {
    await withSeed(async (client) => {
      const create = (sql: string, params: unknown[]) =>
        asAuthenticated(client, TEST_USER_IDS.alice, async () => {
          const { rows } = await client.query<{ id: string; token: string; scopes: string[] }>(sql, params);
          return rows[0];
        });
      const legacy = await create("select * from public.create_workspace_api_token($1, 'HR sync')", [W1]);
      expect(legacy.scopes).toEqual(["time_off"]);
      const both = await create(
        "select * from public.create_workspace_api_token($1, 'Reports', $2::text[])",
        [W1, ["time_off", "read", "read"]],
      );
      expect(both.scopes).toEqual(["read", "time_off"]);

      for (const scopes of [[], ["admin"], ["read", "tasks:write"]]) {
        const code = await asAuthenticated(client, TEST_USER_IDS.alice, () =>
          expectRejected(client, () =>
            client.query("select * from public.create_workspace_api_token($1, 'Bad', $2::text[])", [W1, scopes])),
        );
        expect(code, JSON.stringify(scopes)).toBe("22023");
      }

      const access = async (token: string) => {
        const { rows } = await asServiceRole(client, () =>
          client.query<{ workspace_id: string; scopes: string[] }>(
            "select * from public.api_token_access(encode(sha256(convert_to($1, 'UTF8')), 'hex'))",
            [token],
          ));
        return rows;
      };
      expect(await access(legacy.token)).toEqual([{ workspace_id: W1, scopes: ["time_off"] }]);
      expect(await access(both.token)).toEqual([{ workspace_id: W1, scopes: ["read", "time_off"] }]);

      const listed = await asAuthenticated(client, TEST_USER_IDS.alice, () =>
        client.query<{ name: string; scopes: string[] }>(
          "select name, scopes from public.list_workspace_api_tokens($1) order by name", [W1]));
      expect(listed.rows).toEqual([
        { name: "HR sync", scopes: ["time_off"] },
        { name: "Reports", scopes: ["read", "time_off"] },
      ]);

      await asAuthenticated(client, TEST_USER_IDS.alice, () =>
        client.query("select public.revoke_workspace_api_token($1)", [both.id]));
      expect(await access(both.token)).toEqual([]);
      expect(await access(`motio_${"0".repeat(64)}`)).toEqual([]);
    });
  });

  it("never returns another workspace's people, projects, tasks or milestones", async () => {
    await withSeed(async (client, seeded) => {
      const names = async (sql: string) => {
        const { rows } = await asServiceRole(client, () => client.query<{ label: string }>(sql, [W1]));
        return rows.map((row) => row.label);
      };
      expect((await listTasks(client, W1)).map((row) => row.title).sort()).toEqual(["First", "Second", "Third"]);
      expect(await names("select name as label from public.api_list_projects($1, null)")).toEqual(["Archive", "Bridge"]);
      expect(await names("select title as label from public.api_list_milestones($1, null, null, null, null, null, null)")).toEqual(["Handover"]);
      expect(await names("select name as label from public.api_get_workspace($1)")).toEqual(["Alice Solo"]);

      const { rows: foreign } = await asServiceRole(client, () =>
        client.query<{ task: unknown }>("select public.api_get_task($1, $2) as task", [W1, seeded.foreignTask]));
      expect(foreign[0].task).toBeNull();
      const { rows: own } = await asServiceRole(client, () =>
        client.query<{ task: unknown }>("select public.api_get_task($1, $2) as task", [W2, seeded.foreignTask]));
      expect(own[0].task).toMatchObject({ title: "Foreign task" });
    });
  });

  it("lists people with the account email, and without one for people added by hand", async () => {
    await withSeed(async (client) => {
      const { rows } = await asServiceRole(client, () =>
        client.query<{ name: string; email: string | null; role: string | null; has_account: boolean }>(
          "select name, email, role, has_account from public.api_list_members($1)", [W1]));
      expect(rows).toContainEqual({ name: "Outside Person", email: null, role: null, has_account: false });
      expect(rows.filter((row) => row.has_account).map((row) => [row.email, row.role]).sort()).toEqual([
        ["alice@fixture.local", "admin"],
        ["charlie@fixture.local", "editor"],
      ]);
    });
  });

  it("gives out an account's email only while the account is a member", async () => {
    await withSeed(async (client) => {
      // Charlie leaves W1: his row stays on the timeline, his address must not.
      await client.query("delete from public.workspace_members where workspace_id = $1 and user_id = $2", [W1, TEST_USER_IDS.charlie]);
      const charlie = await one(client, "select id from public.assignees where workspace_id = $1 and user_id = $2", [W1, TEST_USER_IDS.charlie]);
      await client.query(
        "insert into public.time_off (workspace_id, assignee_id, start_date, end_date) values ($1, $2, '2031-06-01', '2031-06-02')",
        [W1, charlie],
      );

      const { rows: members } = await asServiceRole(client, () =>
        client.query<{ id: string; email: string | null; role: string | null; has_account: boolean }>(
          "select id, email, role, has_account from public.api_list_members($1)", [W1]));
      expect(members.find((row) => row.id === charlie)).toEqual({ id: charlie, email: null, role: null, has_account: true });
      expect(members.filter((row) => row.email).map((row) => row.email)).toEqual(["alice@fixture.local"]);

      const { rows: absences } = await asServiceRole(client, () =>
        client.query<{ email: string | null; person: string }>(
          "select email, person from public.api_list_time_off($1, '2031-06-01', '2031-06-30')", [W1]));
      expect(absences).toHaveLength(1);
      expect(absences[0].email).toBeNull();
    });
  });

  it("calls a cancelled task cancelled, not done", async () => {
    await withSeed(async (client, seeded) => {
      const cancelled = await one(
        client,
        "insert into public.statuses (workspace_id, name, color, is_final, is_cancelled) values ($1, 'Cancelled', '#94a3b8', true, true) returning id",
        [W1],
      );
      await client.query("update public.tasks set status_id = $1 where id = $2", [cancelled, seeded.tasks[1]]);

      const flags = (await listTasks(client, W1)).map((row) => [row.title, row.is_done]);
      expect(flags).toEqual(expect.arrayContaining([["First", true], ["Second", false]]));
      const { rows } = await asServiceRole(client, () =>
        client.query<{ task: { is_done: boolean; is_cancelled: boolean } }>(
          "select public.api_get_task($1, $2) as task", [W1, seeded.tasks[1]]));
      expect(rows[0].task).toMatchObject({ status: "Cancelled", is_done: false, is_cancelled: true });
    });
  });

  it("does not name another workspace's status, type or customer even if a row points at one", async () => {
    await withSeed(async (client, seeded) => {
      // The foreign keys are on the id alone, so nothing in the schema forbids
      // these references.
      const foreignStatus = await one(client, "insert into public.statuses (workspace_id, name, color) values ($1, 'W2 secret status', '#000000') returning id", [W2]);
      const foreignType = await one(client, "insert into public.task_types (workspace_id, name) values ($1, 'W2 secret type') returning id", [W2]);
      const foreignCustomer = await one(client, "insert into public.customers (workspace_id, name) values ($1, 'W2 secret customer') returning id", [W2]);
      await client.query("update public.tasks set status_id = $1, type_id = $2 where id = $3", [foreignStatus, foreignType, seeded.tasks[2]]);
      await client.query("update public.projects set customer_id = $1 where id = $2", [foreignCustomer, seeded.project]);

      const third = (await listTasks(client, W1)).find((row) => row.id === seeded.tasks[2]);
      expect(third).toMatchObject({ title: "Third", status: null, type: null, is_done: false });
      const { rows: one_ } = await asServiceRole(client, () =>
        client.query<{ task: Record<string, unknown> }>("select public.api_get_task($1, $2) as task", [W1, seeded.tasks[2]]));
      expect(one_[0].task).toMatchObject({ title: "Third", status: null, type: null });
      const { rows: projects } = await asServiceRole(client, () =>
        client.query<{ name: string; customer: string | null; customer_id: string | null }>(
          "select name, customer, customer_id from public.api_list_projects($1, null)", [W1]));
      expect(projects.find((row) => row.name === "Bridge")).toEqual({ name: "Bridge", customer: null, customer_id: null });
    });
  });

  it("filters tasks and pages through them in a stable order", async () => {
    await withSeed(async (client, seeded) => {
      const all = await listTasks(client, W1);
      expect(all.map((row) => row.start_date)).toEqual(["2031-05-01", "2031-05-05", "2031-05-05"]);
      expect(all[0]).toMatchObject({ title: "First", status: "Done", is_done: true, type: "Review", tags: ["urgent"], assignee_ids: [seeded.alice] });

      // Page size 2: the caller asks for three rows and keeps two.
      const first = await listTasks(client, W1, { limit: 3 });
      expect(first).toHaveLength(3);
      const last = first[1];
      const second = await listTasks(client, W1, { limit: 3, afterDate: last.start_date, afterId: last.id });
      expect(second.map((row) => row.id)).toEqual([first[2].id]);

      expect((await listTasks(client, W1, { from: "2031-05-04", to: "2031-05-05" })).map((row) => row.title).sort()).toEqual(["Second", "Third"]);
      expect((await listTasks(client, W1, { to: "2031-05-02" })).map((row) => row.title)).toEqual(["First"]);
      expect((await listTasks(client, W1, { project: seeded.otherProject })).map((row) => row.title)).toEqual(["Third"]);
      expect((await listTasks(client, W1, { assignee: seeded.external })).map((row) => row.title)).toEqual(["Second"]);
      expect(await listTasks(client, W1, { since: "2999-01-01T00:00:00Z" })).toEqual([]);
      // Microseconds count: "since the updated_at I last saw, plus a little" must not return that row again.
      const { rows: stamp } = await client.query<{ at: string; later: string }>(
        `select to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as at,
                to_char((updated_at + interval '1 microsecond') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as later
           from public.tasks where id = $1`, [seeded.tasks[0]]);
      expect((await listTasks(client, W1, { since: stamp[0].at })).map((row) => row.id)).toContain(seeded.tasks[0]);
      expect(await listTasks(client, W1, { since: stamp[0].later })).toEqual([]);
      expect(await listTasks(client, W1, { limit: 100000 })).toHaveLength(3);
    });
  });

  it("returns one task with its description and checklist", async () => {
    await withSeed(async (client, seeded) => {
      const { rows } = await asServiceRole(client, () =>
        client.query<{ task: Record<string, unknown> }>("select public.api_get_task($1, $2) as task", [W1, seeded.tasks[0]]));
      expect(rows[0].task).toMatchObject({
        id: seeded.tasks[0],
        title: "First",
        project_id: seeded.project,
        start_date: "2031-05-01",
        end_date: "2031-05-03",
        description: "<p>First</p>",
        tags: ["urgent"],
        subtasks: [{ title: "Check the drawings", is_done: true }],
      });
    });
  });

  it("lists projects with their customer and filters archived ones", async () => {
    await withSeed(async (client) => {
      const list = async (archived: boolean | null) => {
        const { rows } = await asServiceRole(client, () =>
          client.query<{ name: string; code: string | null; customer: string | null; archived: boolean }>(
            "select name, code, customer, archived from public.api_list_projects($1, $2)", [W1, archived]));
        return rows;
      };
      expect(await list(false)).toEqual([{ name: "Bridge", code: "BR", customer: "North", archived: false }]);
      expect((await list(true)).map((row) => row.name)).toEqual(["Archive"]);
      expect(await list(null)).toHaveLength(2);
    });
  });
});
