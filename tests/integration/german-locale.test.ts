import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

// German as the third profile language (0155): the profile accepts it, account
// deletion has a German confirmation phrase, and a new workspace starts with
// German catalogs and examples. Russian and English stay exactly as before.

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

const namesOf = async (client: PoolClient, table: string, workspaceId: string) => {
  const { rows } = await client.query<{ name: string }>(
    `select name from public.${table} where workspace_id = $1`,
    [workspaceId],
  );
  // Sorted here, not in SQL: the result must not depend on the database collation.
  return rows.map((row) => row.name).sort();
};

describe("German locale (0155)", () => {
  beforeAll(async () => {
    const pool = getTestPool();
    const client = await pool.connect();
    try {
      await assertCoreSchemaReady(client);
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await closeTestPool();
  });

  it("stores de as a profile language and still rejects unknown ones", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      await client.query(`update public.profiles set locale = 'de' where id = $1`, [TEST_USER_IDS.alice]);

      await client.query("savepoint unknown_locale");
      let code = "";
      try {
        await client.query(`update public.profiles set locale = 'fr' where id = $1`, [TEST_USER_IDS.alice]);
      } catch (error) {
        code = (error as { code?: string }).code ?? "unknown";
      }
      await client.query("rollback to savepoint unknown_locale");
      expect(code).toBe("23514");
    });
  });

  it("has a German deletion phrase identical to the one the client asks for", async () => {
    await withRollback(async (client) => {
      const { rows } = await client.query<Record<string, string | null>>(
        `select public.account_deletion_confirmation_phrase('de') as de,
                public.account_deletion_confirmation_phrase('ru') as ru,
                public.account_deletion_confirmation_phrase(null) as fallback`,
      );
      const wizard = readFileSync(
        resolve(process.cwd(), "src/features/auth/components/DeleteAccountWizard.tsx"),
        "utf8",
      );
      expect(rows[0].de).toBe(
        "Ich verstehe, dass ich mein Konto endgültig lösche und den Zugriff auf alle Arbeitsbereiche verliere",
      );
      expect(wizard).toContain(`de: '${rows[0].de}'`);
      expect(rows[0].ru).toBe(
        "Я понимаю, что удаляю свой аккаунт навсегда и теряю доступ ко всем рабочим пространствам",
      );
      expect(rows[0].fallback).toBe(
        "I understand that I am permanently deleting my account and losing access to all workspaces",
      );
    });
  });

  it("starts a German workspace with German catalogs and examples", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const workspaceId = await asAuthenticated(client, TEST_USER_IDS.alice, async () => {
        const { rows } = await client.query<{ id: string }>(
          `select public.create_workspace('Arbeitsbereich Test', 'de') as id`,
        );
        return rows[0].id;
      });
      await client.query(`select public.seed_workspace_sample_data($1, 'de')`, [workspaceId]);

      expect(await namesOf(client, "statuses", workspaceId)).toEqual([
        "Abgebrochen",
        "Erledigt",
        "In Arbeit",
        "Zu erledigen",
      ]);
      expect(await namesOf(client, "task_types", workspaceId)).toEqual([
        "Aufgabe",
        "Besprechung",
        "Fehler",
        "Funktion",
      ]);
      expect(await namesOf(client, "projects", workspaceId)).toEqual([
        "Firmenwebsite",
        "Interne Abläufe",
        "Mobile App",
      ]);
      const { rows: milestones } = await client.query<{ title: string }>(
        `select title from public.milestones where workspace_id = $1`,
        [workspaceId],
      );
      expect(milestones.map((row) => row.title).sort()).toEqual(["Store-Release", "Website-Launch"]);
    });
  });

  it("keeps the Russian and English starting sets unchanged", async () => {
    await withRollback(async (client) => {
      await loadFixture(client, "account-deletion.sql");
      const [ruId, enId] = await asAuthenticated(client, TEST_USER_IDS.alice, async () => {
        const ru = await client.query<{ id: string }>(`select public.create_workspace('RU', 'ru') as id`);
        const en = await client.query<{ id: string }>(`select public.create_workspace('EN', 'fr') as id`);
        return [ru.rows[0].id, en.rows[0].id];
      });

      expect(await namesOf(client, "statuses", ruId)).toEqual(["В работе", "Готово", "К выполнению", "Отменена"]);
      expect(await namesOf(client, "statuses", enId)).toEqual(["Cancelled", "Done", "In Progress", "To Do"]);
    });
  });
});
