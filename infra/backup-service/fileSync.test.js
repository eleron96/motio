'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs/promises');
const { planFileSync, syncFilesToS3, listLocalFiles, fileKeyFor } = require('./fileSync');

const DAY = 86400000;
const NOW = Date.parse('2026-10-27T03:00:00Z');
const plain = (rel) => fileKeyFor(rel, false);

test('fileKeyFor: files/ prefix, .age suffix when encrypted', () => {
  assert.equal(fileKeyFor('stub/stub/avatars/u1/a.png/v1', false), 'files/stub/stub/avatars/u1/a.png/v1');
  assert.equal(fileKeyFor('stub/stub/avatars/u1/a.png/v1', true), 'files/stub/stub/avatars/u1/a.png/v1.age');
});

test('plan: uploads only what S3 does not have yet', () => {
  const plan = planFileSync({
    localRels: ['a', 'b', 'c'],
    remoteKeys: [plain('a')],
    tombstones: {},
    now: NOW,
    graceMs: 90 * DAY,
    keyFor: plain,
  });
  assert.deepEqual(plan.toUpload, ['b', 'c']);
  assert.deepEqual(plan.toDelete, []);
  assert.deepEqual(plan.tombstones, {});
});

test('plan: a file gone from disk is kept for the grace period, then deleted', () => {
  const base = { localRels: ['a'], now: NOW, graceMs: 90 * DAY, keyFor: plain };

  const firstSeen = planFileSync({ ...base, remoteKeys: [plain('a'), plain('gone')], tombstones: {} });
  assert.deepEqual(firstSeen.toDelete, []);
  assert.deepEqual(firstSeen.tombstones, { [plain('gone')]: new Date(NOW).toISOString() });

  const stillInGrace = planFileSync({
    ...base,
    remoteKeys: [plain('a'), plain('gone')],
    tombstones: { [plain('gone')]: new Date(NOW - 89 * DAY).toISOString() },
  });
  assert.deepEqual(stillInGrace.toDelete, []);

  const expired = planFileSync({
    ...base,
    remoteKeys: [plain('a'), plain('gone')],
    tombstones: { [plain('gone')]: new Date(NOW - 90 * DAY).toISOString() },
  });
  assert.deepEqual(expired.toDelete, [plain('gone')]);
  assert.deepEqual(expired.tombstones, {});
});

test('plan: a file that comes back loses its tombstone', () => {
  const plan = planFileSync({
    localRels: ['a'],
    remoteKeys: [plain('a')],
    tombstones: { [plain('a')]: new Date(NOW - 200 * DAY).toISOString() },
    now: NOW,
    graceMs: 90 * DAY,
    keyFor: plain,
  });
  assert.deepEqual(plan.toDelete, []);
  assert.deepEqual(plan.tombstones, {});
});

test('plan: turning encryption on re-uploads as .age and retires the plaintext copy after the grace period', () => {
  const plan = planFileSync({
    localRels: ['a'],
    remoteKeys: [plain('a')],
    tombstones: {},
    now: NOW,
    graceMs: 90 * DAY,
    keyFor: (rel) => fileKeyFor(rel, true),
  });
  assert.deepEqual(plan.toUpload, ['a']);
  assert.deepEqual(Object.keys(plan.tombstones), [plain('a')]);
});

test('plan: an empty storage directory with files in S3 is refused, not treated as "everything deleted"', () => {
  assert.throws(() => planFileSync({
    localRels: [],
    remoteKeys: [plain('a')],
    tombstones: {},
    now: NOW,
    graceMs: 90 * DAY,
    keyFor: plain,
  }), /storage directory is empty/i);
});

test('listLocalFiles: relative posix paths of regular files, user-exports bucket skipped', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'file-sync-'));
  const write = async (rel) => {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fs.writeFile(path.join(root, rel), 'x');
  };
  await write('stub/stub/avatars/u1/a.png/v1');
  await write('stub/stub/task-media/w1/t1/b.jpg/v2');
  await write('stub/stub/user-exports/u1/export.zip/v1');

  assert.deepEqual((await listLocalFiles(root, { fs, path })).sort(), [
    'stub/stub/avatars/u1/a.png/v1',
    'stub/stub/task-media/w1/t1/b.jpg/v2',
  ]);
});

const makeSyncDeps = ({ local, remote, tombstones = {}, failUploadOf = [] }) => {
  const state = { remote: new Set(remote), tombstones, uploads: [], deletes: [] };
  const deps = {
    root: '/storage-blobs',
    encrypted: false,
    graceMs: 90 * DAY,
    now: () => NOW,
    listLocal: async () => local,
    listRemoteKeys: async () => [...state.remote],
    upload: async (absPath, key) => {
      if (failUploadOf.includes(key)) throw new Error(`S3 upload failed for ${key}: boom`);
      state.uploads.push([absPath, key]);
      state.remote.add(key);
      return key;
    },
    deleteKeys: async (keys) => { state.deletes.push(...keys); keys.forEach((k) => state.remote.delete(k)); },
    readTombstones: async () => state.tombstones,
    writeTombstones: async (next) => { state.tombstones = next; },
  };
  return { deps, state };
};

test('sync: uploads new files from the storage root, deletes expired ones, saves tombstones', async () => {
  const { deps, state } = makeSyncDeps({
    local: ['x/new', 'x/kept'],
    remote: [plain('x/kept'), plain('x/old'), plain('x/recent')],
    tombstones: {
      [plain('x/old')]: new Date(NOW - 100 * DAY).toISOString(),
    },
  });
  const summary = await syncFilesToS3(deps);

  assert.deepEqual(state.uploads, [['/storage-blobs/x/new', 'files/x/new']]);
  assert.deepEqual(state.deletes, [plain('x/old')]);
  assert.deepEqual(state.tombstones, { [plain('x/recent')]: new Date(NOW).toISOString() });
  assert.deepEqual(summary, { files: 2, uploaded: 1, deleted: 1, awaitingDeletion: 1 });
});

test('sync: one failed upload does not stop the others, and the step still fails loudly', async () => {
  const { deps, state } = makeSyncDeps({ local: ['a', 'b', 'c'], remote: [], failUploadOf: ['files/b'] });

  await assert.rejects(syncFilesToS3(deps), /1 of 3 file\(s\) failed to upload.*files\/b/);
  assert.deepEqual(state.uploads.map(([, key]) => key), ['files/a', 'files/c']);
});
