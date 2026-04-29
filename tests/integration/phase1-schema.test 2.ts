import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  TEST_USER_IDS,
  TEST_WORKSPACE_IDS,
  assertCoreSchemaReady,
  assertPhase1SchemaReady,
  closeTestPool,
  getTestPool,
  loadFixture,
  withRollback,
} from "../helpers/setup-test-db";

describe("Phase 1 — schema migrations 0069-0073", () => {
  beforeAll(async () => {
    const client = await getTestPool().connect();
    try {
      await assertCoreSchemaReady(client);
      await assertPhase1SchemaReady(client);
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await closeTestPool();
  });

  // ────────────── 0069: profile status ──────────────

  describe("0069 profile status", () => {
    it("account_status enum has three values in the right order", async () => {
      const { rows } = await getTestPool().query<{ enumlabel: string }>(
        `select e.enumlabel
           from pg_type t
           join pg_enum e on e.enumtypid = t.oid
           join pg_namespace n on n.oid = t.typnamespace
          where t.typname = 'account_status' and n.nspname = 'public'
          order by e.enumsortorder`,
      );
      expect(rows.map((r) => r.enumlabel)).toEqual([
        "ACTIVE",
        "PENDING_DELETION",
        "PURGED",
      ]);
    });

    it("all existing profiles default to ACTIVE", async () => {
      const { rows } = await getTestPool().query<{ count: string }>(
        `select count(*)::text as count from public.profiles where status <> 'ACTIVE'`,
      );
      expect(rows[0]?.count).toBe("0");
    });

    it("purge_after partial index exists and targets PENDING_DELETION", async () => {
      const { rows } = await getTestPool().query<{ indexdef: string }>(
        `select indexdef from pg_indexes
          where schemaname='public' and indexname='profiles_purge_after_idx'`,
      );
      expect(rows[0]?.indexdef).toContain("purge_after");
      expect(rows[0]?.indexdef).toContain("PENDING_DELETION");
    });

    it("status transitions are writable inside a tx", async () => {
      await withRollback(async (client) => {
        await loadFixture(client, "account-deletion.sql");
        await client.query(
          `update public.profiles
              set status = 'PENDING_DELETION',
                  status_changed_at = now(),
                  purge_after = now() + interval '30 days'
            where id = $1`,
          [TEST_USER_IDS.alice],
        );
        const { rows } = await client.query<{ status: string }>(
          `select status from public.profiles where id = $1`,
          [TEST_USER_IDS.alice],
        );
        expect(rows[0]?.status).toBe("PENDING_DELETION");
      });
    });
  });

  // ────────────── 0070: account_deletion_events ──────────────

  describe("0070 account_deletion_events", () => {
    it("event_type check constraint rejects bogus values", async () => {
      await withRollback(async (client) => {
        await loadFixture(client, "account-deletion.sql");
        await expect(
          client.query(
            `insert into public.account_deletion_events (user_id, event_type)
             values ($1, 'nope')`,
            [TEST_USER_IDS.alice],
          ),
        ).rejects.toThrow(/check constraint/i);
      });
    });

    it("accepts valid event_type values and stores metadata", async () => {
      await withRollback(async (client) => {
        await loadFixture(client, "account-deletion.sql");
        await client.query(
          `insert into public.account_deletion_events (user_id, email_hash, event_type, metadata)
           values ($1, 'abc', 'requested', $2::jsonb)`,
          [TEST_USER_IDS.alice, JSON.stringify({ reason: "test" })],
        );
        const { rows } = await client.query<{ event_type: string; metadata: unknown }>(
          `select event_type, metadata from public.account_deletion_events
            where user_id = $1`,
          [TEST_USER_IDS.alice],
        );
        expect(rows[0]?.event_type).toBe("requested");
        expect(rows[0]?.metadata).toEqual({ reason: "test" });
      });
    });

    it("user_id has no FK (survives profile deletion)", async () => {
      const { rows } = await getTestPool().query<{ count: string }>(
        `select count(*)::text as count
           from information_schema.referential_constraints rc
           join information_schema.key_column_usage kcu
             on kcu.constraint_name = rc.constraint_name
          where kcu.table_schema = 'public'
            and kcu.table_name = 'account_deletion_events'
            and kcu.column_name = 'user_id'`,
      );
      expect(rows[0]?.count).toBe("0");
    });

    it("RLS is enabled and has a super_admins policy", async () => {
      const { rows } = await getTestPool().query<{ relrowsecurity: boolean }>(
        `select relrowsecurity from pg_class
          where oid = 'public.account_deletion_events'::regclass`,
      );
      expect(rows[0]?.relrowsecurity).toBe(true);

      const policies = await getTestPool().query<{ policyname: string }>(
        `select policyname from pg_policies
          where schemaname='public' and tablename='account_deletion_events'`,
      );
      expect(policies.rows.map((r) => r.policyname)).toContain(
        "super admins read deletion events",
      );
    });
  });

  // ────────────── 0071: data_export_requests ──────────────

  describe("0071 data_export_requests", () => {
    it("status check constraint enforces allowed values", async () => {
      await withRollback(async (client) => {
        await loadFixture(client, "account-deletion.sql");
        await expect(
          client.query(
            `insert into public.data_export_requests (user_id, status)
             values ($1, 'bogus')`,
            [TEST_USER_IDS.alice],
          ),
        ).rejects.toThrow(/check constraint/i);
      });
    });

    it("accepts valid statuses", async () => {
      await withRollback(async (client) => {
        await loadFixture(client, "account-deletion.sql");
        for (const status of ["pending", "processing", "ready", "failed", "expired"]) {
          await client.query(
            `insert into public.data_export_requests (user_id, status) values ($1, $2)`,
            [TEST_USER_IDS.alice, status],
          );
        }
        const { rows } = await client.query<{ count: string }>(
          `select count(*)::text as count from public.data_export_requests where user_id = $1`,
          [TEST_USER_IDS.alice],
        );
        expect(rows[0]?.count).toBe("5");
      });
    });

    it("CASCADE on user deletion", async () => {
      await withRollback(async (client) => {
        await loadFixture(client, "account-deletion.sql");
        await client.query(
          `insert into public.data_export_requests (user_id, status) values ($1, 'pending')`,
          [TEST_USER_IDS.alice],
        );
        await client.query(`delete from auth.users where id = $1`, [
          TEST_USER_IDS.alice,
        ]);
        const { rowCount } = await client.query(
          `select 1 from public.data_export_requests where user_id = $1`,
          [TEST_USER_IDS.alice],
        );
        expect(rowCount).toBe(0);
      });
    });

    it("INSERT is NOT granted to authenticated (only SECURITY DEFINER RPCs)", async () => {
      const { rows } = await getTestPool().query<{ privilege_type: string }>(
        `select privilege_type from information_schema.role_table_grants
          where table_schema='public' and table_name='data_export_requests'
            and grantee='authenticated' and privilege_type='INSERT'`,
      );
      expect(rows).toHaveLength(0);
    });
  });

  // ────────────── 0072: active member helpers ──────────────

  describe("0072 v_active_workspace_members view", () => {
    it("lists ACTIVE members only", async () => {
      await withRollback(async (client) => {
        await loadFixture(client, "account-deletion.sql");
        // Bob shared workspace has: Bob (admin) + Charlie (admin). Both ACTIVE.
        const before = await client.query<{ user_id: string }>(
          `select user_id from public.v_active_workspace_members
            where workspace_id = $1 order by user_id`,
          [TEST_WORKSPACE_IDS.bobShared],
        );
        expect(before.rows.map((r) => r.user_id)).toEqual([
          TEST_USER_IDS.bob,
          TEST_USER_IDS.charlie,
        ]);
      });
    });

    it("hides PENDING_DELETION and PURGED members", async () => {
      await withRollback(async (client) => {
        await loadFixture(client, "account-deletion.sql");
        await client.query(
          `update public.profiles set status='PENDING_DELETION' where id=$1`,
          [TEST_USER_IDS.charlie],
        );
        const pending = await client.query<{ user_id: string }>(
          `select user_id from public.v_active_workspace_members
            where workspace_id = $1`,
          [TEST_WORKSPACE_IDS.bobShared],
        );
        expect(pending.rows.map((r) => r.user_id)).toEqual([TEST_USER_IDS.bob]);

        await client.query(
          `update public.profiles set status='PURGED' where id=$1`,
          [TEST_USER_IDS.charlie],
        );
        const purged = await client.query<{ user_id: string }>(
          `select user_id from public.v_active_workspace_members
            where workspace_id = $1`,
          [TEST_WORKSPACE_IDS.bobShared],
        );
        expect(purged.rows.map((r) => r.user_id)).toEqual([TEST_USER_IDS.bob]);

        // Historical: workspace_members table still has Charlie's row.
        const historical = await client.query<{ count: string }>(
          `select count(*)::text as count from public.workspace_members
            where workspace_id = $1 and user_id = $2`,
          [TEST_WORKSPACE_IDS.bobShared, TEST_USER_IDS.charlie],
        );
        expect(historical.rows[0]?.count).toBe("1");
      });
    });
  });

  // ────────────── 0073: rename_purged_profile ──────────────

  describe("0073 rename_purged_profile RPC", () => {
    async function setupPurgedCharlie(client: import("pg").PoolClient) {
      await loadFixture(client, "account-deletion.sql");
      await client.query(
        `update public.profiles set status='PURGED' where id=$1`,
        [TEST_USER_IDS.charlie],
      );
    }

    it("admin can rename a PURGED profile", async () => {
      await withRollback(async (client) => {
        await setupPurgedCharlie(client);
        // Bob is admin of bobShared, Charlie was a member there.
        await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
          TEST_USER_IDS.bob,
        ]);
        await client.query(
          `select public.rename_purged_profile($1, $2, $3)`,
          [TEST_USER_IDS.charlie, TEST_WORKSPACE_IDS.bobShared, "Former Member"],
        );
        const { rows } = await client.query<{ display_name: string }>(
          `select display_name from public.profiles where id=$1`,
          [TEST_USER_IDS.charlie],
        );
        expect(rows[0]?.display_name).toBe("Former Member");
      });
    });

    it("rejects renaming an ACTIVE profile", async () => {
      await withRollback(async (client) => {
        await loadFixture(client, "account-deletion.sql");
        await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
          TEST_USER_IDS.bob,
        ]);
        await expect(
          client.query(
            `select public.rename_purged_profile($1, $2, $3)`,
            [TEST_USER_IDS.charlie, TEST_WORKSPACE_IDS.bobShared, "Nope"],
          ),
        ).rejects.toThrow(/not PURGED/);
      });
    });

    it("rejects if caller is not workspace admin", async () => {
      await withRollback(async (client) => {
        await setupPurgedCharlie(client);
        // Alice is admin of aliceSolo, but Charlie in bobShared — Alice isn't admin there.
        await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
          TEST_USER_IDS.alice,
        ]);
        await expect(
          client.query(
            `select public.rename_purged_profile($1, $2, $3)`,
            [TEST_USER_IDS.charlie, TEST_WORKSPACE_IDS.bobShared, "Nope"],
          ),
        ).rejects.toThrow(/not a workspace admin/);
      });
    });

    it("rejects if target was never a member of the workspace", async () => {
      await withRollback(async (client) => {
        await setupPurgedCharlie(client);
        await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
          TEST_USER_IDS.alice,
        ]);
        // David is in davidAlone, not in aliceSolo.
        await expect(
          client.query(
            `select public.rename_purged_profile($1, $2, $3)`,
            [TEST_USER_IDS.david, TEST_WORKSPACE_IDS.aliceSolo, "Nope"],
          ),
        ).rejects.toThrow(/never a member/);
      });
    });

    it("rejects name shorter than 2 chars", async () => {
      await withRollback(async (client) => {
        await setupPurgedCharlie(client);
        await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
          TEST_USER_IDS.bob,
        ]);
        await expect(
          client.query(
            `select public.rename_purged_profile($1, $2, $3)`,
            [TEST_USER_IDS.charlie, TEST_WORKSPACE_IDS.bobShared, "A"],
          ),
        ).rejects.toThrow(/2\.\.40/);
      });
    });

    it("rejects name longer than 40 chars", async () => {
      await withRollback(async (client) => {
        await setupPurgedCharlie(client);
        await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
          TEST_USER_IDS.bob,
        ]);
        await expect(
          client.query(
            `select public.rename_purged_profile($1, $2, $3)`,
            [
              TEST_USER_IDS.charlie,
              TEST_WORKSPACE_IDS.bobShared,
              "A".repeat(41),
            ],
          ),
        ).rejects.toThrow(/2\.\.40/);
      });
    });

    it("trims whitespace before length check", async () => {
      await withRollback(async (client) => {
        await setupPurgedCharlie(client);
        await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
          TEST_USER_IDS.bob,
        ]);
        await expect(
          client.query(
            `select public.rename_purged_profile($1, $2, $3)`,
            [TEST_USER_IDS.charlie, TEST_WORKSPACE_IDS.bobShared, "   "],
          ),
        ).rejects.toThrow(/2\.\.40/);
      });
    });
  });

  // ────────────── Regression: existing behavior still works ──────────────

  describe("regression — existing behavior is unchanged", () => {
    it("profiles table still has baseline columns", async () => {
      const { rows } = await getTestPool().query<{ column_name: string }>(
        `select column_name from information_schema.columns
          where table_schema='public' and table_name='profiles'
            and column_name in ('id','email','display_name','created_at','locale','preferences','avatar_url')`,
      );
      expect(rows.length).toBe(7);
    });

    it("workspace_members SELECT policy unchanged (members-only)", async () => {
      const { rows } = await getTestPool().query<{ policyname: string }>(
        `select policyname from pg_policies
          where schemaname='public' and tablename='workspace_members'
            and cmd='SELECT'`,
      );
      expect(rows.map((r) => r.policyname)).toContain(
        "members can read workspace members",
      );
    });

    it("profiles RLS policy unchanged (self + shared workspace)", async () => {
      const { rows } = await getTestPool().query<{ policyname: string }>(
        `select policyname from pg_policies
          where schemaname='public' and tablename='profiles' and cmd='SELECT'`,
      );
      expect(rows.map((r) => r.policyname)).toContain(
        "profiles visible to workspace members",
      );
    });

    it("fixture loads identically to Phase 0 smoke", async () => {
      await withRollback(async (client) => {
        await loadFixture(client, "account-deletion.sql");
        const { rows } = await client.query<{ count: string }>(
          `select count(*)::text as count from public.profiles
            where id = any($1::uuid[]) and status = 'ACTIVE'`,
          [Object.values(TEST_USER_IDS)],
        );
        expect(rows[0]?.count).toBe("4");
      });
    });
  });
});
