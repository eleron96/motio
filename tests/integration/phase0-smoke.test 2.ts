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

describe("Phase 0 smoke — integration test plumbing", () => {
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

  it("connects to the test DB", async () => {
    const result = await getTestPool().query<{ ok: number }>("select 1 as ok");
    expect(result.rows[0]?.ok).toBe(1);
  });

  it("core tables exist (profiles, workspaces, workspace_members)", async () => {
    const { rows } = await getTestPool().query<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema = 'public'
          and table_name in ('profiles', 'workspaces', 'workspace_members')
        order by table_name`,
    );
    expect(rows.map((row) => row.table_name)).toEqual([
      "profiles",
      "workspace_members",
      "workspaces",
    ]);
  });

  it("withRollback isolates writes from the DB", async () => {
    const probeId = "99999999-9999-9999-9999-000000000001";

    await withRollback(async (client) => {
      await client.query(
        `insert into auth.users (id, email, aud, role, instance_id)
         values ($1, 'smoke-probe@fixture.local', 'authenticated', 'authenticated',
                 '00000000-0000-0000-0000-000000000000')`,
        [probeId],
      );
      const inside = await client.query(
        "select 1 from public.profiles where id = $1",
        [probeId],
      );
      expect(inside.rowCount).toBe(1);
    });

    const outside = await getTestPool().query(
      "select 1 from public.profiles where id = $1",
      [probeId],
    );
    expect(outside.rowCount).toBe(0);
  });

  it("loads the account-deletion fixture into core tables", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");

      const profiles = await client.query<{ id: string; display_name: string }>(
        `select id, display_name from public.profiles
          where id = any($1::uuid[])
          order by display_name`,
        [Object.values(TEST_USER_IDS)],
      );
      expect(profiles.rows.map((row) => row.display_name)).toEqual([
        "Alice Fixture",
        "Bob Fixture",
        "Charlie Fixture",
        "David Fixture",
      ]);

      const workspaces = await client.query<{ name: string }>(
        `select name from public.workspaces
          where id = any($1::uuid[])
          order by name`,
        [Object.values(TEST_WORKSPACE_IDS)],
      );
      expect(workspaces.rows.map((row) => row.name)).toEqual([
        "Alice Solo",
        "Bob Shared",
        "David Alone",
      ]);

      const aliceMembers = await client.query<{ user_id: string; role: string }>(
        `select user_id, role from public.workspace_members
          where workspace_id = $1
          order by user_id`,
        [TEST_WORKSPACE_IDS.aliceSolo],
      );
      expect(aliceMembers.rows).toEqual([
        { user_id: TEST_USER_IDS.alice, role: "admin" },
        { user_id: TEST_USER_IDS.charlie, role: "editor" },
      ]);

      const bobAdmins = await client.query<{ count: string }>(
        `select count(*)::text as count from public.workspace_members
          where workspace_id = $1 and role = 'admin'`,
        [TEST_WORKSPACE_IDS.bobShared],
      );
      expect(bobAdmins.rows[0]?.count).toBe("2");
    });

    const leaked = await getTestPool().query(
      `select 1 from public.profiles where id = any($1::uuid[])`,
      [Object.values(TEST_USER_IDS)],
    );
    expect(leaked.rowCount).toBe(0);
  });
});
