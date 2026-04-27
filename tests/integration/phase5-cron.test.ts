import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  TEST_USER_IDS,
  assertCoreSchemaReady,
  assertPhase1SchemaReady,
  assertPhase3SchemaReady,
  assertPhase5SchemaReady,
  closeTestPool,
  getTestPool,
  loadFixture,
  withRollback,
} from "../helpers/setup-test-db";

async function actAs(client: PoolClient, userId: string): Promise<void> {
  await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
}

async function withFixture<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return withRollback(async (client) => {
    await loadFixture(client, "account-deletion.sql");
    return fn(client);
  });
}

async function markPending(
  client: PoolClient,
  userId: string,
  purgeAfterSql: string,
): Promise<void> {
  await client.query(
    `update public.profiles
        set status = 'PENDING_DELETION',
            status_changed_at = now(),
            purge_after = ${purgeAfterSql}
      where id = $1`,
    [userId],
  );
}

async function makeSuperAdmin(client: PoolClient, userId: string): Promise<void> {
  await client.query(
    `insert into public.super_admins (user_id) values ($1)
     on conflict (user_id) do nothing`,
    [userId],
  );
}

async function insertReadyExport(
  client: PoolClient,
  opts: {
    userId: string;
    filePath: string | null;
    expiresAtSql: string;
  },
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `insert into public.data_export_requests
       (user_id, status, file_path, ready_at, expires_at)
     values ($1, 'ready', $2, now(), ${opts.expiresAtSql})
     returning id`,
    [opts.userId, opts.filePath],
  );
  return rows[0]!.id;
}

describe("Phase 5 — cron + monitoring helper RPCs (0076)", () => {
  beforeAll(async () => {
    const client = await getTestPool().connect();
    try {
      await assertCoreSchemaReady(client);
      await assertPhase1SchemaReady(client);
      await assertPhase3SchemaReady(client);
      await assertPhase5SchemaReady(client);
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await closeTestPool();
  });

  // ────────────── _pick_expired_exports ──────────────

  describe("_pick_expired_exports", () => {
    it("returns empty set when there are no ready exports", async () => {
      await withFixture(async (client) => {
        const { rows } = await client.query(
          `select * from public._pick_expired_exports(50)`,
        );
        expect(rows).toEqual([]);
      });
    });

    it("ignores ready rows whose TTL has not elapsed yet", async () => {
      await withFixture(async (client) => {
        await insertReadyExport(client, {
          userId: TEST_USER_IDS.alice,
          filePath: "alice/not-yet.json",
          expiresAtSql: "now() + interval '1 hour'",
        });

        const { rows } = await client.query(
          `select * from public._pick_expired_exports(50)`,
        );
        expect(rows).toEqual([]);
      });
    });

    it("ignores ready rows with null file_path (already cleaned)", async () => {
      await withFixture(async (client) => {
        await insertReadyExport(client, {
          userId: TEST_USER_IDS.alice,
          filePath: null,
          expiresAtSql: "now() - interval '1 hour'",
        });

        const { rows } = await client.query(
          `select * from public._pick_expired_exports(50)`,
        );
        expect(rows).toEqual([]);
      });
    });

    it("ignores rows in non-ready states", async () => {
      await withFixture(async (client) => {
        // pending — nothing ready
        await client.query(
          `insert into public.data_export_requests (user_id, status, created_at)
             values ($1, 'pending', now() - interval '2 hours')`,
          [TEST_USER_IDS.alice],
        );
        // processing
        await client.query(
          `insert into public.data_export_requests (user_id, status, created_at)
             values ($1, 'processing', now() - interval '2 hours')`,
          [TEST_USER_IDS.bob],
        );
        // already expired — file_path already nulled
        await client.query(
          `insert into public.data_export_requests
             (user_id, status, file_path, ready_at, expires_at)
           values ($1, 'expired', null, now() - interval '2 hours', now() - interval '1 hour')`,
          [TEST_USER_IDS.charlie],
        );

        const { rows } = await client.query(
          `select * from public._pick_expired_exports(50)`,
        );
        expect(rows).toEqual([]);
      });
    });

    it("picks ready rows whose expires_at is in the past, ordered oldest first", async () => {
      await withFixture(async (client) => {
        const aliceId = await insertReadyExport(client, {
          userId: TEST_USER_IDS.alice,
          filePath: "alice/oldest.json",
          expiresAtSql: "now() - interval '2 days'",
        });
        const bobId = await insertReadyExport(client, {
          userId: TEST_USER_IDS.bob,
          filePath: "bob/middle.json",
          expiresAtSql: "now() - interval '5 hours'",
        });
        const charlieId = await insertReadyExport(client, {
          userId: TEST_USER_IDS.charlie,
          filePath: "charlie/freshest.json",
          expiresAtSql: "now() - interval '1 minute'",
        });

        const { rows } = await client.query<{
          request_id: string;
          user_id: string;
          file_path: string;
        }>(`select request_id, user_id, file_path from public._pick_expired_exports(50)`);

        expect(rows.map((r) => r.request_id)).toEqual([aliceId, bobId, charlieId]);
        expect(rows[0]?.file_path).toBe("alice/oldest.json");
        expect(rows[0]?.user_id).toBe(TEST_USER_IDS.alice);
      });
    });

    it("honours batch_limit and falls back to default on non-positive input", async () => {
      await withFixture(async (client) => {
        await insertReadyExport(client, {
          userId: TEST_USER_IDS.alice,
          filePath: "a.json",
          expiresAtSql: "now() - interval '3 days'",
        });
        await insertReadyExport(client, {
          userId: TEST_USER_IDS.bob,
          filePath: "b.json",
          expiresAtSql: "now() - interval '2 days'",
        });
        await insertReadyExport(client, {
          userId: TEST_USER_IDS.charlie,
          filePath: "c.json",
          expiresAtSql: "now() - interval '1 day'",
        });

        const { rows: limited } = await client.query(
          `select * from public._pick_expired_exports(2)`,
        );
        expect(limited).toHaveLength(2);

        const { rows: unlimited } = await client.query(
          `select * from public._pick_expired_exports(0)`,
        );
        expect(unlimited.length).toBeGreaterThanOrEqual(3);

        const { rows: nulled } = await client.query(
          `select * from public._pick_expired_exports(null)`,
        );
        expect(nulled.length).toBeGreaterThanOrEqual(3);
      });
    });

    it("does NOT auto-transition rows — cron must call _finalize_export_request", async () => {
      await withFixture(async (client) => {
        const id = await insertReadyExport(client, {
          userId: TEST_USER_IDS.alice,
          filePath: "alice/stays-ready.json",
          expiresAtSql: "now() - interval '1 hour'",
        });

        await client.query(`select * from public._pick_expired_exports(50)`);

        const { rows } = await client.query(
          `select status, file_path from public.data_export_requests where id = $1`,
          [id],
        );
        // Still ready — _pick_expired_exports has no side effects on status.
        expect(rows[0]?.status).toBe("ready");
        expect(rows[0]?.file_path).toBe("alice/stays-ready.json");
      });
    });
  });

  // ────────────── _account_deletion_health_check ──────────────

  describe("_account_deletion_health_check", () => {
    it("returns zeros when nothing is stuck", async () => {
      await withFixture(async (client) => {
        const { rows } = await client.query<{ health: Record<string, unknown> }>(
          `select public._account_deletion_health_check() as health`,
        );
        const h = rows[0]!.health;
        expect(h.stuck_purges).toBe(0);
        expect(h.stuck_exports).toBe(0);
        expect(h.stuck_expired_files).toBe(0);
        expect(h.checked_at).toBeTruthy();
      });
    });

    it("counts PENDING_DELETION profiles with purge_after older than the 1h grace window", async () => {
      await withFixture(async (client) => {
        // Bob: расчётно готов, но ещё в пределах grace (<1h).
        await markPending(client, TEST_USER_IDS.bob, "now() - interval '30 minutes'");
        // Alice: зависла — grace давно прошёл.
        await markPending(client, TEST_USER_IDS.alice, "now() - interval '2 hours'");
        // Charlie: застрял на несколько дней — тоже stuck.
        await markPending(client, TEST_USER_IDS.charlie, "now() - interval '3 days'");

        const { rows } = await client.query<{ health: Record<string, unknown> }>(
          `select public._account_deletion_health_check() as health`,
        );
        const h = rows[0]!.health;
        expect(h.stuck_purges).toBe(2);
        expect(h.oldest_stuck_purge).toBeTruthy();
      });
    });

    it("counts pending/processing exports older than 30 minutes", async () => {
      await withFixture(async (client) => {
        // Свежий — не stuck
        await client.query(
          `insert into public.data_export_requests (user_id, status, created_at)
             values ($1, 'pending', now() - interval '5 minutes')`,
          [TEST_USER_IDS.alice],
        );
        // Stuck pending
        await client.query(
          `insert into public.data_export_requests (user_id, status, created_at)
             values ($1, 'pending', now() - interval '45 minutes')`,
          [TEST_USER_IDS.bob],
        );
        // Stuck processing
        await client.query(
          `insert into public.data_export_requests (user_id, status, created_at)
             values ($1, 'processing', now() - interval '2 hours')`,
          [TEST_USER_IDS.charlie],
        );
        // Ready — не считается stuck-export (это другая категория).
        await insertReadyExport(client, {
          userId: TEST_USER_IDS.david,
          filePath: "david/ok.json",
          expiresAtSql: "now() + interval '12 hours'",
        });

        const { rows } = await client.query<{ health: Record<string, unknown> }>(
          `select public._account_deletion_health_check() as health`,
        );
        const h = rows[0]!.health;
        expect(h.stuck_exports).toBe(2);
        expect(h.oldest_stuck_export).toBeTruthy();
      });
    });

    it("counts ready exports whose TTL expired more than 1 hour ago", async () => {
      await withFixture(async (client) => {
        // Вот-вот истёк — grace ещё не прошёл, не stuck.
        await insertReadyExport(client, {
          userId: TEST_USER_IDS.alice,
          filePath: "a.json",
          expiresAtSql: "now() - interval '10 minutes'",
        });
        // Зависший файл — cron его не удалил за >1 часа.
        await insertReadyExport(client, {
          userId: TEST_USER_IDS.bob,
          filePath: "b.json",
          expiresAtSql: "now() - interval '3 hours'",
        });
        await insertReadyExport(client, {
          userId: TEST_USER_IDS.charlie,
          filePath: "c.json",
          expiresAtSql: "now() - interval '2 days'",
        });

        const { rows } = await client.query<{ health: Record<string, unknown> }>(
          `select public._account_deletion_health_check() as health`,
        );
        const h = rows[0]!.health;
        expect(h.stuck_expired_files).toBe(2);
      });
    });
  });

  // ────────────── admin_force_purge_account ──────────────

  describe("admin_force_purge_account", () => {
    it("rejects when caller is not authenticated", async () => {
      await withFixture(async (client) => {
        await markPending(client, TEST_USER_IDS.alice, "now() + interval '20 days'");
        await expect(
          client.query(`select public.admin_force_purge_account($1::uuid)`, [
            TEST_USER_IDS.alice,
          ]),
        ).rejects.toThrow(/not authenticated/);
      });
    });

    it("rejects when caller is not a super_admin", async () => {
      await withFixture(async (client) => {
        await markPending(client, TEST_USER_IDS.alice, "now() + interval '20 days'");
        await actAs(client, TEST_USER_IDS.charlie); // ordinary user
        await expect(
          client.query(`select public.admin_force_purge_account($1::uuid)`, [
            TEST_USER_IDS.alice,
          ]),
        ).rejects.toThrow(/admin_force_purge_not_super_admin/);
      });
    });

    it("rejects when target_user_id is null", async () => {
      await withFixture(async (client) => {
        await makeSuperAdmin(client, TEST_USER_IDS.bob);
        await actAs(client, TEST_USER_IDS.bob);
        await expect(
          client.query(`select public.admin_force_purge_account(null::uuid)`),
        ).rejects.toThrow(/admin_force_purge_missing_user_id/);
      });
    });

    it("rejects when target profile does not exist", async () => {
      await withFixture(async (client) => {
        await makeSuperAdmin(client, TEST_USER_IDS.bob);
        await actAs(client, TEST_USER_IDS.bob);
        await expect(
          client.query(
            `select public.admin_force_purge_account('99999999-9999-9999-9999-999999999999'::uuid)`,
          ),
        ).rejects.toThrow(/admin_force_purge_profile_not_found/);
      });
    });

    it("rejects when target profile is not in PENDING_DELETION", async () => {
      await withFixture(async (client) => {
        await makeSuperAdmin(client, TEST_USER_IDS.bob);
        await actAs(client, TEST_USER_IDS.bob);
        // Alice is ACTIVE (default from fixture).
        await expect(
          client.query(`select public.admin_force_purge_account($1::uuid)`, [
            TEST_USER_IDS.alice,
          ]),
        ).rejects.toThrow(/admin_force_purge_invalid_state/);
      });
    });

    it("sets purge_after=now() and writes audit event when called by super_admin", async () => {
      await withFixture(async (client) => {
        await makeSuperAdmin(client, TEST_USER_IDS.bob);
        await markPending(client, TEST_USER_IDS.alice, "now() + interval '20 days'");
        await actAs(client, TEST_USER_IDS.bob);

        const { rows: result } = await client.query<{
          admin_force_purge_account: { user_id: string; forced_by: string };
        }>(`select public.admin_force_purge_account($1::uuid)`, [TEST_USER_IDS.alice]);
        const payload = result[0]?.admin_force_purge_account;
        expect(payload?.user_id).toBe(TEST_USER_IDS.alice);
        expect(payload?.forced_by).toBe(TEST_USER_IDS.bob);

        const { rows: profile } = await client.query<{
          status: string;
          purge_after: Date | null;
        }>(
          `select status, purge_after from public.profiles where id = $1`,
          [TEST_USER_IDS.alice],
        );
        expect(profile[0]?.status).toBe("PENDING_DELETION");
        expect(profile[0]?.purge_after).not.toBeNull();
        // purge_after ≈ now() (допуск 30 сек).
        const delta =
          Math.abs(Date.now() - new Date(profile[0]!.purge_after as Date).getTime()) /
          1000;
        expect(delta).toBeLessThan(30);

        const { rows: events } = await client.query<{
          event_type: string;
          metadata: Record<string, unknown>;
          email_hash: string | null;
        }>(
          `select event_type, metadata, email_hash
             from public.account_deletion_events
            where user_id = $1 and event_type = 'admin_force_purge_requested'`,
          [TEST_USER_IDS.alice],
        );
        expect(events).toHaveLength(1);
        expect(events[0]?.metadata.forced_by).toBe(TEST_USER_IDS.bob);
        expect(events[0]?.email_hash).toBeTruthy();
      });
    });

    it("makes the target pickable by _pick_profiles_to_purge immediately", async () => {
      await withFixture(async (client) => {
        await makeSuperAdmin(client, TEST_USER_IDS.bob);
        await markPending(client, TEST_USER_IDS.alice, "now() + interval '20 days'");

        // До force — pick пуст (purge_after в будущем).
        const { rows: before } = await client.query<{ user_id: string }>(
          `select user_id from public._pick_profiles_to_purge(50)`,
        );
        expect(before.map((r) => r.user_id)).not.toContain(TEST_USER_IDS.alice);

        await actAs(client, TEST_USER_IDS.bob);
        await client.query(
          `select public.admin_force_purge_account($1::uuid)`,
          [TEST_USER_IDS.alice],
        );

        // Сбросим auth.uid() — _pick_profiles_to_purge использует service_role поведение.
        await client.query(`select set_config('request.jwt.claim.sub', '', true)`);

        const { rows: after } = await client.query<{ user_id: string }>(
          `select user_id from public._pick_profiles_to_purge(50)`,
        );
        expect(after.map((r) => r.user_id)).toContain(TEST_USER_IDS.alice);
      });
    });
  });
});
