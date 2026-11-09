import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertCoreSchemaReady,
  closeTestPool,
  getTestPool,
  withRollback,
} from "../helpers/setup-test-db";

// Server settings (0176): the switches of Admin → Settings. Only the admin Edge
// Function (service_role) and the command line (supabase_admin) touch the
// table; people get the values that concern the app through whoami.

async function expectRejected(client: PoolClient, run: () => Promise<unknown>): Promise<string> {
  await client.query("savepoint guard_sp");
  let code = "";
  try {
    await run();
  } catch (error) {
    code = (error as { code?: string }).code ?? "unknown";
  }
  if (code) {
    await client.query("rollback to savepoint guard_sp");
  } else {
    await client.query("release savepoint guard_sp");
  }
  expect(code, "expected the statement to be rejected").not.toBe("");
  return code;
}

describe("server settings table (0176)", () => {
  beforeAll(async () => {
    const client = await getTestPool().connect();
    try {
      await assertCoreSchemaReady(client);
      const { rows } = await client.query<{ present: boolean }>(
        "select to_regclass('public.instance_settings') is not null as present",
      );
      if (!rows[0]?.present) throw new Error("0176 not applied: instance_settings is missing");
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await closeTestPool();
  });

  it("is closed to clients and open to the admin function", async () => {
    await withRollback(async (client) => {
      const { rows } = await client.query<Record<string, boolean>>(`select
        has_table_privilege('authenticated', 'public.instance_settings', 'SELECT') as auth_select,
        has_table_privilege('authenticated', 'public.instance_settings', 'INSERT') as auth_insert,
        has_table_privilege('anon', 'public.instance_settings', 'SELECT') as anon_select,
        has_table_privilege('service_role', 'public.instance_settings', 'INSERT') as service_insert`);
      expect(rows[0]).toEqual({
        auth_select: false,
        auth_insert: false,
        anon_select: false,
        service_insert: true,
      });
    });
  });

  it("starts empty: every setting at its default", async () => {
    await withRollback(async (client) => {
      const { rows } = await client.query<{ count: string }>("select count(*) from public.instance_settings");
      expect(Number(rows[0].count)).toBe(0);
    });
  });

  it("accepts only keys of the form area.name", async () => {
    await withRollback(async (client) => {
      await client.query("insert into public.instance_settings (key, value) values ('timeline.density', 'true')");
      await expectRejected(client, () =>
        client.query("insert into public.instance_settings (key, value) values ('Timeline', 'true')"),
      );
      await expectRejected(client, () =>
        client.query("insert into public.instance_settings (key, value) values ('a.b''; drop', 'true')"),
      );
    });
  });
});
