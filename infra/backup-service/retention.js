'use strict';

// Pure, side-effect-free retention helpers so the deletion logic is unit-testable.
// A bug here could delete backups, so the selectors are deliberately conservative.

// Never prune a prefix down below this many objects, even if keepCount is
// misconfigured to something tiny. A safety floor against accidental wipeouts.
const MIN_SAFE_KEEP = 5;

// Given S3 objects [{ Key, LastModified }], return the Keys to DELETE so that
// only the `keepCount` newest remain. Returns [] unless there are strictly more
// objects than the (floored) keep count.
function selectExpiredKeys(objects, keepCount) {
  const keep = Number.isFinite(keepCount) && keepCount > 0 ? Math.floor(keepCount) : 0;
  if (keep <= 0) return [];
  const list = Array.isArray(objects) ? objects.filter((o) => o && o.Key) : [];
  const effectiveKeep = Math.max(keep, MIN_SAFE_KEEP);
  if (list.length <= effectiveKeep) return [];
  const sorted = [...list].sort((a, b) => {
    const ta = new Date(a.LastModified || 0).getTime();
    const tb = new Date(b.LastModified || 0).getTime();
    return tb - ta; // newest first
  });
  return sorted.slice(effectiveKeep).map((o) => o.Key);
}

// Keys strictly older than `cutoff` (Date or ISO string). Used by the one-time
// pre-cutoff cleanup. No safety floor — this is an explicit, operator-driven purge.
function selectKeysOlderThan(objects, cutoff) {
  const cutoffMs = cutoff instanceof Date ? cutoff.getTime() : new Date(cutoff).getTime();
  if (!Number.isFinite(cutoffMs)) return [];
  const list = Array.isArray(objects) ? objects.filter((o) => o && o.Key && o.LastModified) : [];
  return list
    .filter((o) => new Date(o.LastModified).getTime() < cutoffMs)
    .map((o) => o.Key);
}

// ISO-8601 week (UTC) as "YYYY-Www": weeks start on Monday, week 1 holds the
// year's first Thursday.
const isoWeekKey = (date) => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};
const monthKey = (date) => date.toISOString().slice(0, 7);

// Grandfather-father-son retention. Keeps the `daily` newest objects (never
// fewer than MIN_SAFE_KEEP), plus the newest object of each of the `weekly`
// newest ISO weeks and of the `monthly` newest calendar months that have
// backups. Returns the Keys to DELETE. An object without a readable date is
// never deleted.
function selectGfsExpiredKeys(objects, policy) {
  const list = Array.isArray(objects) ? objects.filter((o) => o && o.Key) : [];
  const dated = list
    .map((o) => ({ Key: o.Key, at: new Date(o.LastModified) }))
    .filter((o) => Number.isFinite(o.at.getTime()))
    .sort((a, b) => b.at - a.at); // newest first

  const daily = Math.max(Math.floor(policy.daily) || 0, MIN_SAFE_KEEP);
  const keep = new Set(dated.slice(0, daily).map((o) => o.Key));
  const keepNewestPerPeriod = (periodOf, periods) => {
    const seen = new Set();
    for (const o of dated) {
      if (seen.size >= periods) return;
      const period = periodOf(o.at);
      if (seen.has(period)) continue;
      seen.add(period);
      keep.add(o.Key);
    }
  };
  keepNewestPerPeriod(isoWeekKey, Math.floor(policy.weekly) || 0);
  keepNewestPerPeriod(monthKey, Math.floor(policy.monthly) || 0);

  return dated.filter((o) => !keep.has(o.Key)).map((o) => o.Key);
}

module.exports = { selectExpiredKeys, selectKeysOlderThan, selectGfsExpiredKeys, MIN_SAFE_KEEP };
