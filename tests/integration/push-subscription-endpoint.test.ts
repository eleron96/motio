import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isPushServiceEndpoint } from "../../infra/supabase/functions/_shared/pushEndpoint";
import { NOT_PUSH_SERVICE_ENDPOINTS, PUSH_SERVICE_ENDPOINTS } from "../helpers/pushEndpointCases";
import {
  TEST_USER_IDS,
  assertCoreSchemaReady,
  closeTestPool,
  getTestPool,
  loadFixture,
  withRollback,
} from "../helpers/setup-test-db";

// The push function POSTs every notification to the stored endpoint, so a
// subscription may only point at a browser push service (0175). Otherwise a
// signed-in person could make the server send requests to internal services.

const INTERNAL_ENDPOINT = "http://storage:5000/object/x";
const FCM_ENDPOINT = "https://fcm.googleapis.com/fcm/send/integration-test";

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

/** The SQL error code of a statement, or null if it succeeded; the transaction stays usable. */
async function errorCodeOf(client: PoolClient, sql: string, params: unknown[]): Promise<string | null> {
  await client.query("savepoint attempt");
  try {
    await client.query(sql, params);
    await client.query("release savepoint attempt");
    return null;
  } catch (error) {
    await client.query("rollback to savepoint attempt");
    return (error as { code?: string }).code ?? "unknown";
  }
}

describe("push subscription endpoints (0175)", () => {
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

  it("the table rule and the sender's rule agree on every case", async () => {
    const base = "https://fcm.googleapis.com/fcm/send/";
    const cases = [
      ...PUSH_SERVICE_ENDPOINTS,
      ...NOT_PUSH_SERVICE_ENDPOINTS.map(([, endpoint]) => endpoint),
      base + "a".repeat(2048 - base.length),
      base + "a".repeat(2049 - base.length),
    ];
    await withRollback(async (client) => {
      for (const endpoint of cases) {
        const { rows } = await client.query<{ allowed: boolean }>(
          "select public.is_push_service_endpoint($1) as allowed",
          [endpoint],
        );
        expect(rows[0].allowed, endpoint).toBe(isPushServiceEndpoint(endpoint));
      }
    });
  });

  it("a signed-in person cannot store an internal address, neither directly nor through the RPC", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      await asAuthenticated(client, TEST_USER_IDS.alice, async () => {
        expect(
          await errorCodeOf(
            client,
            "insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'p256dh', 'auth')",
            [TEST_USER_IDS.alice, INTERNAL_ENDPOINT],
          ),
        ).toBe("23514");
        expect(
          await errorCodeOf(
            client,
            "select public.upsert_push_subscription($1, 'p256dh', 'auth', 'test')",
            [INTERNAL_ENDPOINT],
          ),
        ).toBe("23514");
      });
    });
  });

  it("a push service subscription is stored, and cannot be pointed elsewhere afterwards", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      await asAuthenticated(client, TEST_USER_IDS.alice, async () => {
        expect(
          await errorCodeOf(
            client,
            "select public.upsert_push_subscription($1, 'p256dh', 'auth', 'test')",
            [FCM_ENDPOINT],
          ),
        ).toBeNull();
        expect(
          await errorCodeOf(
            client,
            "update public.push_subscriptions set endpoint = $1 where endpoint = $2",
            [INTERNAL_ENDPOINT, FCM_ENDPOINT],
          ),
        ).toBe("23514");
      });
      const { rows } = await client.query<{ endpoint: string }>(
        "select endpoint from public.push_subscriptions where user_id = $1",
        [TEST_USER_IDS.alice],
      );
      expect(rows.map((row) => row.endpoint)).toEqual([FCM_ENDPOINT]);
    });
  });
});
