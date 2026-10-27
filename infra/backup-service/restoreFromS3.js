'use strict';

// Disaster recovery, step one: pull a complete backup set out of S3 onto a
// disk, decrypted. The set is the newest (or a named) Supabase dump, the
// newest Keycloak and Metabase dumps, and every uploaded file. Loading them
// into a fresh stack is described in docs/operations.md, "Restoring from S3".
//
// Run inside the backup image (it has the S3 credentials, the SDK and age):
//   docker compose ... run --rm -v /root/restore:/restore backup \
//     node restoreFromS3.js --out /restore/set --identity /restore/owner-key.txt [--database <key>]
//
// Output: <out>/database/<dump>, <out>/keycloak/<dump>, <out>/metabase/<dump>,
//         <out>/files/<path inside the storage volume>.

const DB_PATTERN = /^[^/]+\.dump(\.age)?$/;
const stripAge = (name) => (name.endsWith('.age') ? name.slice(0, -'.age'.length) : name);
const prefixedDumpPattern = (prefix) => new RegExp(`^${prefix}/[^/]+\\.dump(\\.age)?$`);

const newestKey = (objects, pattern) => {
  const matching = objects
    .filter((o) => pattern.test(o.Key))
    .sort((a, b) => new Date(b.LastModified) - new Date(a.LastModified));
  return matching.length > 0 ? matching[0].Key : null;
};

// Pure: which keys make up the restore set.
const planRestore = (objects, { database } = {}) => {
  let databaseKey;
  if (database) {
    if (!objects.some((o) => o.Key === database)) {
      throw new Error(`Database dump not found in the bucket: ${database}`);
    }
    databaseKey = database;
  } else {
    databaseKey = newestKey(objects, DB_PATTERN);
  }
  if (!databaseKey) {
    throw new Error('No database dump in the bucket; nothing to restore.');
  }
  return {
    database: databaseKey,
    keycloak: newestKey(objects, prefixedDumpPattern('keycloak')),
    metabase: newestKey(objects, prefixedDumpPattern('metabase')),
    files: uniqueFileKeys(objects.map((o) => o.Key).filter((key) => key.startsWith('files/'))),
  };
};

// Right after encryption is switched on, a file can sit in S3 both plain and
// as .age (the plain copy waits out its grace period). Restore it once,
// preferring the encrypted copy.
const uniqueFileKeys = (keys) => {
  const byTarget = new Map();
  for (const key of keys) {
    const target = stripAge(key);
    if (!byTarget.has(target) || key.endsWith('.age')) byTarget.set(target, key);
  }
  return [...byTarget.values()].sort();
};

// deps: { plan, out, identityPath, fs, path, download(key, dst), decryptFile(src, dst, identity) }
const downloadBackupSet = async ({ plan, out, identityPath, fs, path, download, decryptFile }) => {
  const entries = [];
  const add = (key, dir, rel) => { if (key) entries.push({ key, dir, rel: stripAge(rel) }); };
  add(plan.database, 'database', plan.database);
  add(plan.keycloak, 'keycloak', plan.keycloak && plan.keycloak.slice('keycloak/'.length));
  add(plan.metabase, 'metabase', plan.metabase && plan.metabase.slice('metabase/'.length));
  for (const key of plan.files) add(key, 'files', key.slice('files/'.length));

  if (!identityPath && entries.some((entry) => entry.key.endsWith('.age'))) {
    throw new Error('The backup set is encrypted; pass the private key with --identity <file>.');
  }
  const root = path.resolve(out);
  for (const entry of entries) {
    const target = path.resolve(root, entry.dir, entry.rel);
    if (!target.startsWith(`${root}${path.sep}`)) {
      throw new Error(`Refusing to write outside the output directory: ${entry.key}`);
    }
    entry.target = target;
  }

  for (const entry of entries) {
    await fs.mkdir(path.dirname(entry.target), { recursive: true });
    if (entry.key.endsWith('.age')) {
      const encrypted = `${entry.target}.age`;
      await download(entry.key, encrypted);
      await decryptFile(encrypted, entry.target, identityPath);
      await fs.unlink(encrypted);
    } else {
      await download(entry.key, entry.target);
    }
  }

  const nameOf = (dir) => {
    const entry = entries.find((e) => e.dir === dir);
    return entry ? entry.rel : null;
  };
  return {
    database: nameOf('database'),
    keycloak: nameOf('keycloak'),
    metabase: nameOf('metabase'),
    files: entries.filter((e) => e.dir === 'files').length,
  };
};

const parseArgs = (argv) => {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (!['--out', '--identity', '--database'].includes(flag) || value === undefined) {
      throw new Error(`Unknown or incomplete argument: ${flag}`);
    }
    args[flag.slice(2)] = value;
  }
  if (!args.out) throw new Error('Usage: node restoreFromS3.js --out <dir> [--identity <age key file>] [--database <key>]');
  return args;
};

const main = async () => {
  const fs = require('fs/promises');
  const path = require('path');
  const { createWriteStream } = require('fs');
  const { pipeline } = require('stream/promises');
  const { execFile } = require('child_process');
  const { promisify } = require('util');
  const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');

  const args = parseArgs(process.argv.slice(2));
  const { S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY } = process.env;
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY || !S3_SECRET_KEY) {
    throw new Error('S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY and S3_SECRET_KEY must be set.');
  }
  const s3 = new S3Client({
    endpoint: S3_ENDPOINT,
    region: S3_REGION || 'us-east-1',
    credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
    forcePathStyle: true,
    // SDK ≥3.729 adds CRC checksums with aws-chunked uploads by default, which
    // S3-compatible servers outside AWS often reject; only send them when required.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

  const objects = [];
  let ContinuationToken;
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: S3_BUCKET, ContinuationToken }));
    for (const obj of res.Contents || []) objects.push({ Key: obj.Key, LastModified: obj.LastModified });
    ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (ContinuationToken);

  const plan = planRestore(objects, { database: args.database });
  console.log(`Restore set: database=${plan.database}, keycloak=${plan.keycloak || '-'}, metabase=${plan.metabase || '-'}, files=${plan.files.length}`);
  const execFileAsync = promisify(execFile);
  const summary = await downloadBackupSet({
    plan,
    out: args.out,
    identityPath: args.identity || '',
    fs,
    path,
    download: async (key, dst) => {
      const res = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
      await pipeline(res.Body, createWriteStream(dst));
    },
    decryptFile: (src, dst, identity) => execFileAsync('age', ['--decrypt', '--identity', identity, '--output', dst, src]),
  });
  console.log(`Downloaded to ${path.resolve(args.out)}: ${JSON.stringify(summary)}`);
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = { planRestore, downloadBackupSet };
