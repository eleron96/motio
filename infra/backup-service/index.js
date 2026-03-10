const express = require('express');
const path = require('path');
const dns = require('dns/promises');
const { createWriteStream } = require('fs');
const fs = require('fs/promises');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const { execFile } = require('child_process');
const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const cron = require('node-cron');

const execFileAsync = promisify(execFile);

const PORT = Number(process.env.BACKUP_PORT || 7000);
const BACKUP_DIR = process.env.BACKUP_DIR || '/backups';
const DB_URL = process.env.SUPABASE_DB_URL || '';
const GOTRUE_DB_DATABASE_URL = process.env.GOTRUE_DB_DATABASE_URL || '';
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
  return {
    ...toBackupEntry(name, stat),
    type,
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
});

app.listen(PORT, () => {
  console.log(`Backup service listening on ${PORT}`);
});
