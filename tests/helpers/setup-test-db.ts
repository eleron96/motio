import { Pool, type PoolClient } from "pg";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(moduleDir, "../fixtures");

export interface TestDbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export function getTestDbConfig(): TestDbConfig {
  return {
    host: process.env.TEST_DB_HOST ?? "localhost",
    port: Number(process.env.TEST_DB_PORT ?? 54322),
    database: process.env.TEST_DB_NAME ?? "postgres",
    user: process.env.TEST_DB_USER ?? "postgres",
    password: process.env.TEST_DB_PASSWORD ?? "postgres",
  };
}

let sharedPool: Pool | undefined;

export function getTestPool(): Pool {
  if (!sharedPool) {
    sharedPool = new Pool({ ...getTestDbConfig(), max: 4 });
  }
  return sharedPool;
}

export async function closeTestPool(): Promise<void> {
  if (sharedPool) {
    await sharedPool.end();
    sharedPool = undefined;
  }
}

const CORE_TABLES = ["profiles", "workspaces", "workspace_members"] as const;

export async function assertCoreSchemaReady(client: PoolClient): Promise<void> {
  const { rows } = await client.query<{ table_name: string }>(
    `select table_name
       from information_schema.tables
      where table_schema = 'public'
        and table_name = any($1::text[])`,
    [[...CORE_TABLES]],
  );
  const found = new Set(rows.map((row) => row.table_name));
  const missing = CORE_TABLES.filter((table) => !found.has(table));
  if (missing.length > 0) {
    throw new Error(
      `Test DB schema is not ready. Missing tables: ${missing.join(", ")}. ` +
        `Start the stack with 'make up' and make sure Liquibase migrations have run.`,
    );
  }
}

const PHASE1_CHECKS: { kind: string; name: string; sql: string }[] = [
  {
    kind: "enum",
    name: "public.account_status",
    sql: `select 1 from pg_type t
            join pg_namespace n on n.oid = t.typnamespace
           where n.nspname = 'public' and t.typname = 'account_status'`,
  },
  {
    kind: "column",
    name: "public.profiles.status",
    sql: `select 1 from information_schema.columns
           where table_schema='public' and table_name='profiles' and column_name='status'`,
  },
  {
    kind: "column",
    name: "public.profiles.purge_after",
    sql: `select 1 from information_schema.columns
           where table_schema='public' and table_name='profiles' and column_name='purge_after'`,
  },
  {
    kind: "table",
    name: "public.account_deletion_events",
    sql: `select 1 from information_schema.tables
           where table_schema='public' and table_name='account_deletion_events'`,
  },
  {
    kind: "table",
    name: "public.data_export_requests",
    sql: `select 1 from information_schema.tables
           where table_schema='public' and table_name='data_export_requests'`,
  },
  {
    kind: "view",
    name: "public.v_active_workspace_members",
    sql: `select 1 from information_schema.views
           where table_schema='public' and table_name='v_active_workspace_members'`,
  },
  {
    kind: "function",
    name: "public.rename_purged_profile",
    sql: `select 1 from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where n.nspname='public' and p.proname='rename_purged_profile'`,
  },
];

const PHASE3_FUNCTIONS = [
  "_pick_profiles_to_purge",
  "_finalize_profile_purge",
  "_log_account_deletion_event",
  "_pick_export_request",
  "_finalize_export_request",
] as const;

export async function assertPhase3SchemaReady(client: PoolClient): Promise<void> {
  const missing: string[] = [];
  for (const fn of PHASE3_FUNCTIONS) {
    const { rowCount } = await client.query(
      `select 1 from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = $1`,
      [fn],
    );
    if (!rowCount) missing.push(`function public.${fn}`);
  }

  const { rowCount: bucketCount } = await client.query(
    `select 1 from storage.buckets where id = 'user-exports'`,
  );
  if (!bucketCount) missing.push("storage bucket user-exports");

  if (missing.length > 0) {
    throw new Error(
      `Phase 3 schema not ready. Missing: ${missing.join(", ")}. Apply migration 0075.`,
    );
  }
}

const PHASE5_FUNCTIONS = [
  "_pick_expired_exports",
  "_account_deletion_health_check",
  "admin_force_purge_account",
] as const;

export async function assertPhase5SchemaReady(client: PoolClient): Promise<void> {
  const missing: string[] = [];
  for (const fn of PHASE5_FUNCTIONS) {
    const { rowCount } = await client.query(
      `select 1 from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = $1`,
      [fn],
    );
    if (!rowCount) missing.push(`function public.${fn}`);
  }
  if (missing.length > 0) {
    throw new Error(
      `Phase 5 schema not ready. Missing: ${missing.join(", ")}. Apply migration 0076.`,
    );
  }
}

export async function assertPhase1SchemaReady(client: PoolClient): Promise<void> {
  const missing: string[] = [];
  for (const check of PHASE1_CHECKS) {
    const { rowCount } = await client.query(check.sql);
    if (!rowCount) missing.push(`${check.kind} ${check.name}`);
  }
  if (missing.length > 0) {
    throw new Error(
      `Phase 1 schema not ready. Missing: ${missing.join(", ")}. ` +
        "Apply migrations 0069-0073.",
    );
  }
}

export async function withRollback<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getTestPool().connect();
  try {
    await client.query("begin");
    try {
      return await fn(client);
    } finally {
      await client.query("rollback");
    }
  } finally {
    client.release();
  }
}

export async function loadFixture(
  client: PoolClient,
  fixtureName: string,
): Promise<void> {
  const filePath = path.join(FIXTURES_DIR, fixtureName);
  const sql = await fs.readFile(filePath, "utf-8");
  await client.query(sql);
}

export const TEST_USER_IDS = {
  alice: "11111111-1111-1111-1111-000000000001",
  bob: "11111111-1111-1111-1111-000000000002",
  charlie: "11111111-1111-1111-1111-000000000003",
  david: "11111111-1111-1111-1111-000000000004",
} as const;

export const TEST_WORKSPACE_IDS = {
  aliceSolo: "22222222-2222-2222-2222-000000000001",
  bobShared: "22222222-2222-2222-2222-000000000002",
  davidAlone: "22222222-2222-2222-2222-000000000003",
} as const;
