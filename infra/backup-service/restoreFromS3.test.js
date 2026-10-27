'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs/promises');
const { planRestore, downloadBackupSet } = require('./restoreFromS3');

const at = (iso) => new Date(iso);
const bucket = [
  { Key: 'daily-20261026-030000.dump.age', LastModified: at('2026-10-26T03:00:00Z') },
  { Key: 'daily-20261027-030000.dump.age', LastModified: at('2026-10-27T03:00:00Z') },
  { Key: 'manual-20261020-120000.dump', LastModified: at('2026-10-20T12:00:00Z') },
  { Key: 'keycloak/keycloak-daily-20261027-030000.dump.age', LastModified: at('2026-10-27T03:01:00Z') },
  { Key: 'keycloak/keycloak-daily-20261026-030000.dump.age', LastModified: at('2026-10-26T03:01:00Z') },
  { Key: 'files/stub/stub/avatars/u1/a.png/v1.age', LastModified: at('2026-10-01T03:00:00Z') },
  { Key: 'files/stub/stub/task-media/t1/b.jpg/v1', LastModified: at('2026-09-01T03:00:00Z') },
  { Key: 'storage-20261001-030000.tar.gz', LastModified: at('2026-10-01T03:00:00Z') },
];

test('plan: newest dump of each database, every file, legacy archives ignored', () => {
  const plan = planRestore(bucket, {});
  assert.equal(plan.database, 'daily-20261027-030000.dump.age');
  assert.equal(plan.keycloak, 'keycloak/keycloak-daily-20261027-030000.dump.age');
  assert.equal(plan.metabase, null);
  assert.deepEqual(plan.files, [
    'files/stub/stub/avatars/u1/a.png/v1.age',
    'files/stub/stub/task-media/t1/b.jpg/v1',
  ]);
});

test('plan: a file stored both plain and encrypted (encryption switch-over) is restored once, from the encrypted copy', () => {
  const plan = planRestore([
    ...bucket,
    { Key: 'files/stub/stub/avatars/u1/a.png/v1', LastModified: at('2026-09-01T03:00:00Z') },
  ], {});
  assert.deepEqual(plan.files, [
    'files/stub/stub/avatars/u1/a.png/v1.age',
    'files/stub/stub/task-media/t1/b.jpg/v1',
  ]);
});

test('plan: a named database dump wins over the newest, and an unknown name is an error', () => {
  assert.equal(planRestore(bucket, { database: 'manual-20261020-120000.dump' }).database, 'manual-20261020-120000.dump');
  assert.throws(() => planRestore(bucket, { database: 'nope.dump' }), /not found in the bucket: nope\.dump/);
});

test('plan: an empty bucket is an error, not an empty restore', () => {
  assert.throws(() => planRestore([], {}), /no database dump/i);
});

test('download: plain objects land as is, .age ones are decrypted and lose the suffix', async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'restore-from-s3-'));
  const decrypted = [];
  const summary = await downloadBackupSet({
    plan: {
      database: 'daily-20261027-030000.dump.age',
      keycloak: null,
      metabase: null,
      files: ['files/stub/stub/avatars/u1/a.png/v1.age', 'files/stub/stub/task-media/t1/b.jpg/v1'],
    },
    out,
    identityPath: '/keys/owner.txt',
    fs,
    path,
    download: async (key, dst) => { await fs.writeFile(dst, `BODY(${key})`); },
    decryptFile: async (src, dst, identity) => {
      decrypted.push(identity);
      await fs.writeFile(dst, `DEC(${await fs.readFile(src, 'utf8')})`);
    },
  });

  assert.equal(await fs.readFile(path.join(out, 'database', 'daily-20261027-030000.dump'), 'utf8'), 'DEC(BODY(daily-20261027-030000.dump.age))');
  assert.equal(await fs.readFile(path.join(out, 'files', 'stub/stub/avatars/u1/a.png/v1'), 'utf8'), 'DEC(BODY(files/stub/stub/avatars/u1/a.png/v1.age))');
  assert.equal(await fs.readFile(path.join(out, 'files', 'stub/stub/task-media/t1/b.jpg/v1'), 'utf8'), 'BODY(files/stub/stub/task-media/t1/b.jpg/v1)');
  await assert.rejects(fs.access(path.join(out, 'database', 'daily-20261027-030000.dump.age')));
  assert.deepEqual(decrypted, ['/keys/owner.txt', '/keys/owner.txt']);
  assert.deepEqual(summary, { database: 'daily-20261027-030000.dump', keycloak: null, metabase: null, files: 2 });
});

test('download: encrypted objects without an identity stop before touching anything', async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'restore-from-s3-'));
  let downloads = 0;
  await assert.rejects(downloadBackupSet({
    plan: { database: 'daily-20261027-030000.dump.age', keycloak: null, metabase: null, files: [] },
    out,
    identityPath: '',
    fs,
    path,
    download: async () => { downloads += 1; },
    decryptFile: async () => {},
  }), /encrypted.*--identity/);
  assert.equal(downloads, 0);
});

test('download: refuses an object key that would escape the output directory', async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'restore-from-s3-'));
  await assert.rejects(downloadBackupSet({
    plan: { database: 'daily.dump', keycloak: null, metabase: null, files: ['files/../../etc/passwd'] },
    out,
    identityPath: '',
    fs,
    path,
    download: async (key, dst) => { await fs.writeFile(dst, 'x'); },
    decryptFile: async () => {},
  }), /outside the output directory/);
});
