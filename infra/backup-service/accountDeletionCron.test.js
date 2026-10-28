'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { tickHealthCheck } = require('./accountDeletionCron');

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
