'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { tickHealthCheck, tickTaskHistoryPurge } = require('./accountDeletionCron');

const NOW = new Date('2026-10-11T22:15:00Z');
const hoursAgo = (hours) => new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();

// Минимальный ctx: pool отдаёт заданный health, captureMessage копит вызовы.
function makeCtx(health, thresholds) {
  const messages = [];
  const ctx = {
    supabaseUrl: 'http://supabase.example',
    serviceRoleKey: 'test-key',
    pool: { query: async () => ({ rows: [{ health }] }) },
    captureMessage: (message, options) => messages.push({ message, options }),
    logger: { log() {}, warn() {}, error() {} },
    now: () => NOW,
    healthCheckThresholds: thresholds,
  };
  return { ctx, messages };
}

const healthWith = (overrides) => ({
  stuck_purges: 0,
  oldest_stuck_purge: null,
  stuck_exports: 0,
  stuck_expired_files: 0,
  ...overrides,
});

test('purge waiting for the next daily run is not reported', async () => {
  // Grace period кончился в 10:23, purge-крон придёт только в 04:00 — это норма.
  const { ctx, messages } = makeCtx(healthWith({ stuck_purges: 1, oldest_stuck_purge: hoursAgo(12) }));
  const result = await tickHealthCheck(ctx);
  assert.deepEqual(result.breaches, []);
  assert.equal(messages.length, 0);
});

test('purge that outlived a daily run is reported', async () => {
  const { ctx, messages } = makeCtx(healthWith({ stuck_purges: 1, oldest_stuck_purge: hoursAgo(27) }));
  const result = await tickHealthCheck(ctx);
  assert.deepEqual(result.breaches, ['stuck_purges']);
  assert.equal(messages.length, 1);
  assert.match(messages[0].message, /stuck_purges/);
});

test('stuck purges without a timestamp are still reported', async () => {
  const { ctx } = makeCtx(healthWith({ stuck_purges: 2, oldest_stuck_purge: null }));
  const result = await tickHealthCheck(ctx);
  assert.deepEqual(result.breaches, ['stuck_purges']);
});

test('purge age threshold is configurable', async () => {
  const { ctx } = makeCtx(
    healthWith({ stuck_purges: 1, oldest_stuck_purge: hoursAgo(3) }),
    { stuckPurgeMinAgeHours: 2 },
  );
  const result = await tickHealthCheck(ctx);
  assert.deepEqual(result.breaches, ['stuck_purges']);
});

test('export breaches are unaffected by the purge age rule', async () => {
  const { ctx } = makeCtx(healthWith({ stuck_exports: 4, stuck_expired_files: 11 }));
  const result = await tickHealthCheck(ctx);
  assert.deepEqual(result.breaches, ['stuck_exports', 'stuck_expired_files']);
});

// ─── Minute-level jobs that call Edge Functions ───
// A deploy restarts the functions for a few seconds; one failed tick then is
// expected and must not page. A job that keeps failing must still be reported.

const { tickPush, tickBroadcast, tickDataExportWorker } = require('./accountDeletionCron');

function makeFunctionCtx(responses) {
  const exceptions = [];
  const queue = [...responses];
  const ctx = {
    supabaseUrl: 'http://supabase.example',
    serviceRoleKey: 'test-key',
    pool: { query: async () => ({ rows: [] }) },
    fetchImpl: async () => {
      const status = queue.shift() ?? 200;
      return { ok: status < 400, status, text: async () => (status < 400 ? '{}' : '<html>502</html>') };
    },
    captureException: (error, options) => exceptions.push({ error, options }),
    logger: { log() {}, warn() {}, error() {} },
    failureStreaks: new Map(),
  };
  return { ctx, exceptions };
}

const runTicks = async (tick, ctx, count) => {
  for (let i = 0; i < count; i += 1) {
    try { await tick(ctx); } catch (_err) { /* the cron wrapper swallows it */ }
  }
};

test('push: a failure during a deploy restart is not reported', async () => {
  const { ctx, exceptions } = makeFunctionCtx([502, 502]);
  await runTicks(tickPush, ctx, 2);
  assert.equal(exceptions.length, 0);
});

test('push: three failed minutes in a row are reported', async () => {
  const { ctx, exceptions } = makeFunctionCtx([502, 502, 502]);
  await runTicks(tickPush, ctx, 3);
  assert.equal(exceptions.length, 1);
  assert.equal(exceptions[0].options.tags.job, 'push-flush');
  assert.match(exceptions[0].error.message, /\/functions\/v1\/push returned 502/);
  assert.equal(exceptions[0].options.extra.consecutiveFailures, 3);
});

test('push: a successful tick resets the count', async () => {
  const { ctx, exceptions } = makeFunctionCtx([502, 502, 200, 502, 502]);
  await runTicks(tickPush, ctx, 5);
  assert.equal(exceptions.length, 0);
});

test('push: a lasting outage keeps being reported', async () => {
  const { ctx, exceptions } = makeFunctionCtx([502, 502, 502, 502]);
  await runTicks(tickPush, ctx, 4);
  assert.equal(exceptions.length, 2);
});

test('broadcast: reported after three failed minutes in a row', async () => {
  const { ctx, exceptions } = makeFunctionCtx([502, 502, 502]);
  await runTicks(tickBroadcast, ctx, 2);
  assert.equal(exceptions.length, 0);
  await runTicks(tickBroadcast, ctx, 1);
  assert.equal(exceptions.length, 1);
  assert.equal(exceptions[0].options.tags.job, 'broadcast-tick');
});

test('data export: runs every 5 minutes, so the second failure in a row is reported', async () => {
  const { ctx, exceptions } = makeFunctionCtx([502, 502]);
  await runTicks(tickDataExportWorker, ctx, 1);
  assert.equal(exceptions.length, 0);
  await runTicks(tickDataExportWorker, ctx, 1);
  assert.equal(exceptions.length, 1);
  assert.equal(exceptions[0].options.tags.job, 'data-export-generate');
});

test('jobs keep separate counts', async () => {
  const { ctx, exceptions } = makeFunctionCtx([502, 502, 502, 502]);
  await runTicks(tickPush, ctx, 2);
  await runTicks(tickBroadcast, ctx, 2);
  assert.equal(exceptions.length, 0);
});

// ─── Edge Function calls, export cleanup, health check, ctx validation ───
// Moved from tests/unit/account-deletion-cron.test.ts (vitest) so the
// service's tests live in one place and run with `npm run test:backup`.

const { mock } = require('node:test');
const {
  postFunction,
  tickAccountPurge,
  tickDataExportCleanup,
  deleteExpiredExportFile,
} = require('./accountDeletionCron');

function makeResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body ?? '')),
  };
}

const emptyResult = async () => ({ rows: [], rowCount: 0 });

function makeCtxWith(overrides = {}) {
  return {
    supabaseUrl: 'http://supabase.local',
    serviceRoleKey: 'svc-key',
    pool: { connect: async () => ({ query: mock.fn(emptyResult), release: mock.fn() }), query: mock.fn(emptyResult) },
    fetchImpl: mock.fn(async () => makeResponse(200, { ok: true })),
    captureException: mock.fn(),
    captureMessage: mock.fn(),
    logger: { log: mock.fn(), warn: mock.fn(), error: mock.fn() },
    failureStreaks: new Map(),
    ...overrides,
  };
}

// A pool whose single client answers each SQL statement with `answer(sql, params)`.
function makeClientPool(answer) {
  const client = { query: mock.fn(async (sql, params) => answer(sql, params)), release: mock.fn() };
  return { client, pool: { connect: async () => client, query: mock.fn() } };
}

const healthPool = (health) => ({ connect: mock.fn(), query: mock.fn(async () => ({ rows: [{ health }], rowCount: 1 })) });

test('postFunction: sends POST with the bearer and parses the JSON answer', async () => {
  const fetchImpl = mock.fn(async (_url, init) => {
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.Authorization, 'Bearer svc-key');
    assert.equal(init.headers['Content-Type'], 'application/json');
    assert.equal(init.body, '{"action":"generate"}');
    return makeResponse(200, { status: 'ok' });
  });
  const result = await postFunction(makeCtxWith({ fetchImpl }), '/functions/v1/x', { action: 'generate' });
  assert.deepEqual(result, { status: 'ok' });
});

test('postFunction: sends an empty JSON body when none is given', async () => {
  const fetchImpl = mock.fn(async (_url, init) => {
    assert.equal(init.body, '{}');
    return makeResponse(200, {});
  });
  await postFunction(makeCtxWith({ fetchImpl }), '/functions/v1/x');
  assert.equal(fetchImpl.mock.callCount(), 1);
});

test('postFunction: throws with status and body when the answer is not ok', async () => {
  const ctx = makeCtxWith({ fetchImpl: mock.fn(async () => makeResponse(500, { error: 'boom' })) });
  await assert.rejects(postFunction(ctx, '/functions/v1/x'), { message: /500/, status: 500, body: { error: 'boom' } });
});

test('postFunction: wraps a non-JSON 2xx answer into { raw }', async () => {
  const ctx = makeCtxWith({ fetchImpl: mock.fn(async () => makeResponse(200, 'not-json-text')) });
  assert.deepEqual(await postFunction(ctx, '/x'), { raw: 'not-json-text' });
});

test('account purge: skipped when the cron is disabled', async () => {
  const fetchImpl = mock.fn();
  const result = await tickAccountPurge(makeCtxWith({ cronEnabled: false, fetchImpl }));
  assert.deepEqual(result, { skipped: true, reason: 'disabled' });
  assert.equal(fetchImpl.mock.callCount(), 0);
});

test('account purge: POSTs /functions/v1/account-purge and logs the result', async () => {
  const fetchImpl = mock.fn(async (url) => {
    assert.equal(url, 'http://supabase.local/functions/v1/account-purge');
    return makeResponse(200, { processed: 3, purged: 3, failed: 0 });
  });
  const ctx = makeCtxWith({ fetchImpl });
  assert.deepEqual(await tickAccountPurge(ctx), { processed: 3, purged: 3, failed: 0 });
  assert.ok(ctx.logger.log.mock.callCount() > 0);
  assert.equal(ctx.captureMessage.mock.callCount(), 0);
});

test('account purge: a failed row raises a warning', async () => {
  const ctx = makeCtxWith({ fetchImpl: mock.fn(async () => makeResponse(200, { processed: 2, purged: 1, failed: 1 })) });
  await tickAccountPurge(ctx);
  assert.equal(ctx.captureMessage.mock.callCount(), 1);
  const [, options] = ctx.captureMessage.mock.calls[0].arguments;
  assert.equal(options.level, 'warning');
  assert.equal(options.tags.job, 'account-purge');
});

test('account purge: a failed call is captured and re-thrown', async () => {
  const ctx = makeCtxWith({ fetchImpl: mock.fn(async () => makeResponse(500, 'upstream down')) });
  await assert.rejects(tickAccountPurge(ctx), /500/);
  assert.equal(ctx.captureException.mock.callCount(), 1);
  const [error, options] = ctx.captureException.mock.calls[0].arguments;
  assert.ok(error instanceof Error);
  assert.equal(options.tags.job, 'account-purge');
});

test('data export: POSTs {action:"generate"} and stays quiet when idle', async () => {
  const fetchImpl = mock.fn(async (url, init) => {
    assert.equal(url, 'http://supabase.local/functions/v1/data-export');
    assert.deepEqual(JSON.parse(init.body), { action: 'generate' });
    return makeResponse(200, { status: 'idle' });
  });
  const ctx = makeCtxWith({ fetchImpl });
  assert.deepEqual(await tickDataExportWorker(ctx), { status: 'idle' });
  assert.equal(ctx.logger.log.mock.callCount(), 0);
});

test('data export: logs a non-idle status with the request id', async () => {
  const ctx = makeCtxWith({ fetchImpl: mock.fn(async () => makeResponse(200, { status: 'ready', request_id: 'req-1' })) });
  await tickDataExportWorker(ctx);
  assert.equal(ctx.logger.log.mock.callCount(), 1);
  const [line] = ctx.logger.log.mock.calls[0].arguments;
  assert.match(line, /ready/);
  assert.match(line, /req-1/);
});

test('data export: a network error is re-thrown to the cron wrapper', async () => {
  const ctx = makeCtxWith({ fetchImpl: mock.fn(async () => { throw new Error('network fail'); }) });
  await assert.rejects(tickDataExportWorker(ctx), /network fail/);
});

test('export file delete: no-op for an empty path', async () => {
  const fetchImpl = mock.fn();
  assert.deepEqual(await deleteExpiredExportFile(makeCtxWith({ fetchImpl }), ''), { ok: true, skipped: true });
  assert.equal(fetchImpl.mock.callCount(), 0);
});

test('export file delete: DELETEs from the user-exports bucket with the bearer', async () => {
  const fetchImpl = mock.fn(async (url, init) => {
    assert.equal(url, 'http://supabase.local/storage/v1/object/user-exports/alice/req-1.json');
    assert.equal(init.method, 'DELETE');
    assert.equal(init.headers.Authorization, 'Bearer svc-key');
    return makeResponse(200, '');
  });
  assert.deepEqual(await deleteExpiredExportFile(makeCtxWith({ fetchImpl }), 'alice/req-1.json'), { ok: true, status: 200 });
});

test('export file delete: 404 counts as already deleted', async () => {
  const ctx = makeCtxWith({ fetchImpl: mock.fn(async () => makeResponse(404, '')) });
  assert.deepEqual(await deleteExpiredExportFile(ctx, 'missing.json'), { ok: true, status: 404 });
});

test('export file delete: other errors throw with the status', async () => {
  const ctx = makeCtxWith({ fetchImpl: mock.fn(async () => makeResponse(500, 'storage broken')) });
  await assert.rejects(deleteExpiredExportFile(ctx, 'x.json'), { message: /500/, status: 500 });
});

test('export cleanup: commits and stays quiet when nothing expired', async () => {
  const statements = [];
  const { client, pool } = makeClientPool((sql) => { statements.push(sql); return { rows: [], rowCount: 0 }; });
  const ctx = makeCtxWith({ pool });
  assert.deepEqual(await tickDataExportCleanup(ctx), { picked: 0, expired: 0, failed: 0 });
  assert.ok(statements.includes('begin'));
  assert.ok(statements.includes('commit'));
  assert.ok(client.release.mock.callCount() > 0);
  assert.equal(ctx.logger.log.mock.callCount(), 0);
});

test('export cleanup: deletes each file, finalizes each request, logs a summary', async () => {
  const picked = [
    { request_id: 'r1', user_id: 'u1', file_path: 'a/1.json', expires_at: new Date() },
    { request_id: 'r2', user_id: 'u2', file_path: 'b/2.json', expires_at: new Date() },
  ];
  const finalized = [];
  const { pool } = makeClientPool((sql, params) => {
    if (sql.includes('_pick_expired_exports')) return { rows: picked, rowCount: 2 };
    if (sql.includes('_finalize_export_request')) finalized.push(params);
    return { rows: [], rowCount: 0 };
  });
  const fetchImpl = mock.fn(async () => makeResponse(200, ''));
  const ctx = makeCtxWith({ pool, fetchImpl });

  assert.deepEqual(await tickDataExportCleanup(ctx), { picked: 2, expired: 2, failed: 0 });
  assert.equal(fetchImpl.mock.callCount(), 2);
  assert.deepEqual(finalized, [['r1', 'expired'], ['r2', 'expired']]);
  assert.equal(ctx.logger.log.mock.callCount(), 1);
  assert.equal(ctx.captureException.mock.callCount(), 0);
});

test('export cleanup: one failed row does not stop the batch', async () => {
  const picked = [
    { request_id: 'r1', user_id: 'u1', file_path: 'good.json' },
    { request_id: 'r2', user_id: 'u2', file_path: 'bad.json' },
    { request_id: 'r3', user_id: 'u3', file_path: 'good2.json' },
  ];
  const finalized = [];
  const { pool } = makeClientPool((sql, params) => {
    if (sql.includes('_pick_expired_exports')) return { rows: picked, rowCount: 3 };
    if (sql.includes('_finalize_export_request')) finalized.push(params);
    return { rows: [], rowCount: 0 };
  });
  const fetchImpl = mock.fn(async (url) => (url.includes('bad.json') ? makeResponse(500, 'storage error') : makeResponse(200, '')));
  const ctx = makeCtxWith({ pool, fetchImpl });

  assert.deepEqual(await tickDataExportCleanup(ctx), { picked: 3, expired: 2, failed: 1 });
  // Only the successful deletes are finalized.
  assert.deepEqual(finalized.map((params) => params[0]), ['r1', 'r3']);
  assert.equal(ctx.captureException.mock.callCount(), 1);
  const [, options] = ctx.captureException.mock.calls[0].arguments;
  assert.equal(options.extra.request_id, 'r2');
  assert.equal(options.extra.file_path, 'bad.json');
});

test('export cleanup: rolls back and captures when picking rows fails', async () => {
  const statements = [];
  const { client, pool } = makeClientPool((sql) => {
    statements.push(sql);
    if (sql.includes('_pick_expired_exports')) throw new Error('db down');
    return { rows: [], rowCount: 0 };
  });
  const ctx = makeCtxWith({ pool });

  await assert.rejects(tickDataExportCleanup(ctx), /db down/);
  assert.ok(statements.includes('begin'));
  assert.ok(!statements.includes('commit'));
  assert.ok(statements.includes('rollback'));
  assert.ok(ctx.captureException.mock.callCount() > 0);
  assert.ok(client.release.mock.callCount() > 0);
});

const healthyCounters = {
  stuck_purges: 0,
  stuck_exports: 0,
  stuck_expired_files: 0,
  oldest_stuck_purge: null,
  oldest_stuck_export: null,
  checked_at: '2026-10-11T22:15:00Z',
};

test('health check: no breaches when every counter is under its threshold', async () => {
  const ctx = makeCtxWith({ pool: healthPool(healthyCounters) });
  assert.deepEqual(await tickHealthCheck(ctx), { health: healthyCounters, breaches: [] });
  assert.equal(ctx.captureMessage.mock.callCount(), 0);
  assert.equal(ctx.logger.warn.mock.callCount(), 0);
});

test('health check: a breach sends one warning and one warn log', async () => {
  const ctx = makeCtxWith({ pool: healthPool({ ...healthyCounters, stuck_purges: 2 }) });
  const result = await tickHealthCheck(ctx);
  assert.deepEqual(result.breaches, ['stuck_purges']);
  assert.equal(ctx.captureMessage.mock.callCount(), 1);
  assert.equal(ctx.captureMessage.mock.calls[0].arguments[1].level, 'warning');
  assert.equal(ctx.logger.warn.mock.callCount(), 1);
});

test('health check: custom thresholds are respected', async () => {
  const ctx = makeCtxWith({
    pool: healthPool({ ...healthyCounters, stuck_exports: 4 }),
    healthCheckThresholds: { stuckPurges: 0, stuckExports: 5, stuckExpiredFiles: 10 },
  });
  assert.deepEqual((await tickHealthCheck(ctx)).breaches, []);
  assert.equal(ctx.captureMessage.mock.callCount(), 0);
});

test('health check: all breaches come in one message', async () => {
  const ctx = makeCtxWith({
    pool: healthPool({ ...healthyCounters, stuck_purges: 1, stuck_exports: 20, stuck_expired_files: 100 }),
  });
  assert.deepEqual((await tickHealthCheck(ctx)).breaches, ['stuck_purges', 'stuck_exports', 'stuck_expired_files']);
  assert.equal(ctx.captureMessage.mock.callCount(), 1);
});

test('health check: a failed query is captured and re-thrown', async () => {
  const pool = { connect: mock.fn(), query: mock.fn(async () => { throw new Error('query timeout'); }) };
  const ctx = makeCtxWith({ pool });
  await assert.rejects(tickHealthCheck(ctx), /query timeout/);
  assert.equal(ctx.captureException.mock.callCount(), 1);
  assert.equal(ctx.captureException.mock.calls[0].arguments[1].tags.job, 'account-deletion-health');
});

test('ctx validation: every required field is checked', async () => {
  await assert.rejects(tickAccountPurge(undefined), /ctx is required/);
  await assert.rejects(tickAccountPurge({ serviceRoleKey: 'k', pool: {} }), /SUPABASE_URL is required/);
  await assert.rejects(tickAccountPurge({ supabaseUrl: 'http://x', pool: {} }), /SERVICE_ROLE_KEY is required/);
  await assert.rejects(tickAccountPurge({ supabaseUrl: 'http://x', serviceRoleKey: 'k' }), /pool is required/);
});

test('task history purge asks the database once and reports how much it removed', async () => {
  const queries = [];
  const ctx = {
    supabaseUrl: 'http://supabase.example',
    serviceRoleKey: 'test-key',
    pool: { query: async (sql) => { queries.push(sql); return { rows: [{ removed: 3 }] }; } },
    logger: { log() {}, warn() {}, error() {} },
  };
  assert.deepEqual(await tickTaskHistoryPurge(ctx), { removed: 3 });
  assert.deepEqual(queries, ['select public.purge_task_history() as removed']);
});

test('a failed task history purge is reported and rethrown', async () => {
  const reported = [];
  const ctx = {
    supabaseUrl: 'http://supabase.example',
    serviceRoleKey: 'test-key',
    pool: { query: async () => { throw new Error('db is down'); } },
    captureException: (error, options) => reported.push({ error, options }),
    logger: { log() {}, warn() {}, error() {} },
  };
  await assert.rejects(tickTaskHistoryPurge(ctx), /db is down/);
  assert.equal(reported.length, 1);
  assert.equal(reported[0].options.tags.job, 'task-history-purge');
});
