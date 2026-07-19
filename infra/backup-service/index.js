const express = require('express');
const path = require('path');
const dns = require('dns/promises');
const { createWriteStream, createReadStream } = require('fs');
const fs = require('fs/promises');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const { execFile } = require('child_process');
const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const cron = require('node-cron');
const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const { captureException, captureMessage } = require('./glitchtipCapture');
const { selectExpiredKeys } = require('./retention');
const {
  tickAccountPurge,
  tickDataExportWorker,
  tickDataExportCleanup,
  tickHealthCheck,
  tickBroadcast,
} = require('./accountDeletionCron');

const execFileAsync = promisify(execFile);

const PORT = Number(process.env.BACKUP_PORT || 7000);
const BACKUP_DIR = process.env.BACKUP_DIR || '/backups';
const STORAGE_BLOBS_DIR = process.env.STORAGE_BLOBS_DIR || '';
const STORAGE_BACKUP_RETENTION_COUNT = (() => {
  const parsed = Number.parseInt(process.env.STORAGE_BACKUP_RETENTION_COUNT || '14', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 14;
})();
const DB_URL = process.env.SUPABASE_DB_URL || '';
const GOTRUE_DB_DATABASE_URL = process.env.GOTRUE_DB_DATABASE_URL || '';
// Keycloak DB (logins/passwords/realm). When set, it is dumped daily alongside
// the Supabase DB so a restore brings back authentication too. No-op if unset.
const KEYCLOAK_DB_URL = process.env.KEYCLOAK_DB_URL || '';
const KEYCLOAK_BACKUP_DIR = path.join(process.env.BACKUP_DIR || '/backups', 'keycloak');
const KEYCLOAK_BACKUP_RETENTION_COUNT = (() => {
  const parsed = Number.parseInt(process.env.KEYCLOAK_BACKUP_RETENTION_COUNT || '90', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 90;
})();
const BACKUP_RESTORE_DB_URL = process.env.BACKUP_RESTORE_DB_URL || '';
const BACKUP_AUTH_DB_USER = process.env.BACKUP_AUTH_DB_USER || '';
const BACKUP_AUTH_HOST = process.env.BACKUP_AUTH_HOST || 'auth';
const JWT_SECRET = process.env.JWT_SECRET || '';
const BACKUP_CRON = process.env.BACKUP_CRON || '0 3 * * *';
const BACKUP_SCHEMAS = (process.env.BACKUP_SCHEMAS || 'public,auth,storage')
  .split(',')
  .map((schema) => schema.trim())
  .filter(Boolean);
const CORS_ORIGIN = process.env.BACKUP_CORS_ORIGIN || '*';
const BACKUP_MAX_UPLOAD_MB = (() => {
  const parsed = Number.parseInt(process.env.BACKUP_MAX_UPLOAD_MB || '1024', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1024;
})();
const BACKUP_MAX_UPLOAD_BYTES = BACKUP_MAX_UPLOAD_MB * 1024 * 1024;
const BACKUP_RETENTION_COUNT = (() => {
  const parsed = Number.parseInt(process.env.BACKUP_RETENTION_COUNT || '30', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
})();

const S3_ENDPOINT = process.env.S3_ENDPOINT || '';
const S3_REGION = process.env.S3_REGION || 'us-east-1';
const S3_BUCKET = process.env.S3_BUCKET || '';
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || '';
const S3_SECRET_KEY = process.env.S3_SECRET_KEY || '';

// Phase 5: account-deletion cron
const SUPABASE_INTERNAL_URL = process.env.SUPABASE_INTERNAL_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PURGE_CRON = process.env.PURGE_CRON || '0 4 * * *';
const EXPORT_WORKER_CRON = process.env.EXPORT_WORKER_CRON || '*/5 * * * *';
const EXPORT_CLEANUP_CRON = process.env.EXPORT_CLEANUP_CRON || '0 5 * * *';
const ACCOUNT_DELETION_HEALTH_CRON = process.env.ACCOUNT_DELETION_HEALTH_CRON || '15 * * * *';
const BROADCAST_TICK_CRON = process.env.BROADCAST_TICK_CRON || '*/1 * * * *';
const PURGE_CRON_ENABLED = (process.env.PURGE_CRON_ENABLED ?? 'true').toLowerCase() !== 'false';
const ACCOUNT_DELETION_CRON_ENABLED = Boolean(SUPABASE_INTERNAL_URL && SUPABASE_SERVICE_ROLE_KEY);
const EXPORT_CLEANUP_BATCH_LIMIT = (() => {
  const parsed = Number.parseInt(process.env.EXPORT_CLEANUP_BATCH_LIMIT || '100', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
})();

const s3Enabled = Boolean(S3_ENDPOINT && S3_BUCKET && S3_ACCESS_KEY && S3_SECRET_KEY);

const s3 = s3Enabled
  ? new S3Client({
      endpoint: S3_ENDPOINT,
      region: S3_REGION,
      credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
      forcePathStyle: true,
    })
  : null;

const uploadToS3 = async (filePath, key) => {
  if (!s3) return;
  try {
    const fileStream = createReadStream(filePath);
    await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: fileStream,
    }));
    console.log(`S3 upload ok: ${key}`);
  } catch (error) {
    // A silent S3 failure is exactly how "backups stop containing everything"
    // happens, so surface it to GlitchTip instead of only logging.
    console.error(`S3 upload failed for ${key}:`, error.message || error);
    captureException(error instanceof Error ? error : new Error(`S3 upload failed for ${key}`));
  }
};

const listAllS3Objects = async () => {
  const objects = [];
  let ContinuationToken;
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: S3_BUCKET, ContinuationToken }));
    for (const obj of res.Contents || []) {
      objects.push({ Key: obj.Key, LastModified: obj.LastModified });
    }
    ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return objects;
};

// Keep only the `keepCount` newest S3 objects whose Key matches `pattern`.
// Uses the unit-tested selectExpiredKeys (with its safety floor) so a bug can
// never wipe the bucket. Best-effort: logs + reports but never throws.
const pruneS3 = async (pattern, keepCount) => {
  if (!s3) return;
  try {
    const all = await listAllS3Objects();
    const matching = all.filter((obj) => typeof obj.Key === 'string' && pattern.test(obj.Key));
    const toDelete = selectExpiredKeys(matching, keepCount);
    if (toDelete.length === 0) return;
    for (let i = 0; i < toDelete.length; i += 1000) {
      const batch = toDelete.slice(i, i + 1000);
      await s3.send(new DeleteObjectsCommand({
        Bucket: S3_BUCKET,
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      }));
    }
    console.log(`S3 prune: removed ${toDelete.length} old object(s) for ${pattern} (kept ${keepCount}).`);
  } catch (error) {
    console.error(`S3 prune failed for ${pattern}:`, error.message || error);
    captureException(error instanceof Error ? error : new Error(`S3 prune failed for ${pattern}`));
  }
};

// S3 key patterns for each backup family (flat layout; keycloak under keycloak/).
const S3_DB_DUMP_PATTERN = /^[^/]+\.dump$/;
const S3_STORAGE_PATTERN = /^[^/]+\.tar\.gz$/;
const S3_KEYCLOAK_PATTERN = /^keycloak\/.+\.dump$/;

if (!DB_URL) {
  console.error('Missing SUPABASE_DB_URL');
  process.exit(1);
}

if (!JWT_SECRET) {
  console.error('Missing JWT_SECRET');
  process.exit(1);
}

const resolveRestoreDbUrl = (dbUrl, explicitRestoreUrl) => {
  if (explicitRestoreUrl) {
    return explicitRestoreUrl;
  }

  try {
    const parsed = new URL(dbUrl);
    // Supabase Postgres image owns system event triggers with supabase_admin.
    if (parsed.username && parsed.username !== 'supabase_admin') {
      parsed.username = 'supabase_admin';
      return parsed.toString();
    }
  } catch (_error) {
    // Ignore invalid URL and fallback to primary DB URL.
  }

  return dbUrl;
};

const RESTORE_DB_URL = resolveRestoreDbUrl(DB_URL, BACKUP_RESTORE_DB_URL);
const schemaArgs = BACKUP_SCHEMAS.flatMap((schema) => ['--schema', schema]);

const parseDbUserFromUrl = (dbUrl) => {
  if (!dbUrl) return '';
  try {
    const parsed = new URL(dbUrl);
    return decodeURIComponent(parsed.username || '');
  } catch (_error) {
    return '';
  }
};

const normalizeRoleName = (roleName) => {
  if (!roleName) return '';
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(roleName)) {
    throw new Error(`Invalid role name: ${roleName}`);
  }
  return roleName;
};

const AUTH_DB_USER = normalizeRoleName(
  BACKUP_AUTH_DB_USER
  || parseDbUserFromUrl(GOTRUE_DB_DATABASE_URL)
  || parseDbUserFromUrl(DB_URL),
);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const resolveAuthHostAddress = async () => {
  if (!BACKUP_AUTH_HOST) return '';
  try {
    const { address } = await dns.lookup(BACKUP_AUTH_HOST);
    return address;
  } catch (_error) {
    return '';
  }
};

const pool = new Pool({ connectionString: DB_URL });
pool.on('error', (error) => {
  console.error('Postgres pool error:', error.message || error);
});

const app = express();
app.use(express.json({ limit: '1mb' }));

const withCors = (req, res) => {
  const origin = CORS_ORIGIN === '*' ? (req.headers.origin || '*') : CORS_ORIGIN;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, x-backup-name');
};

app.use((req, res, next) => {
  withCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

const buildTimestamp = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
};

const parseBackupType = (name) => {
  if (name.startsWith('manual-')) return 'manual';
  if (name.startsWith('daily-')) return 'daily';
  if (name.startsWith('pre-restore-')) return 'pre-restore';
  return 'manual';
};

const isSafeBackupName = (name) => /^[a-z0-9._-]+$/i.test(name) && name.endsWith('.dump');

let activeJob = null;

const toBackupEntry = (name, stat) => ({
  name,
  type: parseBackupType(name),
  createdAt: stat.mtime.toISOString(),
  size: stat.size,
});

const readBackupFilesByDateDesc = async () => {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const entries = await fs.readdir(BACKUP_DIR);
  const files = await Promise.all(
    entries
      .filter((name) => isSafeBackupName(name))
      .map(async (name) => {
        const fullPath = path.join(BACKUP_DIR, name);
        const stat = await fs.stat(fullPath);
        return { name, fullPath, mtimeMs: stat.mtimeMs };
      }),
  );
  return files.sort((a, b) => b.mtimeMs - a.mtimeMs);
};

const pruneBackups = async (protectedNames = []) => {
  const protectedSet = new Set(protectedNames);
  const files = await readBackupFilesByDateDesc();
  let kept = 0;
  for (const file of files) {
    if (protectedSet.has(file.name)) {
      kept += 1;
      continue;
    }
    if (kept < BACKUP_RETENTION_COUNT) {
      kept += 1;
      continue;
    }
    if (file.name.startsWith('pre-restore-')) {
      console.warn(`Pruning pre-restore backup: ${file.name}`);
    }
    await fs.unlink(file.fullPath).catch(() => {});
  }
};

const requireSuperAdmin = async (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  } catch (_error) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const userId = typeof payload === 'object' ? payload.sub : null;
  if (!userId || typeof userId !== 'string') {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const { rowCount } = await pool.query(
      'select 1 from public.super_admins where user_id = $1',
      [userId],
    );
    if (!rowCount) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
  } catch (error) {
    res.status(500).json({ error: error.message || 'Database error' });
    return;
  }

  req.userId = userId;
  next();
};

const createBackup = async (type, options = {}) => {
  const shouldPrune = options.prune !== false;
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const name = `${type}-${buildTimestamp()}.dump`;
  const filePath = path.join(BACKUP_DIR, name);
  await execFileAsync('pg_dump', [
    '--format=custom',
    '--no-owner',
    ...schemaArgs,
    '--file',
    filePath,
    '--dbname',
    DB_URL,
  ]);
  // Validate dump integrity with pg_restore --list (dry-run).
  try {
    await execFileAsync('pg_restore', ['--list', filePath]);
  } catch (validationError) {
    await fs.unlink(filePath).catch(() => {});
    throw new Error(`Backup validation failed (corrupt dump): ${validationError.message || validationError}`);
  }
  const stat = await fs.stat(filePath);
  if (stat.size === 0) {
    await fs.unlink(filePath).catch(() => {});
    throw new Error('Backup file is empty after pg_dump.');
  }
  if (shouldPrune) {
    await pruneBackups([name]);
  }
  await uploadToS3(filePath, name);
  await pruneS3(S3_DB_DUMP_PATTERN, BACKUP_RETENTION_COUNT);
  return {
    ...toBackupEntry(name, stat),
    type,
  };
};

const isSafeStorageBackupName = (name) => /^[a-z0-9._-]+$/i.test(name) && name.endsWith('.tar.gz');

const pruneStorageBackups = async (protectedNames = []) => {
  const protectedSet = new Set(protectedNames);
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const entries = await fs.readdir(BACKUP_DIR);
  const storageFiles = await Promise.all(
    entries
      .filter((name) => isSafeStorageBackupName(name) && name.startsWith('storage-'))
      .map(async (name) => {
        const fullPath = path.join(BACKUP_DIR, name);
        const stat = await fs.stat(fullPath);
        return { name, fullPath, mtimeMs: stat.mtimeMs };
      }),
  );
  storageFiles.sort((a, b) => b.mtimeMs - a.mtimeMs);
  let kept = 0;
  for (const file of storageFiles) {
    if (protectedSet.has(file.name)) {
      kept += 1;
      continue;
    }
    if (kept < STORAGE_BACKUP_RETENTION_COUNT) {
      kept += 1;
      continue;
    }
    await fs.unlink(file.fullPath).catch(() => {});
  }
};

const createStorageBackup = async () => {
  if (!STORAGE_BLOBS_DIR) {
    throw new Error('STORAGE_BLOBS_DIR is not configured; storage backups disabled.');
  }
  try {
    const stat = await fs.stat(STORAGE_BLOBS_DIR);
    if (!stat.isDirectory()) {
      throw new Error(`STORAGE_BLOBS_DIR is not a directory: ${STORAGE_BLOBS_DIR}`);
    }
  } catch (error) {
    throw new Error(`STORAGE_BLOBS_DIR inaccessible (${STORAGE_BLOBS_DIR}): ${error.message || error}`);
  }

  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const name = `storage-${buildTimestamp()}.tar.gz`;
  const filePath = path.join(BACKUP_DIR, name);

  // tar cz everything inside STORAGE_BLOBS_DIR. Use -C to keep archive paths relative.
  await execFileAsync('tar', [
    '--create',
    '--gzip',
    '--file', filePath,
    '--directory', STORAGE_BLOBS_DIR,
    '.',
  ]);

  const stat = await fs.stat(filePath);
  if (stat.size === 0) {
    await fs.unlink(filePath).catch(() => {});
    throw new Error('Storage archive is empty after tar.');
  }

  // Sanity check: tar -t should list entries without error.
  try {
    await execFileAsync('tar', ['--list', '--file', filePath], { maxBuffer: 64 * 1024 * 1024 });
  } catch (validationError) {
    await fs.unlink(filePath).catch(() => {});
    throw new Error(`Storage archive validation failed: ${validationError.message || validationError}`);
  }

  await pruneStorageBackups([name]);
  await uploadToS3(filePath, name);
  await pruneS3(S3_STORAGE_PATTERN, STORAGE_BACKUP_RETENTION_COUNT);

  return {
    name,
    type: 'storage',
    createdAt: stat.mtime.toISOString(),
    size: stat.size,
  };
};

const isSafeKeycloakBackupName = (name) => /^[a-z0-9._-]+$/i.test(name) && name.endsWith('.dump');

const pruneKeycloakLocal = async (keepCount, protectedNames = []) => {
  const protectedSet = new Set(protectedNames);
  await fs.mkdir(KEYCLOAK_BACKUP_DIR, { recursive: true });
  const entries = await fs.readdir(KEYCLOAK_BACKUP_DIR);
  const files = await Promise.all(
    entries
      .filter((name) => isSafeKeycloakBackupName(name))
      .map(async (name) => {
        const fullPath = path.join(KEYCLOAK_BACKUP_DIR, name);
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

// Daily Keycloak DB dump (logins/passwords/realm). No-op when KEYCLOAK_DB_URL
// is unset so local/dev stacks without Keycloak keep working.
const createKeycloakBackup = async () => {
  if (!KEYCLOAK_DB_URL) {
    return null;
  }
  await fs.mkdir(KEYCLOAK_BACKUP_DIR, { recursive: true });
  const name = `keycloak-daily-${buildTimestamp()}.dump`;
  const filePath = path.join(KEYCLOAK_BACKUP_DIR, name);
  await execFileAsync('pg_dump', [
    '--format=custom',
    '--no-owner',
    '--file', filePath,
    '--dbname', KEYCLOAK_DB_URL,
  ]);
  try {
    await execFileAsync('pg_restore', ['--list', filePath]);
  } catch (validationError) {
    await fs.unlink(filePath).catch(() => {});
    throw new Error(`Keycloak backup validation failed (corrupt dump): ${validationError.message || validationError}`);
  }
  const stat = await fs.stat(filePath);
  if (stat.size === 0) {
    await fs.unlink(filePath).catch(() => {});
    throw new Error('Keycloak backup file is empty after pg_dump.');
  }
  await pruneKeycloakLocal(KEYCLOAK_BACKUP_RETENTION_COUNT, [name]);
  await uploadToS3(filePath, `keycloak/${name}`);
  await pruneS3(S3_KEYCLOAK_PATTERN, KEYCLOAK_BACKUP_RETENTION_COUNT);
  return {
    name,
    type: 'keycloak',
    createdAt: stat.mtime.toISOString(),
    size: stat.size,
  };
};

const saveUploadedBackup = async (name, stream) => {
  if (!isSafeBackupName(name)) {
    throw new Error('Invalid backup file name.');
  }

  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const filePath = path.join(BACKUP_DIR, name);
  const writeStream = createWriteStream(filePath, { flags: 'wx' });
  let uploadedBytes = 0;

  const maxSizeGuard = new Transform({
    transform(chunk, _encoding, callback) {
      uploadedBytes += chunk.length;
      if (uploadedBytes > BACKUP_MAX_UPLOAD_BYTES) {
        callback(new Error(`File is too large. Maximum size is ${BACKUP_MAX_UPLOAD_MB} MB.`));
        return;
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(stream, maxSizeGuard, writeStream);

    if (uploadedBytes === 0) {
      throw new Error('Uploaded file is empty.');
    }

    const stat = await fs.stat(filePath);
    await pruneBackups([name]);
    return toBackupEntry(name, stat);
  } catch (error) {
    await fs.unlink(filePath).catch(() => {});
    throw error;
  }
};

const restoreBackup = async (name) => {
  if (!isSafeBackupName(name)) {
    throw new Error('Invalid backup name.');
  }
  const filePath = path.join(BACKUP_DIR, name);
  await fs.access(filePath);
  await execFileAsync('pg_restore', [
    '--clean',
    '--if-exists',
    '--single-transaction',
    '--exit-on-error',
    '--no-owner',
    ...schemaArgs,
    '--dbname',
    RESTORE_DB_URL,
    filePath,
  ]);

  if (AUTH_DB_USER) {
    await execFileAsync('psql', [
      '--dbname',
      RESTORE_DB_URL,
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `GRANT USAGE ON SCHEMA auth TO ${AUTH_DB_USER};`,
      '-c',
      `GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA auth TO ${AUTH_DB_USER};`,
      '-c',
      `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA auth TO ${AUTH_DB_USER};`,
      '-c',
      `GRANT EXECUTE ON ALL ROUTINES IN SCHEMA auth TO ${AUTH_DB_USER};`,
    ]);

    const authHostAddress = await resolveAuthHostAddress();
    if (authHostAddress) {
      await execFileAsync('psql', [
        '--dbname',
        RESTORE_DB_URL,
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = '${AUTH_DB_USER}' AND client_addr = '${authHostAddress}' AND pid <> pg_backend_pid();`,
      ]);
      // Give GoTrue a short window to reconnect before clients continue requests.
      await wait(1000);
    }
  }
};

const listBackups = async () => {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const entries = await fs.readdir(BACKUP_DIR);
  const backups = await Promise.all(
    entries
      .filter((name) => isSafeBackupName(name))
      .map(async (name) => {
        const stat = await fs.stat(path.join(BACKUP_DIR, name));
        return toBackupEntry(name, stat);
      }),
  );
  return backups.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
};

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/backups', requireSuperAdmin, async (_req, res) => {
  try {
    const backups = await listBackups();
    res.json({ backups });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to list backups.' });
  }
});

app.post('/backups', requireSuperAdmin, async (_req, res) => {
  if (activeJob) {
    res.status(409).json({ error: `Backup job already running: ${activeJob}` });
    return;
  }
  activeJob = 'manual-backup';
  try {
    const backup = await createBackup('manual');
    res.json({ backup });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to create backup.' });
  } finally {
    activeJob = null;
  }
});

app.post('/backups/upload', requireSuperAdmin, async (req, res) => {
  if (activeJob) {
    res.status(409).json({ error: `Backup job already running: ${activeJob}` });
    return;
  }

  const rawHeader = req.headers['x-backup-name'];
  const backupName = typeof rawHeader === 'string'
    ? rawHeader.trim()
    : Array.isArray(rawHeader)
      ? (rawHeader[0] || '').trim()
      : '';

  if (!isSafeBackupName(backupName)) {
    res.status(400).json({ error: 'Invalid backup file name. Use *.dump with letters, digits, dot, underscore, dash.' });
    return;
  }

  const contentLengthHeader = req.headers['content-length'];
  const contentLength = Number.parseInt(Array.isArray(contentLengthHeader) ? contentLengthHeader[0] : (contentLengthHeader || ''), 10);
  if (Number.isFinite(contentLength) && contentLength > BACKUP_MAX_UPLOAD_BYTES) {
    res.status(413).json({ error: `File is too large. Maximum size is ${BACKUP_MAX_UPLOAD_MB} MB.` });
    return;
  }

  if (req.headers['content-type']?.toString().includes('application/json')) {
    res.status(400).json({ error: 'Upload body must be binary (application/octet-stream).' });
    return;
  }

  activeJob = `upload:${backupName}`;
  try {
    const backup = await saveUploadedBackup(backupName, req);
    res.json({ backup });
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'EEXIST') {
      res.status(409).json({ error: 'Backup with this name already exists.' });
      return;
    }
    if ((error.message || '').includes('File is too large')) {
      res.status(413).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: error.message || 'Failed to upload backup.' });
  } finally {
    activeJob = null;
  }
});

app.get('/backups/:name/download', requireSuperAdmin, async (req, res) => {
  const name = req.params.name;
  if (!isSafeBackupName(name)) {
    res.status(400).json({ error: 'Invalid backup name.' });
    return;
  }

  const filePath = path.join(BACKUP_DIR, name);
  try {
    await fs.access(filePath);
  } catch (_error) {
    res.status(404).json({ error: 'Backup not found.' });
    return;
  }

  res.download(filePath, name, (error) => {
    if (error && !res.headersSent) {
      res.status(500).json({ error: error.message || 'Failed to download backup.' });
    }
  });
});

app.patch('/backups/:name', requireSuperAdmin, async (req, res) => {
  const name = req.params.name;
  const nextName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';

  if (!isSafeBackupName(name)) {
    res.status(400).json({ error: 'Invalid backup name.' });
    return;
  }
  if (!isSafeBackupName(nextName)) {
    res.status(400).json({ error: 'Invalid new backup name.' });
    return;
  }
  if (name === nextName) {
    res.status(400).json({ error: 'New name must be different.' });
    return;
  }
  if (activeJob) {
    res.status(409).json({ error: `Backup job already running: ${activeJob}` });
    return;
  }

  const fromPath = path.join(BACKUP_DIR, name);
  const toPath = path.join(BACKUP_DIR, nextName);

  try {
    await fs.access(fromPath);
  } catch (_error) {
    res.status(404).json({ error: 'Backup not found.' });
    return;
  }

  try {
    await fs.access(toPath);
    res.status(409).json({ error: 'Backup with the target name already exists.' });
    return;
  } catch (_error) {
    // No target file, continue.
  }

  activeJob = `rename:${name}`;
  try {
    await fs.rename(fromPath, toPath);
    const stat = await fs.stat(toPath);
    res.json({ backup: toBackupEntry(nextName, stat) });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to rename backup.' });
  } finally {
    activeJob = null;
  }
});

app.delete('/backups/:name', requireSuperAdmin, async (req, res) => {
  const name = req.params.name;
  if (!isSafeBackupName(name)) {
    res.status(400).json({ error: 'Invalid backup name.' });
    return;
  }
  if (activeJob) {
    res.status(409).json({ error: `Backup job already running: ${activeJob}` });
    return;
  }

  const filePath = path.join(BACKUP_DIR, name);
  activeJob = `delete:${name}`;
  try {
    await fs.unlink(filePath);
    res.json({ success: true });
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      res.status(404).json({ error: 'Backup not found.' });
      return;
    }
    res.status(500).json({ error: error.message || 'Failed to delete backup.' });
  } finally {
    activeJob = null;
  }
});

app.post('/backups/:name/restore', requireSuperAdmin, async (req, res) => {
  const name = req.params.name;
  if (activeJob) {
    res.status(409).json({ error: `Backup job already running: ${activeJob}` });
    return;
  }
  activeJob = `restore:${name}`;
  try {
    const safetyBackup = await createBackup('pre-restore', { prune: false });
    await restoreBackup(name);
    await pruneBackups([name, safetyBackup.name]);
    res.json({ success: true, safetyBackup });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to restore backup.' });
  } finally {
    activeJob = null;
  }
});

app.post('/storage-backups', requireSuperAdmin, async (_req, res) => {
  if (!STORAGE_BLOBS_DIR) {
    res.status(501).json({ error: 'Storage backups are not configured (STORAGE_BLOBS_DIR missing).' });
    return;
  }
  if (activeJob) {
    res.status(409).json({ error: `Backup job already running: ${activeJob}` });
    return;
  }
  activeJob = 'manual-storage-backup';
  try {
    const backup = await createStorageBackup();
    res.json({ backup });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to create storage backup.' });
  } finally {
    activeJob = null;
  }
});

cron.schedule(BACKUP_CRON, async () => {
  if (activeJob) return;
  activeJob = 'daily-backup';
  try {
    await createBackup('daily');
  } catch (error) {
    console.error('Daily backup failed:', error.message || error);
  } finally {
    activeJob = null;
  }

  // Storage blobs backup runs right after the DB dump.
  // We accept a brief window where freshly uploaded files may appear in DB after
  // the pg_dump but before the tar starts — those files will still be on disk
  // in the next daily archive, so the only risk is orphan blobs (files without
  // a corresponding DB row), which is strictly safer than dangling DB references.
  if (STORAGE_BLOBS_DIR) {
    if (activeJob) return;
    activeJob = 'daily-storage-backup';
    try {
      const backup = await createStorageBackup();
      console.log(`Storage backup ok: ${backup.name} (${backup.size} bytes)`);
    } catch (error) {
      console.error('Daily storage backup failed:', error.message || error);
    } finally {
      activeJob = null;
    }
  }

  // Keycloak DB (auth) backup — daily, so a restore brings back logins too.
  if (KEYCLOAK_DB_URL) {
    if (activeJob) return;
    activeJob = 'daily-keycloak-backup';
    try {
      const backup = await createKeycloakBackup();
      if (backup) console.log(`Keycloak backup ok: ${backup.name} (${backup.size} bytes)`);
    } catch (error) {
      console.error('Daily keycloak backup failed:', error.message || error);
      captureException(error instanceof Error ? error : new Error('Daily keycloak backup failed'));
    } finally {
      activeJob = null;
    }
  }
});

// ─────────────────────────── Phase 5: account-deletion cron ───────────────────────────
// Включается автоматически, если заданы SUPABASE_INTERNAL_URL + SUPABASE_SERVICE_ROLE_KEY.
// Иначе — тихий no-op, чтобы локальный docker-compose без этих переменных продолжал работать.
if (ACCOUNT_DELETION_CRON_ENABLED) {
  const cronCtx = () => ({
    supabaseUrl: SUPABASE_INTERNAL_URL,
    serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
    pool,
    captureException,
    captureMessage,
    cronEnabled: PURGE_CRON_ENABLED,
    exportCleanupBatchLimit: EXPORT_CLEANUP_BATCH_LIMIT,
  });

  cron.schedule(PURGE_CRON, async () => {
    try { await tickAccountPurge(cronCtx()); }
    catch (_err) { /* уже залогировано внутри */ }
  });

  cron.schedule(EXPORT_WORKER_CRON, async () => {
    try { await tickDataExportWorker(cronCtx()); }
    catch (_err) { /* уже залогировано внутри */ }
  });

  cron.schedule(EXPORT_CLEANUP_CRON, async () => {
    try { await tickDataExportCleanup(cronCtx()); }
    catch (_err) { /* уже залогировано внутри */ }
  });

  cron.schedule(ACCOUNT_DELETION_HEALTH_CRON, async () => {
    try { await tickHealthCheck(cronCtx()); }
    catch (_err) { /* уже залогировано внутри */ }
  });

  cron.schedule(BROADCAST_TICK_CRON, async () => {
    try { await tickBroadcast(cronCtx()); }
    catch (_err) { /* уже залогировано внутри */ }
  });

  console.log(
    `Account-deletion cron enabled: purge=${PURGE_CRON} (${PURGE_CRON_ENABLED ? 'on' : 'off'}), `
    + `export-worker=${EXPORT_WORKER_CRON}, export-cleanup=${EXPORT_CLEANUP_CRON}, `
    + `health=${ACCOUNT_DELETION_HEALTH_CRON}, broadcast=${BROADCAST_TICK_CRON}`,
  );
} else {
  console.log('Account-deletion cron disabled (SUPABASE_INTERNAL_URL / SUPABASE_SERVICE_ROLE_KEY not set).');
}

app.listen(PORT, () => {
  console.log(`Backup service listening on ${PORT}`);
});
