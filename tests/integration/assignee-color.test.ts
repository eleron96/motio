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

// assignees.color + set_assignee_color() (0135). The whole point of routing the
// write through a function is the permission split it encodes: an admin
// recolours anyone, everybody else only themselves — and nobody gains the right
// to rename or disable a teammate along the way.

const PASTEL_BLUE = "#a7ccf1";
const PASTEL_GREEN = "#a0e3c2";

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

async function expectRejected(
  client: PoolClient,
  run: () => Promise<unknown>,
): Promise<string> {
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

// The member-sync trigger creates one assignee per workspace member.
async function assigneeIdFor(
  client: PoolClient,
  workspaceId: string,
  userId: string,
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    "select id from public.assignees where workspace_id = $1 and user_id = $2",
    [workspaceId, userId],
  );
  expect(rows[0]?.id, "fixture must provide an assignee row").toBeTruthy();
  return rows[0].id;
}

async function colorOf(client: PoolClient, assigneeId: string): Promise<string | null> {
  const { rows } = await client.query<{ color: string | null }>(
    "select color from public.assignees where id = $1",
    [assigneeId],
  );
  return rows[0]?.color ?? null;
}

async function withFixture<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withRollback(async (client) => {
    await loadFixture(client, "account-deletion.sql");
    return fn(client);
  });
}

describe("assignee colour (0135)", () => {
  beforeAll(async () => {
    const pool = getTestPool();
    const client = await pool.connect();
    try {
      await assertCoreSchemaReady(client);
      const { rows } = await client.query<{ present: boolean }>(
        `select exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'assignees' and column_name = 'color'
         ) as present`,
      );
      if (!rows[0]?.present) {
        throw new Error("0135 not applied: assignees.color is missing");
      }
      const { rows: fn } = await client.query<{ present: boolean }>(
        "select to_regprocedure('public.set_assignee_color(uuid, text)') is not null as present",
      );
      if (!fn[0]?.present) {
        throw new Error("0135 not applied: set_assignee_color is missing");
      }
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await closeTestPool();
  });

  it("keeps the function callable by authenticated and closed to anon", async () => {
    await withRollback(async (client) => {
      const { rows } = await client.query<{
        auth_exec: boolean; anon_exec: boolean; public_exec: boolean;
      }>(`select
            has_function_privilege('authenticated','public.set_assignee_color(uuid, text)','EXECUTE') as auth_exec,
            has_function_privilege('anon','public.set_assignee_color(uuid, text)','EXECUTE') as anon_exec,
            has_function_privilege('public','public.set_assignee_color(uuid, text)','EXECUTE') as public_exec`);

      expect(rows[0].auth_exec).toBe(true);
      expect(rows[0].anon_exec).toBe(false);
      expect(rows[0].public_exec).toBe(false);
    });
  });

  it("rejects a colour that is not #rrggbb at the column level", async () => {
    await withFixture(async (client) => {
      const assigneeId = await assigneeIdFor(
        client,
        TEST_WORKSPACE_IDS.aliceSolo,
        TEST_USER_IDS.alice,
      );

      const code = await expectRejected(client, () => client.query(
        "update public.assignees set color = $2 where id = $1",
        [assigneeId, "chartreuse"],
      ));

      expect(code).toBe("23514");
    });
  });

  it("lets an admin recolour a teammate", async () => {
    await withFixture(async (client) => {
      const charlieAssignee = await assigneeIdFor(
        client,
        TEST_WORKSPACE_IDS.aliceSolo,
        TEST_USER_IDS.charlie,
      );

      await asAuthenticated(client, TEST_USER_IDS.alice, async () => {
        await client.query("select public.set_assignee_color($1, $2)", [charlieAssignee, PASTEL_BLUE]);
      });

      expect(await colorOf(client, charlieAssignee)).toBe(PASTEL_BLUE);
    });
  });

  it("lets a non-admin recolour themselves", async () => {
    await withFixture(async (client) => {
      // Charlie is only an editor in W1.
      const charlieAssignee = await assigneeIdFor(
        client,
        TEST_WORKSPACE_IDS.aliceSolo,
        TEST_USER_IDS.charlie,
      );

      await asAuthenticated(client, TEST_USER_IDS.charlie, async () => {
        await client.query("select public.set_assignee_color($1, $2)", [charlieAssignee, PASTEL_GREEN]);
      });

      expect(await colorOf(client, charlieAssignee)).toBe(PASTEL_GREEN);
    });
  });

  it("stops a non-admin from recolouring somebody else", async () => {
    await withFixture(async (client) => {
      const aliceAssignee = await assigneeIdFor(
        client,
        TEST_WORKSPACE_IDS.aliceSolo,
        TEST_USER_IDS.alice,
      );

      const code = await asAuthenticated(client, TEST_USER_IDS.charlie, () => (
        expectRejected(client, () => client.query(
          "select public.set_assignee_color($1, $2)",
          [aliceAssignee, PASTEL_BLUE],
        ))
      ));

      expect(code).toBe("42501");
      expect(await colorOf(client, aliceAssignee)).toBeNull();
    });
  });

  it("stops an outsider from recolouring anyone in a workspace they cannot see", async () => {
    await withFixture(async (client) => {
      const aliceAssignee = await assigneeIdFor(
        client,
        TEST_WORKSPACE_IDS.aliceSolo,
        TEST_USER_IDS.alice,
      );

      // David is not a member of W1 at all — the function reads the row with RLS
      // off, so this is the check that stops it leaking write access.
      const code = await asAuthenticated(client, TEST_USER_IDS.david, () => (
        expectRejected(client, () => client.query(
          "select public.set_assignee_color($1, $2)",
          [aliceAssignee, PASTEL_BLUE],
        ))
      ));

      expect(code).toBe("42501");
      expect(await colorOf(client, aliceAssignee)).toBeNull();
    });
  });

  it("rejects a malformed colour from the function too", async () => {
    await withFixture(async (client) => {
      const aliceAssignee = await assigneeIdFor(
        client,
        TEST_WORKSPACE_IDS.aliceSolo,
        TEST_USER_IDS.alice,
      );

      const code = await asAuthenticated(client, TEST_USER_IDS.alice, () => (
        expectRejected(client, () => client.query(
          "select public.set_assignee_color($1, $2)",
          [aliceAssignee, "#12345"],
        ))
      ));

      expect(code).toBe("22023");
    });
  });

  it("resets a colour back to automatic with null", async () => {
    await withFixture(async (client) => {
      const aliceAssignee = await assigneeIdFor(
        client,
        TEST_WORKSPACE_IDS.aliceSolo,
        TEST_USER_IDS.alice,
      );

      await asAuthenticated(client, TEST_USER_IDS.alice, async () => {
        await client.query("select public.set_assignee_color($1, $2)", [aliceAssignee, PASTEL_BLUE]);
        await client.query("select public.set_assignee_color($1, null)", [aliceAssignee]);
      });

      expect(await colorOf(client, aliceAssignee)).toBeNull();
    });
  });

  it("lets a viewer recolour themselves without gaining any other write", async () => {
    await withFixture(async (client) => {
      // The case the function exists for. An editor already holds UPDATE on
      // assignees through the 0001 policies, so a colour column would have
      // needed no help there; a viewer holds none, and an RLS policy wide
      // enough to let them recolour themselves would also let them rename or
      // disable the person.
      await client.query(
        `insert into public.workspace_members (workspace_id, user_id, role)
         values ($1, $2, 'viewer')`,
        [TEST_WORKSPACE_IDS.aliceSolo, TEST_USER_IDS.david],
      );
      const davidAssignee = await assigneeIdFor(
        client,
        TEST_WORKSPACE_IDS.aliceSolo,
        TEST_USER_IDS.david,
      );

      await asAuthenticated(client, TEST_USER_IDS.david, async () => {
        await client.query("select public.set_assignee_color($1, $2)", [davidAssignee, PASTEL_BLUE]);
      });
      expect(await colorOf(client, davidAssignee)).toBe(PASTEL_BLUE);

      // Same row, same person, direct write: still refused. RLS reports this as
      // "0 rows matched" rather than an error, so assert on the name instead.
      await asAuthenticated(client, TEST_USER_IDS.david, async () => {
        await client.query(
          "update public.assignees set name = 'Renamed by viewer' where id = $1",
          [davidAssignee],
        );
      });

      const { rows } = await client.query<{ name: string }>(
        "select name from public.assignees where id = $1",
        [davidAssignee],
      );
      expect(rows[0].name).not.toBe("Renamed by viewer");
    });
  });
});
