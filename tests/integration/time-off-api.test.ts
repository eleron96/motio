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

// Workspace API tokens and the absence import (0156). Admins create and revoke
// tokens through RPCs; the table itself is closed to clients. The api_*
// functions run only as service_role (the Edge Function) and touch only
// imported records (those with an external_id).

const W1 = TEST_WORKSPACE_IDS.aliceSolo; // Alice admin, Charlie editor

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
  if (code) {
    await client.query("rollback to savepoint guard_sp");
  } else {
    await client.query("release savepoint guard_sp");
  }
  expect(code, "expected the statement to be rejected").not.toBe("");
  return code;
}

async function withFixture<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withRollback(async (client) => {
    await loadFixture(client, "account-deletion.sql");
    return fn(client);
  });
}

type UpsertResult = { external_id: string | null; status: string; error?: string; id?: string };

const upsert = async (client: PoolClient, items: unknown[]) => {
  const { rows } = await asServiceRole(client, () =>
    client.query<{ result: UpsertResult[] }>(
      "select public.api_upsert_time_off($1, $2::jsonb) as result",
      [W1, JSON.stringify(items)],
    ),
  );
  return rows[0].result;
};

describe("workspace API tokens and absence import (0156)", () => {
  beforeAll(async () => {
    const pool = getTestPool();
    const client = await pool.connect();
    try {
      await assertCoreSchemaReady(client);
      const { rows } = await client.query<{ present: boolean }>(
        "select to_regclass('public.workspace_api_tokens') is not null as present",
      );
      if (!rows[0]?.present) throw new Error("0156 not applied: workspace_api_tokens is missing");
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await closeTestPool();
  });

  it("keeps the token table and the api functions away from clients", async () => {
    await withRollback(async (client) => {
      const { rows } = await client.query<Record<string, boolean>>(`select
        has_table_privilege('authenticated', 'public.workspace_api_tokens', 'SELECT') as auth_select,
        has_table_privilege('anon', 'public.workspace_api_tokens', 'SELECT') as anon_select,
        has_function_privilege('authenticated', 'public.api_upsert_time_off(uuid,jsonb)', 'EXECUTE') as auth_upsert,
        has_function_privilege('anon', 'public.api_token_workspace(text)', 'EXECUTE') as anon_resolve,
        has_function_privilege('service_role', 'public.api_upsert_time_off(uuid,jsonb)', 'EXECUTE') as service_upsert,
        has_function_privilege('anon', 'public.create_workspace_api_token(uuid,text)', 'EXECUTE') as anon_create,
        has_function_privilege('authenticated', 'public.create_workspace_api_token(uuid,text)', 'EXECUTE') as auth_create`);
      expect(rows[0]).toEqual({
        auth_select: false,
        anon_select: false,
        auth_upsert: false,
        anon_resolve: false,
        service_upsert: true,
        anon_create: false,
        auth_create: true,
      });
    });
  });

  it("lets only an admin create, list and revoke tokens; stores only the hash", async () => {
    await withFixture(async (client) => {
      const created = await asAuthenticated(client, TEST_USER_IDS.alice, async () => {
        const { rows } = await client.query<{ id: string; token: string; token_prefix: string }>(
          "select * from public.create_workspace_api_token($1, 'HR sync')",
          [W1],
        );
        return rows[0];
      });
      expect(created.token).toMatch(/^motio_[0-9a-f]{64}$/);
      expect(created.token_prefix).toBe(created.token.slice(0, 14));

      const { rows: stored } = await client.query<{ token_hash: string }>(
        "select token_hash from public.workspace_api_tokens where id = $1",
        [created.id],
      );
      expect(stored[0].token_hash).not.toContain(created.token);
      expect(stored[0].token_hash).toMatch(/^[0-9a-f]{64}$/);

      // Charlie is an editor in W1, not an admin.
      await asAuthenticated(client, TEST_USER_IDS.charlie, () =>
        expectRejected(client, () => client.query("select * from public.list_workspace_api_tokens($1)", [W1])),
      );
      await asAuthenticated(client, TEST_USER_IDS.charlie, () =>
        expectRejected(client, () => client.query("select public.revoke_workspace_api_token($1)", [created.id])),
      );

      const resolve = async () => {
        const { rows } = await asServiceRole(client, () =>
          client.query<{ workspace: string | null }>(
            "select public.api_token_workspace(encode(sha256(convert_to($1, 'UTF8')), 'hex')) as workspace",
            [created.token],
          ),
        );
        return rows[0].workspace;
      };
      expect(await resolve()).toBe(W1);

      await asAuthenticated(client, TEST_USER_IDS.alice, () =>
        client.query("select public.revoke_workspace_api_token($1)", [created.id]),
      );
      expect(await resolve()).toBeNull();
      const listed = await asAuthenticated(client, TEST_USER_IDS.alice, () =>
        client.query("select * from public.list_workspace_api_tokens($1)", [W1]),
      );
      expect(listed.rows).toEqual([]);
    });
  });

  it("creates, keeps and updates absences by external id and reports each item", async () => {
    await withFixture(async (client) => {
      const first = await upsert(client, [
        { external_id: "hr-1", email: "Charlie@Fixture.local", start_date: "2031-03-02", end_date: "2031-03-06", note: "Urlaub" },
        { external_id: "hr-2", email: "charlie@fixture.local", start_date: "2031-03-05", end_date: "2031-03-07" },
        { external_id: "hr-3", email: "bob@fixture.local", start_date: "2031-03-02", end_date: "2031-03-03" },
        { external_id: "hr-4", email: "alice@fixture.local", start_date: "2031-03-09", end_date: "2031-03-08" },
        { external_id: "hr-5", email: "alice@fixture.local", start_date: "2031-02-30", end_date: "2031-03-01" },
        { email: "alice@fixture.local", start_date: "2031-03-09", end_date: "2031-03-10" },
      ]);
      expect(first.map((item) => [item.external_id, item.status, item.error ?? null])).toEqual([
        ["hr-1", "created", null],
        ["hr-2", "error", "OVERLAP"],
        // Bob is not a member of W1.
        ["hr-3", "error", "PERSON_NOT_FOUND"],
        ["hr-4", "error", "INVALID_DATES"],
        ["hr-5", "error", "INVALID_DATES"],
        [null, "error", "INVALID_EXTERNAL_ID"],
      ]);

      const second = await upsert(client, [
        { external_id: "hr-1", email: "charlie@fixture.local", start_date: "2031-03-02", end_date: "2031-03-06", note: "Urlaub" },
        { external_id: "hr-1", email: "charlie@fixture.local", start_date: "2031-03-02", end_date: "2031-03-04", note: "Urlaub" },
      ]);
      expect(second.map((item) => item.status)).toEqual(["unchanged", "updated"]);

      const { rows } = await asServiceRole(client, () =>
        client.query<{ external_id: string; email: string; start_date: string; end_date: string }>(
          `select external_id, email, start_date::text, end_date::text
             from public.api_list_time_off($1, '2031-03-01', '2031-03-31')`,
          [W1],
        ),
      );
      expect(rows).toEqual([
        { external_id: "hr-1", email: "charlie@fixture.local", start_date: "2031-03-02", end_date: "2031-03-04" },
      ]);
    });
  });

  it("never touches absences people entered by hand", async () => {
    await withFixture(async (client) => {
      const { rows: assignee } = await client.query<{ id: string }>(
        "select id from public.assignees where workspace_id = $1 and user_id = $2",
        [W1, TEST_USER_IDS.charlie],
      );
      await asAuthenticated(client, TEST_USER_IDS.charlie, () =>
        client.query(
          "insert into public.time_off (assignee_id, start_date, end_date) values ($1, '2031-05-04', '2031-05-08')",
          [assignee[0].id],
        ),
      );

      // Overlapping the manual record is reported, not merged.
      const result = await upsert(client, [
        { external_id: "hr-9", email: "charlie@fixture.local", start_date: "2031-05-06", end_date: "2031-05-12" },
      ]);
      expect(result[0]).toMatchObject({ status: "error", error: "OVERLAP" });

      // The manual record has no external id, so delete cannot reach it.
      const { rows: deleted } = await asServiceRole(client, () =>
        client.query<{ deleted: boolean }>("select public.api_delete_time_off($1, '') as deleted", [W1]),
      );
      expect(deleted[0].deleted).toBe(false);
      const { rows: left } = await client.query<{ count: string }>(
        "select count(*) from public.time_off where workspace_id = $1 and external_id is null",
        [W1],
      );
      expect(Number(left[0].count)).toBe(1);

      // And a person cannot attach an external id to their own record.
      const code = await asAuthenticated(client, TEST_USER_IDS.charlie, () =>
        expectRejected(client, () =>
          client.query("update public.time_off set external_id = 'hr-9' where workspace_id = $1", [W1]),
        ),
      );
      expect(code).toBe("42501");
    });
  });

  it("deletes an imported record by external id", async () => {
    await withFixture(async (client) => {
      await upsert(client, [
        { external_id: "hr-7", email: "alice@fixture.local", start_date: "2031-06-01", end_date: "2031-06-02" },
      ]);
      const remove = async () => {
        const { rows } = await asServiceRole(client, () =>
          client.query<{ deleted: boolean }>("select public.api_delete_time_off($1, 'hr-7') as deleted", [W1]),
        );
        return rows[0].deleted;
      };
      expect(await remove()).toBe(true);
      expect(await remove()).toBe(false);
    });
  });
});
