'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs/promises');
const { createSideDbBackup, pruneLocalDumps, s3PatternFor } = require('./sideDbBackup');

const makeDir = () => fs.mkdtemp(path.join(os.tmpdir(), 'side-db-backup-'));

// Fake deps: pg_dump writes `dumpContent` to --file; pg_restore succeeds unless told otherwise.
const makeDeps = ({ dumpContent = 'PGDMP fake', restoreFails = false } = {}) => {
  const calls = { exec: [], uploads: [], prunes: [] };
  const deps = {
    fs,
    path,
    buildTimestamp: () => '20261027-030000',
    execFileAsync: async (cmd, args) => {
      calls.exec.push([cmd, args]);
      if (cmd === 'pg_dump') await fs.writeFile(args[args.indexOf('--file') + 1], dumpContent);
      if (cmd === 'pg_restore' && restoreFails) throw new Error('not a valid archive');
      return { stdout: '', stderr: '' };
    },
    uploadToS3: async (filePath, key) => { calls.uploads.push(key); },
    pruneS3: async (pattern, keep) => { calls.prunes.push([pattern, keep]); },
  };
  return { deps, calls };
};

const target = (dir, overrides = {}) => ({
  label: 'metabase', dbUrl: 'postgresql://u:p@metabase-db:5432/metabase', dir, retentionCount: 90, s3Prefix: 'metabase', ...overrides,
});

test('no dbUrl -> null and nothing runs', async () => {
  const dir = await makeDir();
  const { deps, calls } = makeDeps();
  assert.equal(await createSideDbBackup(target(dir, { dbUrl: '' }), deps), null);
  assert.equal(calls.exec.length, 0);
  assert.equal(calls.uploads.length, 0);
});

test('dumps, validates, uploads under its own prefix and prunes only that prefix', async () => {
  const dir = await makeDir();
  const { deps, calls } = makeDeps();
  const backup = await createSideDbBackup(target(dir), deps);

  assert.equal(backup.name, 'metabase-daily-20261027-030000.dump');
  assert.equal(backup.type, 'metabase');
  assert.ok(backup.size > 0);
  await fs.access(path.join(dir, backup.name));

  const [dumpCmd, dumpArgs] = calls.exec[0];
  assert.equal(dumpCmd, 'pg_dump');
  assert.ok(dumpArgs.includes('--format=custom'));
  assert.equal(dumpArgs[dumpArgs.indexOf('--dbname') + 1], 'postgresql://u:p@metabase-db:5432/metabase');
  assert.equal(calls.exec[1][0], 'pg_restore');

  assert.deepEqual(calls.uploads, ['metabase/metabase-daily-20261027-030000.dump']);
  const [pattern, keep] = calls.prunes[0];
  assert.equal(keep, 90);
  assert.ok(pattern.test('metabase/metabase-daily-20261027-030000.dump'));
  assert.ok(!pattern.test('keycloak/keycloak-daily-20261027-030000.dump'));
  assert.ok(!pattern.test('daily-20261027-030000.dump'));
});

test('corrupt dump -> file removed, error names the target, no upload', async () => {
  const dir = await makeDir();
  const { deps, calls } = makeDeps({ restoreFails: true });
  await assert.rejects(createSideDbBackup(target(dir), deps), /metabase backup validation failed/);
  assert.deepEqual(await fs.readdir(dir), []);
  assert.equal(calls.uploads.length, 0);
});

test('empty dump -> file removed, no upload', async () => {
  const dir = await makeDir();
  const { deps, calls } = makeDeps({ dumpContent: '' });
  await assert.rejects(createSideDbBackup(target(dir), deps), /metabase backup file is empty/);
  assert.deepEqual(await fs.readdir(dir), []);
  assert.equal(calls.uploads.length, 0);
});

test('local prune keeps the newest N, never deletes protected, ignores foreign files', async () => {
  const dir = await makeDir();
  const names = ['a.dump', 'b.dump', 'c.dump', 'd.dump'];
  for (const [i, name] of names.entries()) {
    const file = path.join(dir, name);
    await fs.writeFile(file, 'x');
    const t = new Date(Date.UTC(2026, 9, 1 + i)); // a oldest … d newest
    await fs.utimes(file, t, t);
  }
  await fs.writeFile(path.join(dir, 'notes.txt'), 'keep me');

  await pruneLocalDumps(dir, 2, ['a.dump'], { fs, path });

  // d, c = two newest; b deleted; a survives only because it is protected.
  assert.deepEqual((await fs.readdir(dir)).sort(), ['a.dump', 'c.dump', 'd.dump', 'notes.txt']);
});

test('s3PatternFor escapes the prefix', () => {
  const pattern = s3PatternFor('meta.base');
  assert.ok(pattern.test('meta.base/x.dump'));
  assert.ok(!pattern.test('metaXbase/x.dump'));
});
