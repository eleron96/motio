'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { selectExpiredKeys, selectKeysOlderThan, MIN_SAFE_KEEP } = require('./retention');

// Build an object dated `daysAgo` before a fixed reference date.
function obj(key, daysAgo) {
  const d = new Date('2026-06-29T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return { Key: key, LastModified: d.toISOString() };
}

test('keeps everything when count <= keepCount', () => {
  const objs = [obj('a', 0), obj('b', 1), obj('c', 2)];
  assert.deepEqual(selectExpiredKeys(objs, 90), []);
});

test('deletes only the oldest beyond keepCount; newest are kept', () => {
  // i=0 is newest, i=94 is oldest.
  const objs = Array.from({ length: 95 }, (_, i) => obj(`k${i}`, i));
  const del = selectExpiredKeys(objs, 90);
  assert.equal(del.length, 5);
  assert.deepEqual(del.sort(), ['k90', 'k91', 'k92', 'k93', 'k94'].sort());
});

test('hard floor: never prunes below MIN_SAFE_KEEP', () => {
  const four = Array.from({ length: 4 }, (_, i) => obj(`k${i}`, i));
  assert.deepEqual(selectExpiredKeys(four, 1), []); // 4 <= floor(5) -> keep all
  const six = Array.from({ length: 6 }, (_, i) => obj(`k${i}`, i));
  assert.equal(selectExpiredKeys(six, 1).length, 1); // floor 5 -> delete only the oldest
  assert.equal(MIN_SAFE_KEEP, 5);
});

test('keepCount <= 0 or invalid -> no deletes', () => {
  assert.deepEqual(selectExpiredKeys([obj('a', 0)], 0), []);
  assert.deepEqual(selectExpiredKeys([obj('a', 0)], -3), []);
  assert.deepEqual(selectExpiredKeys([obj('a', 0)], NaN), []);
});

test('empty / malformed input is safe', () => {
  assert.deepEqual(selectExpiredKeys([], 90), []);
  assert.deepEqual(selectExpiredKeys(null, 90), []);
  assert.deepEqual(selectExpiredKeys([{ no: 'key' }], 90), []);
});

test('selectKeysOlderThan returns keys strictly older than cutoff', () => {
  const objs = [obj('apr', 70), obj('may', 40), obj('jun', 5)];
  assert.deepEqual(selectKeysOlderThan(objs, '2026-05-01T00:00:00Z'), ['apr']);
});

test('selectKeysOlderThan: invalid cutoff -> no deletes', () => {
  assert.deepEqual(selectKeysOlderThan([obj('a', 100)], 'not-a-date'), []);
});
