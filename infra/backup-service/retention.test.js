'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { selectExpiredKeys, selectKeysOlderThan, selectGfsExpiredKeys, MIN_SAFE_KEEP } = require('./retention');

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

// ── GFS (daily / weekly / monthly) ─────────────────────────────────────────

// One backup a day at 03:00 UTC from `from` to `to` inclusive (YYYY-MM-DD).
const dailyObjects = (from, to) => {
  const objects = [];
  for (let t = Date.parse(`${from}T03:00:00Z`); t <= Date.parse(`${to}T03:00:00Z`); t += 86400000) {
    const day = new Date(t).toISOString().slice(0, 10);
    objects.push({ Key: `daily-${day.replace(/-/g, '')}-030000.dump`, LastModified: new Date(t) });
  }
  return objects;
};
const dayOf = (key) => key.slice(6, 14);
const POLICY = { daily: 14, weekly: 8, monthly: 12 };

test('GFS: keeps 14 newest days, the newest of 8 ISO weeks and of 12 months', () => {
  const objects = dailyObjects('2026-01-01', '2026-10-27'); // 2026-10-27 is a Tuesday
  const deleted = new Set(selectGfsExpiredKeys(objects, POLICY));
  const kept = objects.map((o) => o.Key).filter((k) => !deleted.has(k)).map(dayOf).sort();

  const daily = Array.from({ length: 14 }, (_, i) => `202610${String(14 + i).padStart(2, '0')}`);
  // Sundays closing the earlier weeks (the two newest weeks are covered by the dailies).
  const weekly = ['20260913', '20260920', '20260927', '20261004', '20261011'];
  // Last day of every earlier month that has backups (only 10 months exist).
  const monthly = ['20260131', '20260228', '20260331', '20260430', '20260531', '20260630', '20260731', '20260831', '20260930'];
  assert.deepEqual(kept, [...daily, ...weekly, ...monthly].sort());
});

test('GFS: nothing to delete while there are no more than the daily count', () => {
  assert.deepEqual(selectGfsExpiredKeys(dailyObjects('2026-10-20', '2026-10-27'), POLICY), []);
});

test('GFS: the daily tier never drops below the safety floor', () => {
  const objects = dailyObjects('2026-10-01', '2026-10-27');
  const deleted = new Set(selectGfsExpiredKeys(objects, { daily: 1, weekly: 0, monthly: 0 }));
  const kept = objects.filter((o) => !deleted.has(o.Key)).map((o) => dayOf(o.Key));
  assert.deepEqual(kept, ['20261023', '20261024', '20261025', '20261026', '20261027']);
});

test('GFS: an object without a readable date is never deleted', () => {
  const objects = [...dailyObjects('2026-01-01', '2026-10-27'), { Key: 'manual-unknown.dump', LastModified: 'garbage' }];
  assert.ok(!selectGfsExpiredKeys(objects, POLICY).includes('manual-unknown.dump'));
});
