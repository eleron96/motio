import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertCoreSchemaReady,
  closeTestPool,
  getTestPool,
  withRollback,
} from "../helpers/setup-test-db";

// Realtime subscriptions filter DELETE events on a column (workspace_id,
// task_id). With the default replica identity a DELETE carries only the
// primary key, the filter never matches and the delete silently never reaches
// teammates — so every such table must ship the full old row.
// tasks, milestones: 0163; time_off: 0131; task_subtasks: 0158.
const TABLES_WITH_FILTERED_DELETES = ["milestones", "task_subtasks", "tasks", "time_off"];

describe("realtime replica identity (0131/0158/0163)", () => {
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

  it("ships the full old row for every table whose deletes are filtered", async () => {
    await withRollback(async (client) => {
      const { rows } = await client.query<{ relname: string; relreplident: string }>(
        `select c.relname, c.relreplident
           from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname = any($1::text[])
          order by c.relname`,
        [TABLES_WITH_FILTERED_DELETES],
      );
      expect(rows).toEqual(
        TABLES_WITH_FILTERED_DELETES.map((relname) => ({ relname, relreplident: "f" })),
      );
    });
  });
});
