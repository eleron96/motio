'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { runDailyBackup, createHeartbeat } = require('./dailyRun');

const makeDeps = () => {
  const calls = { captured: [], pings: 0 };
  const deps = {
    captureException: (error, options) => { calls.captured.push([error.message, options]); },
    pingHeartbeat: async () => { calls.pings += 1; },
    log: () => {},
  };
  return { deps, calls };
};

test('all steps succeed -> heartbeat pinged once, nothing reported', async () => {
  const { deps, calls } = makeDeps();
  const order = [];
  const summary = await runDailyBackup([
    { label: 'db', run: async () => { order.push('db'); return { name: 'a.dump' }; } },
    { label: 'files', run: async () => { order.push('files'); return null; } },
  ], deps);

  assert.deepEqual(order, ['db', 'files']);
  assert.equal(summary.ok, true);
  assert.equal(calls.pings, 1);
  assert.deepEqual(calls.captured, []);
});

test('a failing step is reported with its label, later steps still run, no heartbeat', async () => {
  const { deps, calls } = makeDeps();
  const order = [];
  const summary = await runDailyBackup([
    { label: 'db', run: async () => { throw new Error('pg_dump: connection refused'); } },
    { label: 'files', run: async () => { order.push('files'); } },
  ], deps);

  assert.deepEqual(order, ['files']);
  assert.equal(summary.ok, false);
  assert.deepEqual(summary.results.map((r) => [r.label, r.ok]), [['db', false], ['files', true]]);
  assert.equal(calls.pings, 0);
  assert.equal(calls.captured.length, 1);
  const [message, options] = calls.captured[0];
  assert.equal(message, 'Daily backup step "db" failed: pg_dump: connection refused');
  assert.deepEqual(options.tags, { backupStep: 'db' });
});

test('a failing heartbeat is reported but does not flip the run to failed', async () => {
  const { deps, calls } = makeDeps();
  deps.pingHeartbeat = async () => { throw new Error('ECONNRESET'); };
  const summary = await runDailyBackup([{ label: 'db', run: async () => {} }], deps);

  assert.equal(summary.ok, true);
  assert.equal(calls.captured.length, 1);
  assert.match(calls.captured[0][0], /heartbeat/i);
});

test('createHeartbeat without a URL is a no-op', async () => {
  let fetched = 0;
  const ping = createHeartbeat('', async () => { fetched += 1; });
  await ping();
  assert.equal(fetched, 0);
});

test('createHeartbeat POSTs to the URL and rejects on a non-2xx answer', async () => {
  const requests = [];
  const ok = createHeartbeat('https://glitchtip.example/heartbeat/abc', async (url, init) => {
    requests.push([url, init.method]);
    return { ok: true, status: 200 };
  });
  await ok();
  assert.deepEqual(requests, [['https://glitchtip.example/heartbeat/abc', 'POST']]);

  const bad = createHeartbeat('https://glitchtip.example/heartbeat/abc', async () => ({ ok: false, status: 404 }));
  await assert.rejects(bad(), /404/);
});
