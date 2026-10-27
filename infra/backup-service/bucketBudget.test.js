'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { checkBucketBudget } = require('./bucketBudget');

const GB = 1024 ** 3;
const MB = 1024 ** 2;
const LIMITS = { warnBytes: 7 * GB, alarmBytes: 9 * GB };

const bucket = [
  { Key: 'daily-20261027-030000.dump.age', Size: 40 * MB },
  { Key: 'pre-restore-20261020-120000.dump', Size: 10 * MB },
  { Key: 'files/stub/stub/avatars/u1/a.png/v1.age', Size: 300 * MB },
  { Key: 'keycloak/keycloak-daily-20261027-030000.dump.age', Size: 2 * MB },
  { Key: 'metabase/metabase-daily-20261027-030000.dump.age', Size: 1 * MB },
  { Key: 'storage-20261001-030000.tar.gz', Size: 100 * MB },
];

test('under the warning line: ok, with a per-family breakdown', () => {
  const result = checkBucketBudget(bucket, LIMITS);
  assert.equal(result.level, 'ok');
  assert.equal(result.totalBytes, 453 * MB);
  assert.deepEqual(result.byFamily, {
    database: 50 * MB,
    files: 300 * MB,
    keycloak: 2 * MB,
    metabase: 1 * MB,
    'legacy archives': 100 * MB,
  });
  assert.match(result.message, /0\.44 GB of 9\.00 GB alarm line/);
});

test('from the warning line: warn; from the alarm line: alarm', () => {
  const at = (bytes) => checkBucketBudget([{ Key: 'files/x', Size: bytes }], LIMITS).level;
  assert.equal(at(7 * GB - 1), 'ok');
  assert.equal(at(7 * GB), 'warn');
  assert.equal(at(9 * GB - 1), 'warn');
  assert.equal(at(9 * GB), 'alarm');
});

test('unknown keys are counted as "other", so nothing escapes the total', () => {
  const result = checkBucketBudget([{ Key: 'random/thing.bin', Size: 5 }], LIMITS);
  assert.deepEqual(result.byFamily, { other: 5 });
  assert.equal(result.totalBytes, 5);
});
