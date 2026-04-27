import type { PoolClient } from "pg";
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

const RU_PHRASE =
  "Я понимаю, что удаляю свой аккаунт навсегда и теряю доступ ко всем рабочим пространствам";
const EN_PHRASE =
  "I understand that I am permanently deleting my account and losing access to all workspaces";

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

describe("Phase 2 — account deletion RPCs (0074)", () => {
  beforeAll(async () => {
    const client = await getTestPool().connect();
    try {
      await assertCoreSchemaReady(client);
      await assertPhase1SchemaReady(client);
      // sanity: migration 0074 loaded
      const { rowCount } = await client.query(
        `select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname='public' and p.proname='request_account_deletion'`,
      );
      if (!rowCount) throw new Error("0074 not applied");
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await closeTestPool();
  });

  // ────────────── preview ──────────────

  describe("preview_account_deletion", () => {
    it("Alice is sole admin of aliceSolo → requiringAction with Charlie as candidate", async () => {
      await withFixture(async (client) => {
        await actAs(client, TEST_USER_IDS.alice);
        const { rows } = await client.query<{ preview_account_deletion: any }>(
          `select public.preview_account_deletion()`,
        );
        const preview = rows[0].preview_account_deletion;
        expect(preview.workspacesRequiringAction).toHaveLength(1);
        expect(preview.workspacesRequiringAction[0].id).toBe(
          TEST_WORKSPACE_IDS.aliceSolo,
        );
        expect(preview.workspacesRequiringAction[0].candidates).toHaveLength(1);
        expect(preview.workspacesRequiringAction[0].candidates[0].user_id).toBe(
          TEST_USER_IDS.charlie,
        );
        expect(preview.workspacesAutoHandled).toEqual([]);
        expect(preview.purgeDelayDays).toBe(30);
      });
    });

    it("Bob has co-admin Charlie in bobShared → autoHandled", async () => {
      await withFixture(async (client) => {
        await actAs(client, TEST_USER_IDS.bob);
        const { rows } = await client.query<{ preview_account_deletion: any }>(
          `select public.preview_account_deletion()`,
        );
        const preview = rows[0].preview_account_deletion;
        expect(preview.workspacesRequiringAction).toEqual([]);
        expect(preview.workspacesAutoHandled).toHaveLength(1);
        expect(preview.workspacesAutoHandled[0].id).toBe(
          TEST_WORKSPACE_IDS.bobShared,
        );
      });
    });

    it("Charlie is member of aliceSolo + co-admin of bobShared → both autoHandled", async () => {
      await withFixture(async (client) => {
        await actAs(client, TEST_USER_IDS.charlie);
        const { rows } = await client.query<{ preview_account_deletion: any }>(
          `select public.preview_account_deletion()`,
        );
        const preview = rows[0].preview_account_deletion;
        expect(preview.workspacesRequiringAction).toEqual([]);
        expect(preview.workspacesAutoHandled.map((w: any) => w.id).sort()).toEqual(
          [TEST_WORKSPACE_IDS.aliceSolo, TEST_WORKSPACE_IDS.bobShared].sort(),
        );
      });
    });

    it("David is alone in davidAlone → requiringAction with empty candidates", async () => {
      await withFixture(async (client) => {
        await actAs(client, TEST_USER_IDS.david);
        const { rows } = await client.query<{ preview_account_deletion: any }>(
          `select public.preview_account_deletion()`,
        );
        const preview = rows[0].preview_account_deletion;
        expect(preview.workspacesRequiringAction).toHaveLength(1);
        expect(preview.workspacesRequiringAction[0].id).toBe(
          TEST_WORKSPACE_IDS.davidAlone,
        );
        expect(preview.workspacesRequiringAction[0].candidates).toEqual([]);
      });
    });

    it("unauthenticated caller is rejected", async () => {
      await withFixture(async (client) => {
        await client.query(`select set_config('request.jwt.claim.sub', '', true)`);
        await expect(
          client.query(`select public.preview_account_deletion()`),
        ).rejects.toThrow(/not authenticated/);
      });
    });
  });

  // ────────────── request (happy path) ──────────────

  describe("request_account_deletion — happy path", () => {
    it("Alice (en) transfers aliceSolo to Charlie → PENDING_DELETION, ownership flips", async () => {
      await withFixture(async (client) => {
        await actAs(client, TEST_USER_IDS.alice);
        const { rows } = await client.query<{ request_account_deletion: any }>(
          `select public.request_account_deletion($1::jsonb, $2)`,
          [
            JSON.stringify([
              {
                workspace_id: TEST_WORKSPACE_IDS.aliceSolo,
                action: "transfer",
                new_owner_id: TEST_USER_IDS.charlie,
              },
            ]),
            EN_PHRASE,
          ],
        );
        const result = rows[0].request_account_deletion;
        expect(result.transferred_workspaces).toBe(1);
        expect(result.deleted_workspaces).toBe(0);
        expect(result.purge_after).toBeTruthy();

        const prof = await client.query<{ status: string; purge_after: string }>(
          `select status, purge_after from public.profiles where id=$1`,
          [TEST_USER_IDS.alice],
        );
        expect(prof.rows[0].status).toBe("PENDING_DELETION");
        expect(prof.rows[0].purge_after).toBeTruthy();

        const ws = await client.query<{ owner_id: string }>(
          `select owner_id from public.workspaces where id=$1`,
          [TEST_WORKSPACE_IDS.aliceSolo],
        );
        expect(ws.rows[0].owner_id).toBe(TEST_USER_IDS.charlie);

        const charlieRole = await client.query<{ role: string }>(
          `select role from public.workspace_members where workspace_id=$1 and user_id=$2`,
          [TEST_WORKSPACE_IDS.aliceSolo, TEST_USER_IDS.charlie],
        );
        expect(charlieRole.rows[0].role).toBe("admin");
      });
    });

    it("Alice (ru) with 'delete' action drops aliceSolo entirely", async () => {
      await withFixture(async (client) => {
        await client.query(
          `update public.profiles set locale='ru' where id=$1`,
          [TEST_USER_IDS.alice],
        );
        await actAs(client, TEST_USER_IDS.alice);
        const { rows } = await client.query<{ request_account_deletion: any }>(
          `select public.request_account_deletion($1::jsonb, $2)`,
          [
            JSON.stringify([
              { workspace_id: TEST_WORKSPACE_IDS.aliceSolo, action: "delete" },
            ]),
            RU_PHRASE,
          ],
        );
        expect(rows[0].request_account_deletion.deleted_workspaces).toBe(1);

        const ws = await client.query(
          `select 1 from public.workspaces where id=$1`,
          [TEST_WORKSPACE_IDS.aliceSolo],
        );
        expect(ws.rowCount).toBe(0);
      });
    });

    it("Bob (auto-handled only) can proceed with empty transfers", async () => {
      await withFixture(async (client) => {
        await actAs(client, TEST_USER_IDS.bob);
        await client.query(
          `select public.request_account_deletion('[]'::jsonb, $1)`,
          [EN_PHRASE],
        );
        const prof = await client.query<{ status: string }>(
          `select status from public.profiles where id=$1`,
          [TEST_USER_IDS.bob],
        );
        expect(prof.rows[0].status).toBe("PENDING_DELETION");

        // Architectural decision (Phase 1): membership rows are preserved.
        const wm = await client.query(
          `select 1 from public.workspace_members where workspace_id=$1 and user_id=$2`,
          [TEST_WORKSPACE_IDS.bobShared, TEST_USER_IDS.bob],
        );
        expect(wm.rowCount).toBe(1);
      });
    });

    it("workspace_members rows preserved after request", async () => {
      await withFixture(async (client) => {
        await actAs(client, TEST_USER_IDS.charlie);
        await client.query(
          `select public.request_account_deletion('[]'::jsonb, $1)`,
          [EN_PHRASE],
        );
        const { rowCount: aliceRows } = await client.query(
          `select 1 from public.workspace_members where workspace_id=$1 and user_id=$2`,
          [TEST_WORKSPACE_IDS.aliceSolo, TEST_USER_IDS.charlie],
        );
        const { rowCount: bobRows } = await client.query(
          `select 1 from public.workspace_members where workspace_id=$1 and user_id=$2`,
          [TEST_WORKSPACE_IDS.bobShared, TEST_USER_IDS.charlie],
        );
        expect(aliceRows).toBe(1);
        expect(bobRows).toBe(1);
      });
    });

    it("request logs an event with email_hash and metadata", async () => {
      await withFixture(async (client) => {
        await actAs(client, TEST_USER_IDS.bob);
        await client.query(
          `select public.request_account_deletion('[]'::jsonb, $1)`,
          [EN_PHRASE],
        );
        const { rows } = await client.query<{
          event_type: string;
          email_hash: string;
          metadata: any;
        }>(
          `select event_type, email_hash, metadata from public.account_deletion_events
            where user_id=$1 order by created_at desc limit 1`,
          [TEST_USER_IDS.bob],
        );
        expect(rows[0].event_type).toBe("requested");
        expect(rows[0].email_hash).toMatch(/^[0-9a-f]{64}$/);
        expect(rows[0].metadata.purge_after).toBeTruthy();
      });
    });

    it("outgoing invites are revoked on request", async () => {
      await withFixture(async (client) => {
        await client.query(
          `insert into public.workspace_invites
             (workspace_id, email, email_normalized, invited_by)
           values ($1, 'guest@fixture.local', 'guest@fixture.local', $2)`,
          [TEST_WORKSPACE_IDS.bobShared, TEST_USER_IDS.bob],
        );
        await actAs(client, TEST_USER_IDS.bob);
        await client.query(
          `select public.request_account_deletion('[]'::jsonb, $1)`,
          [EN_PHRASE],
        );
        const { rows } = await client.query<{ revoked_reason: string }>(
          `select revoked_reason from public.workspace_invites
            where invited_by=$1 and revoked_at is not null`,
          [TEST_USER_IDS.bob],
        );
        expect(rows[0]?.revoked_reason).toBe("canceled");
      });
    });
  });

  // ────────────── request (rejection paths) ──────────────

  describe("request_account_deletion — validation", () => {
    it("rejects when confirmation phrase doesn't match locale", async () => {
      await withFixture(async (client) => {
        await actAs(client, TEST_USER_IDS.alice);
        await expect(
          client.query(
            `select public.request_account_deletion($1::jsonb, $2)`,
            [
              JSON.stringify([
                {
                  workspace_id: TEST_WORKSPACE_IDS.aliceSolo,
                  action: "delete",
                },
              ]),
              "wrong phrase",
            ],
          ),
        ).rejects.toThrow(/confirmation phrase/);
      });
    });

    it("rejects when transfer is missing for a required workspace", async () => {
      await withFixture(async (client) => {
        await actAs(client, TEST_USER_IDS.alice);
        await expect(
          client.query(
            `select public.request_account_deletion('[]'::jsonb, $1)`,
            [EN_PHRASE],
          ),
        ).rejects.toThrow(/transfers missing/);
      });
    });

    it("rejects when new_owner_id is not an ACTIVE member of the workspace", async () => {
      await withFixture(async (client) => {
        await actAs(client, TEST_USER_IDS.alice);
        await expect(
          client.query(
            `select public.request_account_deletion($1::jsonb, $2)`,
            [
              JSON.stringify([
                {
                  workspace_id: TEST_WORKSPACE_IDS.aliceSolo,
                  action: "transfer",
                  new_owner_id: TEST_USER_IDS.david,
                },
              ]),
              EN_PHRASE,
            ],
          ),
        ).rejects.toThrow(/not an ACTIVE member/);
      });
    });

    it("rejects when transfer action has no new_owner_id", async () => {
      await withFixture(async (client) => {
        await actAs(client, TEST_USER_IDS.alice);
        await expect(
          client.query(
            `select public.request_account_deletion($1::jsonb, $2)`,
            [
              JSON.stringify([
                {
                  workspace_id: TEST_WORKSPACE_IDS.aliceSolo,
                  action: "transfer",
                },
              ]),
              EN_PHRASE,
            ],
          ),
        ).rejects.toThrow(/missing new_owner_id/);
      });
    });

    it("rejects unknown action", async () => {
      await withFixture(async (client) => {
        await actAs(client, TEST_USER_IDS.alice);
        await expect(
          client.query(
            `select public.request_account_deletion($1::jsonb, $2)`,
            [
              JSON.stringify([
                {
                  workspace_id: TEST_WORKSPACE_IDS.aliceSolo,
                  action: "yolo",
                },
              ]),
              EN_PHRASE,
            ],
          ),
        ).rejects.toThrow(/unknown action/);
      });
    });

    it("rejects second request while already PENDING_DELETION", async () => {
      await withFixture(async (client) => {
        await actAs(client, TEST_USER_IDS.bob);
        await client.query(
          `select public.request_account_deletion('[]'::jsonb, $1)`,
          [EN_PHRASE],
        );
        await expect(
          client.query(
            `select public.request_account_deletion('[]'::jsonb, $1)`,
            [EN_PHRASE],
          ),
        ).rejects.toThrow(/not ACTIVE/);
      });
    });
  });

  // ────────────── cancel ──────────────

  describe("cancel_account_deletion", () => {
    it("restores ACTIVE and clears purge_after", async () => {
      await withFixture(async (client) => {
        await actAs(client, TEST_USER_IDS.bob);
        await client.query(
          `select public.request_account_deletion('[]'::jsonb, $1)`,
          [EN_PHRASE],
        );
        await client.query(`select public.cancel_account_deletion()`);
        const { rows } = await client.query<{
          status: string;
          purge_after: string | null;
        }>(`select status, purge_after from public.profiles where id=$1`, [
          TEST_USER_IDS.bob,
        ]);
        expect(rows[0].status).toBe("ACTIVE");
        expect(rows[0].purge_after).toBeNull();
      });
    });

    it("rejects cancel when account is ACTIVE", async () => {
      await withFixture(async (client) => {
        await actAs(client, TEST_USER_IDS.bob);
        await expect(
          client.query(`select public.cancel_account_deletion()`),
        ).rejects.toThrow(/not PENDING_DELETION/);
      });
    });

    it("workspaces stay transferred after cancel (no restoration)", async () => {
      await withFixture(async (client) => {
        await actAs(client, TEST_USER_IDS.alice);
        await client.query(
          `select public.request_account_deletion($1::jsonb, $2)`,
          [
            JSON.stringify([
              {
                workspace_id: TEST_WORKSPACE_IDS.aliceSolo,
                action: "transfer",
                new_owner_id: TEST_USER_IDS.charlie,
              },
            ]),
            EN_PHRASE,
          ],
        );
        await client.query(`select public.cancel_account_deletion()`);
        const { rows } = await client.query<{ owner_id: string }>(
          `select owner_id from public.workspaces where id=$1`,
          [TEST_WORKSPACE_IDS.aliceSolo],
        );
        expect(rows[0].owner_id).toBe(TEST_USER_IDS.charlie);
      });
    });

    it("logs 'cancelled' event", async () => {
      await withFixture(async (client) => {
        await actAs(client, TEST_USER_IDS.bob);
        await client.query(
          `select public.request_account_deletion('[]'::jsonb, $1)`,
          [EN_PHRASE],
        );
        await client.query(`select public.cancel_account_deletion()`);
        const { rows } = await client.query<{ event_type: string }>(
          `select event_type from public.account_deletion_events
            where user_id=$1 and event_type='cancelled'`,
          [TEST_USER_IDS.bob],
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].event_type).toBe("cancelled");
      });
    });
  });

  // ────────────── data export ──────────────

  describe("request_data_export + get_data_export_status", () => {
    it("first request succeeds and status is pending", async () => {
      await withFixture(async (client) => {
        await actAs(client, TEST_USER_IDS.alice);
        const req = await client.query<{ request_data_export: any }>(
          `select public.request_data_export()`,
        );
        expect(req.rows[0].request_data_export.status).toBe("pending");
        const stat = await client.query<{ get_data_export_status: any }>(
          `select public.get_data_export_status()`,
        );
        expect(stat.rows[0].get_data_export_status.status).toBe("pending");
      });
    });

    it("rate limits second request within 1 hour", async () => {
      await withFixture(async (client) => {
        await actAs(client, TEST_USER_IDS.alice);
        await client.query(`select public.request_data_export()`);
        await expect(
          client.query(`select public.request_data_export()`),
        ).rejects.toThrow(/rate limit/);
      });
    });

    it("allows second request after 1+ hour", async () => {
      await withFixture(async (client) => {
        await actAs(client, TEST_USER_IDS.alice);
        await client.query(`select public.request_data_export()`);
        // Backdate the previous request.
        await client.query(
          `update public.data_export_requests
              set created_at = now() - interval '2 hours'
            where user_id=$1`,
          [TEST_USER_IDS.alice],
        );
        const { rows } = await client.query<{ request_data_export: any }>(
          `select public.request_data_export()`,
        );
        expect(rows[0].request_data_export.status).toBe("pending");
      });
    });

    it("PENDING_DELETION users can still export", async () => {
      await withFixture(async (client) => {
        await actAs(client, TEST_USER_IDS.bob);
        await client.query(
          `select public.request_account_deletion('[]'::jsonb, $1)`,
          [EN_PHRASE],
        );
        const { rows } = await client.query<{ request_data_export: any }>(
          `select public.request_data_export()`,
        );
        expect(rows[0].request_data_export.status).toBe("pending");
      });
    });

    it("PURGED users are rejected", async () => {
      await withFixture(async (client) => {
        await client.query(
          `update public.profiles set status='PURGED' where id=$1`,
          [TEST_USER_IDS.alice],
        );
        await actAs(client, TEST_USER_IDS.alice);
        await expect(
          client.query(`select public.request_data_export()`),
        ).rejects.toThrow(/PURGED/);
      });
    });

    it("get_status returns {status:'none'} when no requests exist", async () => {
      await withFixture(async (client) => {
        await actAs(client, TEST_USER_IDS.alice);
        const { rows } = await client.query<{ get_data_export_status: any }>(
          `select public.get_data_export_status()`,
        );
        expect(rows[0].get_data_export_status).toEqual({ status: "none" });
      });
    });

    it("get_status exposes file_path only when ready", async () => {
      await withFixture(async (client) => {
        await actAs(client, TEST_USER_IDS.alice);
        await client.query(`select public.request_data_export()`);

        // Simulate pending → no file_path.
        let stat = await client.query<{ get_data_export_status: any }>(
          `select public.get_data_export_status()`,
        );
        expect(stat.rows[0].get_data_export_status.file_path).toBeNull();

        // Simulate ready.
        await client.query(
          `update public.data_export_requests
              set status='ready', file_path='user-exports/a.json',
                  ready_at=now(), expires_at=now() + interval '24 hours'
            where user_id=$1`,
          [TEST_USER_IDS.alice],
        );
        stat = await client.query<{ get_data_export_status: any }>(
          `select public.get_data_export_status()`,
        );
        expect(stat.rows[0].get_data_export_status.file_path).toBe(
          "user-exports/a.json",
        );
        expect(stat.rows[0].get_data_export_status.status).toBe("ready");
      });
    });
  });
});
