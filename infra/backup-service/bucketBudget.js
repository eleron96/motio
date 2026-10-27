'use strict';

// How full the backup bucket is. The plan is a fixed size (10 GB), so the
// nightly run measures every object and warns well before the limit. It never
// deletes anything to make room: what to give up is the owner's decision.

const GB = 1024 ** 3;

const familyOf = (key) => {
  if (key.startsWith('files/')) return 'files';
  if (key.startsWith('keycloak/')) return 'keycloak';
  if (key.startsWith('metabase/')) return 'metabase';
  if (/^[^/]+\.tar\.gz(\.age)?$/.test(key)) return 'legacy archives';
  if (/^[^/]+\.dump(\.age)?$/.test(key)) return 'database';
  return 'other';
};

// objects: [{ Key, Size }]; limits: { warnBytes, alarmBytes }
const checkBucketBudget = (objects, { warnBytes, alarmBytes }) => {
  const byFamily = {};
  let totalBytes = 0;
  for (const obj of objects) {
    const size = Number(obj.Size) || 0;
    const family = familyOf(obj.Key);
    byFamily[family] = (byFamily[family] || 0) + size;
    totalBytes += size;
  }
  let level = 'ok';
  if (totalBytes >= alarmBytes) level = 'alarm';
  else if (totalBytes >= warnBytes) level = 'warn';

  const gb = (bytes) => (bytes / GB).toFixed(2);
  const breakdown = Object.entries(byFamily)
    .sort(([, a], [, b]) => b - a)
    .map(([family, bytes]) => `${family} ${gb(bytes)} GB`)
    .join(', ');
  const message = `Backup bucket holds ${gb(totalBytes)} GB of ${gb(alarmBytes)} GB alarm line (${breakdown}).`;
  return { level, totalBytes, byFamily, message };
};

module.exports = { checkBucketBudget };
