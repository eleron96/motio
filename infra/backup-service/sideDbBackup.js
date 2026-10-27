'use strict';

// Daily dumps of "side" Postgres databases that live outside the Supabase DB:
// Keycloak (logins/passwords/realm) and Metabase (dashboards/saved questions).
// Each target gets its own local dir and S3 prefix, so retention of one family
// never touches another. Side effects come in through `deps` to keep it testable.

const isSafeDumpName = (name) => /^[a-z0-9._-]+$/i.test(name) && name.endsWith('.dump');

// S3 keys of one family: `<prefix>/<anything>.dump`. Never matches the flat
// Supabase dumps or another family's prefix.
const s3PatternFor = (prefix) => new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/.+\\.dump$`);

// Keep the `keepCount` newest local dumps (plus `protectedNames`), delete the rest.
const pruneLocalDumps = async (dir, keepCount, protectedNames, { fs, path }) => {
  const protectedSet = new Set(protectedNames);
  await fs.mkdir(dir, { recursive: true });
  const entries = await fs.readdir(dir);
  const files = await Promise.all(
    entries
      .filter((name) => isSafeDumpName(name))
      .map(async (name) => {
        const fullPath = path.join(dir, name);
        const stat = await fs.stat(fullPath);
        return { name, fullPath, mtimeMs: stat.mtimeMs };
      }),
  );
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  let kept = 0;
  for (const file of files) {
    if (protectedSet.has(file.name)) { kept += 1; continue; }
    if (kept < keepCount) { kept += 1; continue; }
    await fs.unlink(file.fullPath).catch(() => {});
  }
};

// target: { label, dbUrl, dir, retentionCount, s3Prefix }
// deps:   { execFileAsync, fs, path, buildTimestamp, uploadToS3, pruneS3 }
// Returns null when dbUrl is unset, so stacks without that database keep working.
const createSideDbBackup = async (target, deps) => {
  const { label, dbUrl, dir, retentionCount, s3Prefix } = target;
  if (!dbUrl) {
    return null;
  }
  const { execFileAsync, fs, path, buildTimestamp, uploadToS3, pruneS3 } = deps;
  await fs.mkdir(dir, { recursive: true });
  const name = `${label}-daily-${buildTimestamp()}.dump`;
  const filePath = path.join(dir, name);
  await execFileAsync('pg_dump', [
    '--format=custom',
    '--no-owner',
    '--file', filePath,
    '--dbname', dbUrl,
  ]);
  try {
    await execFileAsync('pg_restore', ['--list', filePath]);
  } catch (validationError) {
    await fs.unlink(filePath).catch(() => {});
    throw new Error(`${label} backup validation failed (corrupt dump): ${validationError.message || validationError}`);
  }
  const stat = await fs.stat(filePath);
  if (stat.size === 0) {
    await fs.unlink(filePath).catch(() => {});
    throw new Error(`${label} backup file is empty after pg_dump.`);
  }
  await pruneLocalDumps(dir, retentionCount, [name], { fs, path });
  await uploadToS3(filePath, `${s3Prefix}/${name}`);
  await pruneS3(s3PatternFor(s3Prefix), retentionCount);
  return {
    name,
    type: label,
    createdAt: stat.mtime.toISOString(),
    size: stat.size,
  };
};

module.exports = { createSideDbBackup, pruneLocalDumps, s3PatternFor, isSafeDumpName };
