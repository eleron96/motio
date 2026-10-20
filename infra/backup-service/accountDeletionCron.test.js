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
