'use strict';

// Incremental backup of uploaded files (avatars, task media) to S3.
//
// Each file in the storage volume goes to S3 once, as files/<path inside the
// volume> (+ ".age" when encrypted). Storage-api writes every upload to a new
// versioned path and never rewrites a file in place, so "the key exists" means
// "this file is backed up". A file that disappears from disk (deleted by a
// user) keeps its S3 copy for a grace period, tracked by a tombstone with the
// date it was first missed, and is deleted after that. The bucket therefore
// holds about one copy of the live files plus the recently deleted ones,
// instead of a full archive per day.

const FILES_PREFIX = 'files/';

// Storage-api's file backend lays objects out as
// <tenant>/<backend bucket>/<storage bucket>/<object name>/<version>.
// Data exports are temporary copies of data that is backed up anyway.
const EXCLUDED_STORAGE_BUCKETS = new Set(['user-exports']);
const STORAGE_BUCKET_SEGMENT = 2;

const fileKeyFor = (rel, encrypted) => `${FILES_PREFIX}${rel}${encrypted ? '.age' : ''}`;

const listLocalFiles = async (root, { fs, path }) => {
  const rels = [];
  const walk = async (relDir) => {
    const entries = await fs.readdir(path.join(root, relDir), { withFileTypes: true });
    for (const entry of entries) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        const segments = rel.split('/');
        if (segments.length === STORAGE_BUCKET_SEGMENT + 1 && EXCLUDED_STORAGE_BUCKETS.has(segments[STORAGE_BUCKET_SEGMENT])) continue;
        await walk(rel);
      } else if (entry.isFile()) {
        rels.push(rel);
      }
    }
  };
  await walk('');
  return rels;
};

// Pure: what to upload, what to delete, and the tombstones to keep.
// tombstones: { [s3Key]: ISO date the key was first found without its file }
const planFileSync = ({ localRels, remoteKeys, tombstones, now, graceMs, keyFor }) => {
  if (localRels.length === 0 && remoteKeys.length > 0) {
    // An unmounted or wiped volume must not start the clock on every backup copy.
    throw new Error(`Storage directory is empty but S3 holds ${remoteKeys.length} file(s); refusing to treat them as deleted.`);
  }
  const expectedKeys = new Set(localRels.map(keyFor));
  const remoteSet = new Set(remoteKeys);

  const toUpload = localRels.filter((rel) => !remoteSet.has(keyFor(rel)));
  const toDelete = [];
  const nextTombstones = {};
  for (const key of remoteKeys) {
    if (expectedKeys.has(key)) continue;
    const since = Date.parse(tombstones[key] || '');
    const missingSince = Number.isFinite(since) ? since : now;
    if (now - missingSince >= graceMs) {
      toDelete.push(key);
    } else {
      nextTombstones[key] = new Date(missingSince).toISOString();
    }
  }
  return { toUpload, toDelete, tombstones: nextTombstones };
};

// deps: { root, encrypted, graceMs, now(), listLocal(), listRemoteKeys(),
//         upload(absPath, key) → written key, deleteKeys(keys),
//         readTombstones(), writeTombstones(next) }
const syncFilesToS3 = async (deps) => {
  const localRels = await deps.listLocal();
  const plan = planFileSync({
    localRels,
    remoteKeys: await deps.listRemoteKeys(),
    tombstones: await deps.readTombstones(),
    now: deps.now(),
    graceMs: deps.graceMs,
    keyFor: (rel) => fileKeyFor(rel, deps.encrypted),
  });

  const failures = [];
  for (const rel of plan.toUpload) {
    try {
      await deps.upload(`${deps.root}/${rel}`, fileKeyFor(rel, false));
    } catch (error) {
      failures.push(error.message || String(error));
    }
  }
  if (plan.toDelete.length > 0) {
    await deps.deleteKeys(plan.toDelete);
  }
  await deps.writeTombstones(plan.tombstones);

  if (failures.length > 0) {
    throw new Error(`${failures.length} of ${plan.toUpload.length} file(s) failed to upload; first: ${failures[0]}`);
  }
  return {
    files: localRels.length,
    uploaded: plan.toUpload.length,
    deleted: plan.toDelete.length,
    awaitingDeletion: Object.keys(plan.tombstones).length,
  };
};

module.exports = { FILES_PREFIX, fileKeyFor, listLocalFiles, planFileSync, syncFilesToS3 };
