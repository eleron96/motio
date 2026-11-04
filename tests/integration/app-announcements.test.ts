import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  TEST_USER_IDS,
  assertCoreSchemaReady,
  closeTestPool,
  getTestPool,
  loadFixture,
  withRollback,
} from "../helpers/setup-test-db";

// 0171: announcements gain optional German text, and get_my_announcements()
// returns it. The function was dropped and created again for the new result
// shape, so its grants are checked too.

const { alice } = TEST_USER_IDS;

type AnnouncementRow = {
  id: string;
  title_ru: string;
  title_en: string;
  title_de: string | null;
  body_ru: string | null;
  body_en: string | null;
  body_de: string | null;
  level: string;
};

async function announcementsAs(client: PoolClient, userId: string): Promise<AnnouncementRow[]> {
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
  await client.query("set local role authenticated");
  const { rows } = await client.query<AnnouncementRow>("select * from public.get_my_announcements()");
  await client.query("reset role");
  return rows;
}

describe("app announcements in German (0171)", () => {
  beforeAll(async () => {
    const client = await getTestPool().connect();
    try {
      await assertCoreSchemaReady(client);
      const { rows } = await client.query<{ present: boolean }>(
        `select exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'app_announcements' and column_name = 'title_de'
         ) as present`,
      );
      if (!rows[0]?.present) throw new Error("0171 not applied: app_announcements.title_de is missing");
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await closeTestPool();
  });

  it("returns the German text beside the other languages", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      await client.query(
        `insert into public.app_announcements (title_ru, title_en, title_de, body_ru, body_en, body_de, published)
         values ('Привет', 'Hello', 'Hallo', 'Текст', 'Body', 'Text', true)`,
      );

      const rows = await announcementsAs(client, alice);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        title_ru: "Привет",
        title_en: "Hello",
        title_de: "Hallo",
        body_de: "Text",
        level: "info",
      });
    });
  });

  it("leaves German empty for announcements written without it", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      await client.query(
        `insert into public.app_announcements (title_ru, title_en, published)
         values ('Привет', 'Hello', true)`,
      );

      const rows = await announcementsAs(client, alice);

      expect(rows[0]).toMatchObject({ title_en: "Hello", title_de: null, body_de: null });
    });
  });

  it("stays closed to anon and open to signed-in users", async () => {
    await withRollback(async (client) => {
      const { rows } = await client.query<{ anon: boolean; authenticated: boolean }>(
        `select
           has_function_privilege('anon', 'public.get_my_announcements()', 'execute') as anon,
           has_function_privilege('authenticated', 'public.get_my_announcements()', 'execute') as authenticated`,
      );
      expect(rows[0]).toEqual({ anon: false, authenticated: true });
    });
  });
});
