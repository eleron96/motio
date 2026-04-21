import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cron = require("../../infra/backup-service/accountDeletionCron.js") as {
  tickAccountPurge: (ctx: unknown) => Promise<unknown>;
  tickDataExportWorker: (ctx: unknown) => Promise<unknown>;
  tickDataExportCleanup: (ctx: unknown) => Promise<unknown>;
  tickHealthCheck: (ctx: unknown) => Promise<unknown>;
  deleteExpiredExportFile: (ctx: unknown, filePath: string) => Promise<unknown>;
  postFunction: (ctx: unknown, path: string, body?: unknown) => Promise<unknown>;
};

type FetchInit = { method?: string; headers?: Record<string, string>; body?: string };
type FetchResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
};

function makeResponse(status: number, body: unknown): FetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body ?? "")),
  };
}

type MockClient = {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
};

type MockPool = {
  connect: () => Promise<MockClient>;
  query: ReturnType<typeof vi.fn>;
  _client: MockClient;
};

function makePool(queryImpl?: (...args: unknown[]) => unknown): MockPool {
  const client: MockClient = {
    query: vi.fn(queryImpl ?? (async () => ({ rows: [], rowCount: 0 }))),
    release: vi.fn(),
  };
  return {
    _client: client,
    connect: async () => client,
    query: vi.fn(queryImpl ?? (async () => ({ rows: [], rowCount: 0 }))),
  };
}

function makeCtx(overrides: Record<string, unknown> = {}) {
  const captureException = vi.fn();
  const captureMessage = vi.fn();
  const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return {
    supabaseUrl: "http://supabase.local",
    serviceRoleKey: "svc-key",
    pool: makePool(),
    fetchImpl: vi.fn(async () => makeResponse(200, { ok: true })),
    captureException,
    captureMessage,
    logger,
    ...overrides,
  };
}

describe("postFunction", () => {
  it("sends POST with bearer and parses JSON response", async () => {
    const ctx = makeCtx({
      fetchImpl: vi.fn(async (_url: string, init: FetchInit) => {
        expect(init.method).toBe("POST");
        expect(init.headers?.Authorization).toBe("Bearer svc-key");
        expect(init.headers?.["Content-Type"]).toBe("application/json");
        expect(init.body).toBe('{"action":"generate"}');
        return makeResponse(200, { status: "ok" });
      }),
    });
    const result = await cron.postFunction(ctx, "/functions/v1/x", { action: "generate" });
    expect(result).toEqual({ status: "ok" });
  });

  it("sends empty body when no body provided", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: FetchInit) => {
      expect(init.body).toBe("{}");
      return makeResponse(200, {});
    });
    await cron.postFunction(makeCtx({ fetchImpl }), "/functions/v1/x");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("throws with status+body when response is not ok", async () => {
    const ctx = makeCtx({
      fetchImpl: vi.fn(async () => makeResponse(500, { error: "boom" })),
    });
    await expect(cron.postFunction(ctx, "/functions/v1/x")).rejects.toMatchObject({
      message: expect.stringContaining("500"),
      status: 500,
      body: { error: "boom" },
    });
  });

  it("wraps non-JSON response text into { raw } and still returns on 2xx", async () => {
    const ctx = makeCtx({
      fetchImpl: vi.fn(async () => makeResponse(200, "not-json-text")),
    });
    const result = await cron.postFunction(ctx, "/x");
    expect(result).toEqual({ raw: "not-json-text" });
  });
});

describe("tickAccountPurge", () => {
  it("skips when cronEnabled is false", async () => {
    const fetchImpl = vi.fn();
    const result = await cron.tickAccountPurge(makeCtx({ cronEnabled: false, fetchImpl }));
    expect(result).toEqual({ skipped: true, reason: "disabled" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("POSTs /functions/v1/account-purge and logs result", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toBe("http://supabase.local/functions/v1/account-purge");
      return makeResponse(200, { processed: 3, purged: 3, failed: 0 });
    });
    const ctx = makeCtx({ fetchImpl });
    const result = await cron.tickAccountPurge(ctx);
    expect(result).toEqual({ processed: 3, purged: 3, failed: 0 });
    expect(ctx.logger.log).toHaveBeenCalled();
    expect(ctx.captureMessage).not.toHaveBeenCalled();
  });

  it("raises captureMessage (warning) when result.failed > 0", async () => {
    const ctx = makeCtx({
      fetchImpl: vi.fn(async () => makeResponse(200, { processed: 2, purged: 1, failed: 1 })),
    });
    await cron.tickAccountPurge(ctx);
    expect(ctx.captureMessage).toHaveBeenCalledOnce();
    const [, options] = ctx.captureMessage.mock.calls[0]!;
    expect(options.level).toBe("warning");
    expect(options.tags.job).toBe("account-purge");
  });

  it("captures exception and re-throws on failure", async () => {
    const ctx = makeCtx({
      fetchImpl: vi.fn(async () => makeResponse(500, "upstream down")),
    });
    await expect(cron.tickAccountPurge(ctx)).rejects.toThrow(/500/);
    expect(ctx.captureException).toHaveBeenCalledOnce();
    const [err, options] = ctx.captureException.mock.calls[0]!;
    expect(err).toBeInstanceOf(Error);
    expect(options.tags.job).toBe("account-purge");
  });
});

describe("tickDataExportWorker", () => {
  it("POSTs /functions/v1/data-export with {action:'generate'} and skips log on idle", async () => {
    const ctx = makeCtx({
      fetchImpl: vi.fn(async (url: string, init: FetchInit) => {
        expect(url).toBe("http://supabase.local/functions/v1/data-export");
        expect(JSON.parse(init.body!)).toEqual({ action: "generate" });
        return makeResponse(200, { status: "idle" });
      }),
    });
    const result = await cron.tickDataExportWorker(ctx);
    expect(result).toEqual({ status: "idle" });
    expect(ctx.logger.log).not.toHaveBeenCalled();
  });

  it("logs when edge function reports a non-idle status", async () => {
    const ctx = makeCtx({
      fetchImpl: vi.fn(async () =>
        makeResponse(200, { status: "ready", request_id: "req-1" }),
      ),
    });
    await cron.tickDataExportWorker(ctx);
    expect(ctx.logger.log).toHaveBeenCalledOnce();
    expect(ctx.logger.log.mock.calls[0]![0]).toContain("ready");
    expect(ctx.logger.log.mock.calls[0]![0]).toContain("req-1");
  });

  it("captures and re-throws on fetch failure", async () => {
    const ctx = makeCtx({
      fetchImpl: vi.fn(async () => {
        throw new Error("network fail");
      }),
    });
    await expect(cron.tickDataExportWorker(ctx)).rejects.toThrow(/network fail/);
    expect(ctx.captureException).toHaveBeenCalledOnce();
    expect(ctx.captureException.mock.calls[0]![1].tags.job).toBe("data-export-generate");
  });
});

describe("deleteExpiredExportFile", () => {
  it("is a no-op when filePath is empty", async () => {
    const fetchImpl = vi.fn();
    const ctx = makeCtx({ fetchImpl });
    const r = await cron.deleteExpiredExportFile(ctx, "");
    expect(r).toEqual({ ok: true, skipped: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("DELETEs against the user-exports bucket with bearer auth", async () => {
    const fetchImpl = vi.fn(async (url: string, init: FetchInit) => {
      expect(url).toBe("http://supabase.local/storage/v1/object/user-exports/alice/req-1.json");
      expect(init.method).toBe("DELETE");
      expect(init.headers?.Authorization).toBe("Bearer svc-key");
      return makeResponse(200, "");
    });
    const ctx = makeCtx({ fetchImpl });
    const r = await cron.deleteExpiredExportFile(ctx, "alice/req-1.json");
    expect(r).toEqual({ ok: true, status: 200 });
  });

  it("treats 404 as already-deleted", async () => {
    const ctx = makeCtx({
      fetchImpl: vi.fn(async () => makeResponse(404, "")),
    });
    const r = await cron.deleteExpiredExportFile(ctx, "missing.json");
    expect(r).toEqual({ ok: true, status: 404 });
  });

  it("throws on other non-ok statuses", async () => {
    const ctx = makeCtx({
      fetchImpl: vi.fn(async () => makeResponse(500, "storage broken")),
    });
    await expect(cron.deleteExpiredExportFile(ctx, "x.json")).rejects.toMatchObject({
      message: expect.stringContaining("500"),
      status: 500,
    });
  });
});

describe("tickDataExportCleanup", () => {
  it("commits with zero picked rows when nothing is expired", async () => {
    const queries: string[] = [];
    const client: MockClient = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes("_pick_expired_exports")) return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    const pool = {
      connect: async () => client,
      query: vi.fn(),
    };
    const ctx = makeCtx({ pool });
    const summary = await cron.tickDataExportCleanup(ctx);
    expect(summary).toEqual({ picked: 0, expired: 0, failed: 0 });
    expect(queries).toContain("begin");
    expect(queries).toContain("commit");
    expect(client.release).toHaveBeenCalled();
    // picked=0 → no log
    expect(ctx.logger.log).not.toHaveBeenCalled();
  });

  it("processes picked rows: deletes files, finalizes each, logs summary", async () => {
    const picked = [
      { request_id: "r1", user_id: "u1", file_path: "a/1.json", expires_at: new Date() },
      { request_id: "r2", user_id: "u2", file_path: "b/2.json", expires_at: new Date() },
    ];
    const finalizeCalls: unknown[][] = [];
    const client: MockClient = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes("_pick_expired_exports")) return { rows: picked, rowCount: 2 };
        if (sql.includes("_finalize_export_request")) {
          finalizeCalls.push(params!);
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    const pool = { connect: async () => client, query: vi.fn() };
    const fetchImpl = vi.fn(async () => makeResponse(200, ""));
    const ctx = makeCtx({ pool, fetchImpl });

    const summary = await cron.tickDataExportCleanup(ctx);
    expect(summary).toEqual({ picked: 2, expired: 2, failed: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(2); // DELETE per file
    expect(finalizeCalls).toHaveLength(2);
    expect(finalizeCalls[0]).toEqual(["r1", "expired"]);
    expect(finalizeCalls[1]).toEqual(["r2", "expired"]);
    expect(ctx.logger.log).toHaveBeenCalledOnce();
    expect(ctx.captureException).not.toHaveBeenCalled();
  });

  it("continues the batch when one row fails and increments failed counter", async () => {
    const picked = [
      { request_id: "r1", user_id: "u1", file_path: "good.json" },
      { request_id: "r2", user_id: "u2", file_path: "bad.json" },
      { request_id: "r3", user_id: "u3", file_path: "good2.json" },
    ];
    const finalizeCalls: unknown[][] = [];
    const client: MockClient = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes("_pick_expired_exports")) return { rows: picked, rowCount: 3 };
        if (sql.includes("_finalize_export_request")) {
          finalizeCalls.push(params!);
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    const pool = { connect: async () => client, query: vi.fn() };
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("bad.json")) return makeResponse(500, "storage error");
      return makeResponse(200, "");
    });
    const ctx = makeCtx({ pool, fetchImpl });

    const summary = await cron.tickDataExportCleanup(ctx);
    expect(summary).toEqual({ picked: 3, expired: 2, failed: 1 });
    // finalize только для успешных.
    expect(finalizeCalls.map((c) => c[0])).toEqual(["r1", "r3"]);
    expect(ctx.captureException).toHaveBeenCalledOnce();
    expect(ctx.captureException.mock.calls[0]![1].extra).toMatchObject({
      request_id: "r2",
      file_path: "bad.json",
    });
  });

  it("rolls back and captures when _pick_expired_exports itself fails", async () => {
    let begun = false;
    let committed = false;
    let rolledBack = false;
    const client: MockClient = {
      query: vi.fn(async (sql: string) => {
        if (sql === "begin") {
          begun = true;
          return { rows: [], rowCount: 0 };
        }
        if (sql === "commit") {
          committed = true;
          return { rows: [], rowCount: 0 };
        }
        if (sql === "rollback") {
          rolledBack = true;
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes("_pick_expired_exports")) {
          throw new Error("db down");
        }
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    const pool = { connect: async () => client, query: vi.fn() };
    const ctx = makeCtx({ pool });

    await expect(cron.tickDataExportCleanup(ctx)).rejects.toThrow(/db down/);
    expect(begun).toBe(true);
    expect(committed).toBe(false);
    expect(rolledBack).toBe(true);
    expect(ctx.captureException).toHaveBeenCalled();
    expect(client.release).toHaveBeenCalled();
  });
});

describe("tickHealthCheck", () => {
  const healthy = {
    stuck_purges: 0,
    stuck_exports: 0,
    stuck_expired_files: 0,
    oldest_stuck_purge: null,
    oldest_stuck_export: null,
    checked_at: new Date().toISOString(),
  };

  it("returns no breaches when all counters are under thresholds", async () => {
    const pool = {
      connect: vi.fn(),
      query: vi.fn(async () => ({ rows: [{ health: healthy }], rowCount: 1 })),
    };
    const ctx = makeCtx({ pool });
    const r = await cron.tickHealthCheck(ctx);
    expect(r).toEqual({ health: healthy, breaches: [] });
    expect(ctx.captureMessage).not.toHaveBeenCalled();
    expect(ctx.logger.warn).not.toHaveBeenCalled();
  });

  it("fires captureMessage and warn-log when stuck_purges > 0", async () => {
    const health = { ...healthy, stuck_purges: 2 };
    const pool = {
      connect: vi.fn(),
      query: vi.fn(async () => ({ rows: [{ health }], rowCount: 1 })),
    };
    const ctx = makeCtx({ pool });
    const r = await cron.tickHealthCheck(ctx);
    expect(r.breaches).toEqual(["stuck_purges"]);
    expect(ctx.captureMessage).toHaveBeenCalledOnce();
    expect(ctx.captureMessage.mock.calls[0]![1].level).toBe("warning");
    expect(ctx.logger.warn).toHaveBeenCalledOnce();
  });

  it("respects custom thresholds (e.g. tolerate up to 5 stuck exports)", async () => {
    const health = { ...healthy, stuck_exports: 4 };
    const pool = {
      connect: vi.fn(),
      query: vi.fn(async () => ({ rows: [{ health }], rowCount: 1 })),
    };
    const ctx = makeCtx({
      pool,
      healthCheckThresholds: { stuckPurges: 0, stuckExports: 5, stuckExpiredFiles: 10 },
    });
    const r = await cron.tickHealthCheck(ctx);
    expect(r.breaches).toEqual([]);
    expect(ctx.captureMessage).not.toHaveBeenCalled();
  });

  it("surfaces all breaches together", async () => {
    const health = {
      ...healthy,
      stuck_purges: 1,
      stuck_exports: 20,
      stuck_expired_files: 100,
    };
    const pool = {
      connect: vi.fn(),
      query: vi.fn(async () => ({ rows: [{ health }], rowCount: 1 })),
    };
    const ctx = makeCtx({ pool });
    const r = await cron.tickHealthCheck(ctx);
    expect(r.breaches).toEqual(["stuck_purges", "stuck_exports", "stuck_expired_files"]);
    expect(ctx.captureMessage).toHaveBeenCalledOnce();
  });

  it("captures and re-throws when DB query fails", async () => {
    const pool = {
      connect: vi.fn(),
      query: vi.fn(async () => {
        throw new Error("query timeout");
      }),
    };
    const ctx = makeCtx({ pool });
    await expect(cron.tickHealthCheck(ctx)).rejects.toThrow(/query timeout/);
    expect(ctx.captureException).toHaveBeenCalledOnce();
    expect(ctx.captureException.mock.calls[0]![1].tags.job).toBe("account-deletion-health");
  });
});

describe("ctx validation", () => {
  it("throws when ctx missing", async () => {
    await expect(cron.tickAccountPurge(undefined as unknown as object)).rejects.toThrow(/ctx is required/);
  });

  it("throws when SUPABASE_URL missing", async () => {
    await expect(
      cron.tickAccountPurge({ serviceRoleKey: "k", pool: {} } as unknown as object),
    ).rejects.toThrow(/SUPABASE_URL is required/);
  });

  it("throws when SERVICE_ROLE_KEY missing", async () => {
    await expect(
      cron.tickAccountPurge({ supabaseUrl: "http://x", pool: {} } as unknown as object),
    ).rejects.toThrow(/SERVICE_ROLE_KEY is required/);
  });

  it("throws when pool missing", async () => {
    await expect(
      cron.tickAccountPurge({ supabaseUrl: "http://x", serviceRoleKey: "k" } as unknown as object),
    ).rejects.toThrow(/pool is required/);
  });
});
