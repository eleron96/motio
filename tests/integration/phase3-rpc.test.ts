import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  TEST_USER_IDS,
  assertCoreSchemaReady,
  assertPhase1SchemaReady,
  assertPhase3SchemaReady,
  closeTestPool,
  getTestPool,
  loadFixture,
  withRollback,
} from "../helpers/setup-test-db";

interface ProfilePurgeResult {
  status: string;
  synthetic_email: string;
}

interface ExportRequestResult {
  status: string;
}

interface DataExportRequest {
  status: string;
  request_id?: string;
}

interface DataExportStatus {
  status: string;
  file_path?: string | null;
  error_message?: string | null;
}

const RU_PHRASE =
  "Я понимаю, что удаляю свой аккаунт навсегда и теряю доступ ко всем рабочим пространствам";

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

async function markPending(client: PoolClient, userId: string, purgeAfterSql: string): Promise<void> {
  // purgeAfterSql is inlined (e.g. "now() - interval '1 day'"); we only parameterize the user id.
  await client.query(
    `update public.profiles
        set status = 'PENDING_DELETION',
            status_changed_at = now(),
            purge_after = ${purgeAfterSql}
      where id = $1`,
    [userId],
  );
}

describe("Phase 3 — purge & export helper RPCs (0075)", () => {
  beforeAll(async () => {
    const client = await getTestPool().connect();
    try {
      await assertCoreSchemaReady(client);
      await assertPhase1SchemaReady(client);
      await assertPhase3SchemaReady(client);
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await closeTestPool();
  });

  // ────────────── _pick_profiles_to_purge ──────────────

  describe("_pick_profiles_to_purge", () => {
    it("returns empty set when no profiles match", async () => {
      await withFixture(async (client) => {
        const { rows } = await client.query(
          `select * from public._pick_profiles_to_purge(50)`,
        );
        expect(rows).toEqual([]);
      });
    });

    it("picks only PENDING_DELETION with purge_after <= now()", async () => {
      await withFixture(async (client) => {
        await markPending(client, TEST_USER_IDS.alice, "now() - interval '1 day'");
        await markPending(client, TEST_USER_IDS.bob, "now() + interval '5 days'"); // ещё рано
        // Charlie и David остаются ACTIVE

        const { rows } = await client.query<{ user_id: string }>(
          `select user_id from public._pick_profiles_to_purge(50)`,
        );
        const ids = rows.map((r) => r.user_id);
        expect(ids).toContain(TEST_USER_IDS.alice);
        expect(ids).not.toContain(TEST_USER_IDS.bob);
        expect(ids).not.toContain(TEST_USER_IDS.charlie);
        expect(ids).not.toContain(TEST_USER_IDS.david);
      });
    });

    it("honours batch_limit and orders by oldest purge_after first", async () => {
      await withFixture(async (client) => {
        await markPending(client, TEST_USER_IDS.alice, "now() - interval '10 days'");
        await markPending(client, TEST_USER_IDS.bob, "now() - interval '30 days'");
        await markPending(client, TEST_USER_IDS.charlie, "now() - interval '1 day'");

        const { rows } = await client.query<{ user_id: string }>(
          `select user_id from public._pick_profiles_to_purge(2)`,
        );
        expect(rows).toHaveLength(2);
        expect(rows[0]?.user_id).toBe(TEST_USER_IDS.bob); // самый старый purge_after
        expect(rows[1]?.user_id).toBe(TEST_USER_IDS.alice);
      });
    });

    it("clamps non-positive batch_limit to default", async () => {
      await withFixture(async (client) => {
        await markPending(client, TEST_USER_IDS.alice, "now() - interval '1 day'");
        const { rows } = await client.query(
          `select user_id from public._pick_profiles_to_purge(0)`,
        );
        expect(rows.length).toBeGreaterThan(0);
      });
    });

    it("returns email from auth.users for hashing before anonymization", async () => {
      await withFixture(async (client) => {
        await markPending(client, TEST_USER_IDS.alice, "now() - interval '1 day'");
        const { rows } = await client.query<{ user_id: string; email: string | null }>(
          `select user_id, email from public._pick_profiles_to_purge(5)`,
        );
        const alice = rows.find((r) => r.user_id === TEST_USER_IDS.alice);
        expect(alice?.email).toBe("alice@fixture.local");
      });
    });
  });

  // ────────────── _finalize_profile_purge ──────────────

  describe("_finalize_profile_purge", () => {
    it("happy path: PENDING_DELETION → PURGED with anonymized auth.users + profiles", async () => {
      await withFixture(async (client) => {
        await markPending(client, TEST_USER_IDS.alice, "now() - interval '1 day'");

        const result = await client.query<{ _finalize_profile_purge: ProfilePurgeResult }>(
          `select public._finalize_profile_purge($1::uuid, $2, $3::jsonb)`,
          [TEST_USER_IDS.alice, "abc123hash", JSON.stringify({ origin: "test" })],
        );
        const payload = result.rows[0]?._finalize_profile_purge;
        expect(payload?.status).toBe("PURGED");
        expect(payload?.synthetic_email).toBe(
          `deleted-${TEST_USER_IDS.alice}@motio.invalid`,
        );

        const { rows: profile } = await client.query(
          `select status, email, avatar_url, preferences, display_name, purge_after
             from public.profiles where id = $1`,
          [TEST_USER_IDS.alice],
        );
        expect(profile[0]?.status).toBe("PURGED");
        expect(profile[0]?.email).toBe(
          `deleted-${TEST_USER_IDS.alice}@motio.invalid`,
        );
        expect(profile[0]?.avatar_url).toBeNull();
        expect(profile[0]?.preferences).toEqual({});
        expect(profile[0]?.display_name).toBe("Alice Fixture"); // сохраняется
        expect(profile[0]?.purge_after).toBeNull();

        const { rows: auth } = await client.query(
          `select email, raw_user_meta_data, banned_until
             from auth.users where id = $1`,
          [TEST_USER_IDS.alice],
        );
        expect(auth[0]?.email).toBe(
          `deleted-${TEST_USER_IDS.alice}@motio.invalid`,
        );
        expect(auth[0]?.raw_user_meta_data).toEqual({});
        expect(auth[0]?.banned_until?.toString().toLowerCase()).toContain("infinity");
      });
    });

    it("writes a `purged` event with provided email_hash and metadata", async () => {
      await withFixture(async (client) => {
        await markPending(client, TEST_USER_IDS.alice, "now() - interval '1 day'");

        await client.query(
          `select public._finalize_profile_purge($1::uuid, $2, $3::jsonb)`,
          [TEST_USER_IDS.alice, "hash123", JSON.stringify({ source: "cron" })],
        );

        const { rows } = await client.query(
          `select event_type, email_hash, metadata
             from public.account_deletion_events
            where user_id = $1 and event_type = 'purged'`,
          [TEST_USER_IDS.alice],
        );
        expect(rows).toHaveLength(1);
        expect(rows[0]?.email_hash).toBe("hash123");
        expect(rows[0]?.metadata).toEqual({ source: "cron" });
      });
    });

    it("rejects when profile is not in PENDING_DELETION", async () => {
      await withFixture(async (client) => {
        // Alice — ACTIVE
        await expect(
          client.query(
            `select public._finalize_profile_purge($1::uuid, $2, $3::jsonb)`,
            [TEST_USER_IDS.alice, null, "{}"],
          ),
        ).rejects.toThrow(/account_purge_invalid_state/);
      });
    });

    it("rejects when profile is already PURGED (idempotency guard)", async () => {
      await withFixture(async (client) => {
        await markPending(client, TEST_USER_IDS.alice, "now() - interval '1 day'");
        await client.query(
          `select public._finalize_profile_purge($1::uuid, null, '{}'::jsonb)`,
          [TEST_USER_IDS.alice],
        );
        await expect(
          client.query(
            `select public._finalize_profile_purge($1::uuid, null, '{}'::jsonb)`,
            [TEST_USER_IDS.alice],
          ),
        ).rejects.toThrow(/account_purge_invalid_state/);
      });
    });

    it("rejects when target_user_id is null", async () => {
      await withFixture(async (client) => {
        await expect(
          client.query(
            `select public._finalize_profile_purge(null::uuid, null, '{}'::jsonb)`,
          ),
        ).rejects.toThrow(/account_purge_missing_user_id/);
      });
    });

    it("rejects when profile does not exist", async () => {
      await withFixture(async (client) => {
        await expect(
          client.query(
            `select public._finalize_profile_purge('99999999-9999-9999-9999-999999999999'::uuid, null, '{}'::jsonb)`,
          ),
        ).rejects.toThrow(/account_purge_profile_not_found/);
      });
    });
  });

  // ────────────── _log_account_deletion_event ──────────────

  describe("_log_account_deletion_event", () => {
    it("inserts an event with defaults for email_hash and metadata", async () => {
      await withFixture(async (client) => {
        const { rows } = await client.query<{ event_id: string }>(
          `select public._log_account_deletion_event($1::uuid, 'purge_started') as event_id`,
          [TEST_USER_IDS.alice],
        );
        expect(rows[0]?.event_id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );

        const { rows: audit } = await client.query(
          `select event_type, email_hash, metadata
             from public.account_deletion_events
            where user_id = $1 and event_type = 'purge_started'`,
          [TEST_USER_IDS.alice],
        );
        expect(audit).toHaveLength(1);
        expect(audit[0]?.email_hash).toBeNull();
        expect(audit[0]?.metadata).toEqual({});
      });
    });

    it("rejects empty event_type", async () => {
      await withFixture(async (client) => {
        await expect(
          client.query(
            `select public._log_account_deletion_event($1::uuid, '   ')`,
            [TEST_USER_IDS.alice],
          ),
        ).rejects.toThrow(/account_deletion_event_missing_type/);
      });
    });

    it("rejects null user_id", async () => {
      await withFixture(async (client) => {
        await expect(
          client.query(
            `select public._log_account_deletion_event(null::uuid, 'purge_failed')`,
          ),
        ).rejects.toThrow(/account_deletion_event_missing_user_id/);
      });
    });
  });

  // ────────────── _pick_export_request ──────────────

  describe("_pick_export_request", () => {
    it("returns empty when there is no pending request", async () => {
      await withFixture(async (client) => {
        const { rows } = await client.query(
          `select * from public._pick_export_request()`,
        );
        expect(rows).toEqual([]);
      });
    });

    it("picks the oldest pending request and moves it to processing", async () => {
      await withFixture(async (client) => {
        await actAs(client, TEST_USER_IDS.alice);
        // Создадим 3 заявки на разных пользователях, чтобы обойти rate-limit 1/час/юзер.
        const idAlice = (
          await client.query<{ id: string }>(
            `insert into public.data_export_requests (user_id, status, created_at)
             values ($1, 'pending', now() - interval '30 minutes') returning id`,
            [TEST_USER_IDS.alice],
          )
        ).rows[0]!.id;
        await client.query(
          `insert into public.data_export_requests (user_id, status, created_at)
             values ($1, 'pending', now() - interval '20 minutes')`,
          [TEST_USER_IDS.bob],
        );
        await client.query(
          `insert into public.data_export_requests (user_id, status, created_at)
             values ($1, 'pending', now() - interval '10 minutes')`,
          [TEST_USER_IDS.charlie],
        );

        const { rows } = await client.query<{
          request_id: string;
          user_id: string;
        }>(`select * from public._pick_export_request()`);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.request_id).toBe(idAlice);
        expect(rows[0]?.user_id).toBe(TEST_USER_IDS.alice);

        const { rows: updated } = await client.query(
          `select status, started_at from public.data_export_requests where id = $1`,
          [idAlice],
        );
        expect(updated[0]?.status).toBe("processing");
        expect(updated[0]?.started_at).not.toBeNull();
      });
    });

    it("ignores already-processing and ready rows", async () => {
      await withFixture(async (client) => {
        await client.query(
          `insert into public.data_export_requests (user_id, status, created_at)
             values ($1, 'processing', now())`,
          [TEST_USER_IDS.alice],
        );
        await client.query(
          `insert into public.data_export_requests (user_id, status, created_at, file_path, ready_at)
             values ($1, 'ready', now(), 'a/b.json', now())`,
          [TEST_USER_IDS.bob],
        );

        const { rows } = await client.query(
          `select * from public._pick_export_request()`,
        );
        expect(rows).toEqual([]);
      });
    });
  });

  // ────────────── _finalize_export_request ──────────────

  describe("_finalize_export_request", () => {
    async function createPendingRequest(
      client: PoolClient,
      userId: string,
    ): Promise<string> {
      const { rows } = await client.query<{ id: string }>(
        `insert into public.data_export_requests (user_id, status)
         values ($1, 'pending') returning id`,
        [userId],
      );
      return rows[0]!.id;
    }

    it("marks request ready with file_path, ready_at, and expires_at ≈ now()+24h", async () => {
      await withFixture(async (client) => {
        const id = await createPendingRequest(client, TEST_USER_IDS.alice);

        const { rows: result } = await client.query<{ _finalize_export_request: ExportRequestResult }>(
          `select public._finalize_export_request($1::uuid, 'ready', $2, null)`,
          [id, "alice-folder/request.json"],
        );
        expect(result[0]?._finalize_export_request?.status).toBe("ready");

        const { rows } = await client.query<{
          status: string;
          file_path: string;
          ready_at: string;
          expires_at: string;
          error_message: string | null;
        }>(
          `select status, file_path, ready_at, expires_at, error_message
             from public.data_export_requests where id = $1`,
          [id],
        );
        expect(rows[0]?.status).toBe("ready");
        expect(rows[0]?.file_path).toBe("alice-folder/request.json");
        expect(rows[0]?.ready_at).not.toBeNull();
        expect(rows[0]?.expires_at).not.toBeNull();
        expect(rows[0]?.error_message).toBeNull();

        // expires_at ≈ now() + 24h (допуск 2 минуты).
        const { rows: drift } = await client.query<{ drift_seconds: number }>(
          `select extract(epoch from (expires_at - (now() + interval '24 hours')))::int as drift_seconds
             from public.data_export_requests where id = $1`,
          [id],
        );
        expect(Math.abs(drift[0]!.drift_seconds)).toBeLessThan(120);
      });
    });

    it("marks request failed with error_message captured", async () => {
      await withFixture(async (client) => {
        const id = await createPendingRequest(client, TEST_USER_IDS.alice);

        await client.query(
          `select public._finalize_export_request($1::uuid, 'failed', null, 'storage upload failed')`,
          [id],
        );

        const { rows } = await client.query(
          `select status, error_message from public.data_export_requests where id = $1`,
          [id],
        );
        expect(rows[0]?.status).toBe("failed");
        expect(rows[0]?.error_message).toBe("storage upload failed");
      });
    });

    it("marks request expired and nulls file_path", async () => {
      await withFixture(async (client) => {
        const { rows: ins } = await client.query<{ id: string }>(
          `insert into public.data_export_requests
             (user_id, status, file_path, ready_at, expires_at)
           values ($1, 'ready', 'a/b.json', now(), now())
           returning id`,
          [TEST_USER_IDS.alice],
        );
        const id = ins[0]!.id;

        await client.query(
          `select public._finalize_export_request($1::uuid, 'expired', null, null)`,
          [id],
        );

        const { rows } = await client.query(
          `select status, file_path from public.data_export_requests where id = $1`,
          [id],
        );
        expect(rows[0]?.status).toBe("expired");
        expect(rows[0]?.file_path).toBeNull();
      });
    });

    it("rejects `ready` without file_path", async () => {
      await withFixture(async (client) => {
        const id = await createPendingRequest(client, TEST_USER_IDS.alice);
        await expect(
          client.query(
            `select public._finalize_export_request($1::uuid, 'ready', null, null)`,
            [id],
          ),
        ).rejects.toThrow(/data_export_finalize_missing_file_path/);
      });
    });

    it("rejects invalid status values", async () => {
      await withFixture(async (client) => {
        const id = await createPendingRequest(client, TEST_USER_IDS.alice);
        await expect(
          client.query(
            `select public._finalize_export_request($1::uuid, 'bogus', null, null)`,
            [id],
          ),
        ).rejects.toThrow(/data_export_finalize_invalid_status/);
      });
    });

    it("rejects when request_id does not exist", async () => {
      await withFixture(async (client) => {
        await expect(
          client.query(
            `select public._finalize_export_request('99999999-9999-9999-9999-999999999999'::uuid, 'ready', 'x', null)`,
          ),
        ).rejects.toThrow(/data_export_finalize_request_not_found/);
      });
    });
  });

  // ────────────── storage bucket + RLS ──────────────

  describe("user-exports bucket + RLS", () => {
    it("bucket exists and is not marked public when the column is available", async () => {
      await withFixture(async (client) => {
        const { rows: existsRows } = await client.query(
          `select id, name from storage.buckets where id = 'user-exports'`,
        );
        expect(existsRows).toHaveLength(1);
        expect(existsRows[0]?.name).toBe("user-exports");

        const { rowCount: hasPublicColumn } = await client.query(
          `select 1 from information_schema.columns
            where table_schema='storage' and table_name='buckets' and column_name='public'`,
        );
        if (hasPublicColumn) {
          const { rows } = await client.query(
            `select public from storage.buckets where id = 'user-exports'`,
          );
          expect(rows[0]?.public).toBe(false);
        }
      });
    });

    it("only service_role policy exists on storage.objects for the bucket", async () => {
      await withFixture(async (client) => {
        const { rows } = await client.query<{ policyname: string; qual: string }>(
          `select policyname, qual::text as qual
             from pg_policies
            where schemaname = 'storage' and tablename = 'objects'
              and qual ilike '%user-exports%'`,
        );
        expect(rows.length).toBeGreaterThan(0);
        expect(rows[0]?.policyname).toBe("Service role manages user-exports");
        expect(rows[0]?.qual).toContain("service_role");
      });
    });
  });

  // ────────────── end-to-end покрытие request→pick→finalize ──────────────

  describe("end-to-end export flow via public + helper RPCs", () => {
    it("request_data_export → _pick_export_request → _finalize_export_request(ready)", async () => {
      await withFixture(async (client) => {
        await actAs(client, TEST_USER_IDS.alice);
        const { rows: requested } = await client.query<{ request_data_export: DataExportRequest }>(
          `select public.request_data_export()`,
        );
        const requestId = (requested[0]?.request_data_export as { request_id?: string })?.request_id;
        expect(requestId).toBeTruthy();

        const { rows: picked } = await client.query<{ request_id: string; user_id: string }>(
          `select * from public._pick_export_request()`,
        );
        expect(picked[0]?.request_id).toBe(requestId);
        expect(picked[0]?.user_id).toBe(TEST_USER_IDS.alice);

        await client.query(
          `select public._finalize_export_request($1::uuid, 'ready', $2, null)`,
          [requestId, `${TEST_USER_IDS.alice}/${requestId}.json`],
        );

        const { rows: status } = await client.query<{ get_data_export_status: DataExportStatus }>(
          `select public.get_data_export_status()`,
        );
        const payload = status[0]?.get_data_export_status;
        expect(payload?.status).toBe("ready");
        expect(payload?.file_path).toBe(`${TEST_USER_IDS.alice}/${requestId}.json`);
      });
    });

    it("end-to-end: request → pick → finalize(failed) reveals error_message", async () => {
      await withFixture(async (client) => {
        await actAs(client, TEST_USER_IDS.alice);
        const { rows: requested } = await client.query<{ request_data_export: DataExportRequest }>(
          `select public.request_data_export()`,
        );
        const requestId = (requested[0]?.request_data_export as { request_id?: string })?.request_id;

        await client.query(`select * from public._pick_export_request()`);
        await client.query(
          `select public._finalize_export_request($1::uuid, 'failed', null, 'keycloak down')`,
          [requestId],
        );

        const { rows: status } = await client.query<{ get_data_export_status: DataExportStatus }>(
          `select public.get_data_export_status()`,
        );
        const payload = status[0]?.get_data_export_status;
        expect(payload?.status).toBe("failed");
        expect(payload?.file_path).toBeNull();
        expect(payload?.error_message).toBe("keycloak down");
      });
    });
  });

  // ────────────── end-to-end покрытие request_account_deletion → purge ──────────────

  describe("end-to-end purge flow via request_account_deletion + helper RPCs", () => {
    it("pick returns user only after purge_after elapses", async () => {
      await withFixture(async (client) => {
        // Alice is created with default locale 'en' — переставляем на ru, чтобы явно
        // проверить именно русскую фразу (и не быть хрупкими к default-локали).
        await client.query(
          `update public.profiles set locale = 'ru' where id = $1`,
          [TEST_USER_IDS.alice],
        );
        await actAs(client, TEST_USER_IDS.alice);
        await client.query(
          `select public.request_account_deletion($1::jsonb, $2)`,
          [
            JSON.stringify([
              {
                workspace_id: "22222222-2222-2222-2222-000000000001",
                action: "transfer",
                new_owner_id: TEST_USER_IDS.charlie,
              },
            ]),
            RU_PHRASE,
          ],
        );

        // Сразу ничего не готово к purge.
        const { rows: tooEarly } = await client.query(
          `select user_id from public._pick_profiles_to_purge(50)`,
        );
        expect(tooEarly).toEqual([]);

        // Искусственно двигаем purge_after в прошлое.
        await client.query(
          `update public.profiles set purge_after = now() - interval '1 minute' where id = $1`,
          [TEST_USER_IDS.alice],
        );

        const { rows: ready } = await client.query<{ user_id: string; email: string }>(
          `select user_id, email from public._pick_profiles_to_purge(50)`,
        );
        expect(ready).toHaveLength(1);
        expect(ready[0]?.user_id).toBe(TEST_USER_IDS.alice);
        expect(ready[0]?.email).toBe("alice@fixture.local");

        await client.query(
          `select public._finalize_profile_purge($1::uuid, 'h', '{}'::jsonb)`,
          [TEST_USER_IDS.alice],
        );

        const { rows: after } = await client.query(
          `select status from public.profiles where id = $1`,
          [TEST_USER_IDS.alice],
        );
        expect(after[0]?.status).toBe("PURGED");
      });
    });
  });
});
