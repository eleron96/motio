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

module.exports = { selectExpiredKeys, selectKeysOlderThan, MIN_SAFE_KEEP };
