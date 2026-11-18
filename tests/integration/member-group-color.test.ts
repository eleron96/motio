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

// member_groups.color (0191). There is no function behind it: the colour is a
// plain column, and who may change it is the policy groups have had since 0023 —
// workspace admins. These tests pin exactly that, so the day somebody widens the
// policy the colour does not silently become editable by everyone.

const SKY = "#6fbfe2";
const AMBER = "#deb373";
const GROUP_ID = "dddddddd-1111-1111-1111-000000000001";

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

async function colorOf(client: PoolClient): Promise<string | null> {
  const { rows } = await client.query<{ color: string | null }>(
    "select color from public.member_groups where id = $1",
    [GROUP_ID],
  );
  return rows[0]?.color ?? null;
}

// W1 (aliceSolo): Alice is the admin, Charlie an editor. David is in neither.
async function withGroup<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withRollback(async (client) => {
    await loadFixture(client, "account-deletion.sql");
    await client.query(
      "insert into public.member_groups (id, workspace_id, name) values ($1, $2, 'Design')",
      [GROUP_ID, TEST_WORKSPACE_IDS.aliceSolo],
    );
    return fn(client);
  });
}

describe("member group colour (0191)", () => {
  beforeAll(async () => {
    const pool = getTestPool();
    const client = await pool.connect();
    try {
      await assertCoreSchemaReady(client);
      const { rows } = await client.query<{ present: boolean }>(
        `select exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'member_groups' and column_name = 'color'
         ) as present`,
      );
      if (!rows[0]?.present) {
        throw new Error("0191 not applied: member_groups.color is missing");
      }
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await closeTestPool();
  });

  it("starts a group without a colour", async () => {
    await withGroup(async (client) => {
      expect(await colorOf(client)).toBeNull();
    });
  });

  it("rejects a colour that is not #rrggbb", async () => {
    await withGroup(async (client) => {
      const code = await expectRejected(client, () => client.query(
        "update public.member_groups set color = 'teal' where id = $1",
        [GROUP_ID],
      ));

      expect(code).toBe("23514");
    });
  });

  it("lets a workspace admin pick a colour and clear it again", async () => {
    await withGroup(async (client) => {
      await asAuthenticated(client, TEST_USER_IDS.alice, async () => {
        const picked = await client.query(
          "update public.member_groups set color = $2 where id = $1",
          [GROUP_ID, SKY],
        );
        expect(picked.rowCount).toBe(1);
      });
      expect(await colorOf(client)).toBe(SKY);

      await asAuthenticated(client, TEST_USER_IDS.alice, async () => {
        await client.query("update public.member_groups set color = null where id = $1", [GROUP_ID]);
      });
      expect(await colorOf(client)).toBeNull();
    });
  });

  it("shows the colour to every member of the workspace", async () => {
    await withGroup(async (client) => {
      await client.query("update public.member_groups set color = $2 where id = $1", [GROUP_ID, SKY]);

      const seen = await asAuthenticated(client, TEST_USER_IDS.charlie, async () => {
        const { rows } = await client.query<{ color: string | null }>(
          "select color from public.member_groups where id = $1",
          [GROUP_ID],
        );
        return rows;
      });

      expect(seen).toEqual([{ color: SKY }]);
    });
  });

  it("leaves the colour alone when a non-admin tries to change it", async () => {
    await withGroup(async (client) => {
      await client.query("update public.member_groups set color = $2 where id = $1", [GROUP_ID, SKY]);

      // RLS filters the row out of the UPDATE instead of raising: nothing is
      // written and nothing is reported back.
      const attempt = await asAuthenticated(client, TEST_USER_IDS.charlie, () => client.query(
        "update public.member_groups set color = $2 where id = $1",
        [GROUP_ID, AMBER],
      ));

      expect(attempt.rowCount).toBe(0);
      expect(await colorOf(client)).toBe(SKY);
    });
  });

  it("hides the group, colour included, from people outside the workspace", async () => {
    await withGroup(async (client) => {
      await client.query("update public.member_groups set color = $2 where id = $1", [GROUP_ID, SKY]);

      const result = await asAuthenticated(client, TEST_USER_IDS.david, async () => {
        const read = await client.query("select color from public.member_groups where id = $1", [GROUP_ID]);
        const write = await client.query(
          "update public.member_groups set color = $2 where id = $1",
          [GROUP_ID, AMBER],
        );
        return { read: read.rowCount, write: write.rowCount };
      });

      expect(result).toEqual({ read: 0, write: 0 });
      expect(await colorOf(client)).toBe(SKY);
    });
  });

  it("shows nothing to an anonymous request", async () => {
    await withGroup(async (client) => {
      await client.query("update public.member_groups set color = $2 where id = $1", [GROUP_ID, SKY]);

      // Either the table grant stops the read (42501) or RLS returns no rows —
      // both are "closed"; a row coming back is the only failure.
      await client.query("savepoint anon_sp");
      await client.query("set local role anon");
      let visibleRows = 0;
      try {
        const read = await client.query("select color from public.member_groups");
        visibleRows = read.rowCount ?? 0;
        await client.query("reset role");
        await client.query("release savepoint anon_sp");
      } catch (error) {
        await client.query("rollback to savepoint anon_sp");
        await client.query("reset role");
        expect((error as { code?: string }).code).toBe("42501");
      }

      expect(visibleRows).toBe(0);
    });
  });
});
