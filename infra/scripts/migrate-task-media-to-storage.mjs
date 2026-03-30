#!/usr/bin/env node

import fs from 'node:fs/promises';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_ENV_FILE = '.env';
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_BUCKET = 'task-media';

const usage = `Usage:
  node infra/scripts/migrate-task-media-to-storage.mjs [--env-file .env] [--batch-size 50] [--limit 100] [--dry-run]

Options:
  --env-file    Path to env file with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
  --batch-size  Number of legacy rows to migrate per batch. Default: 50.
  --limit       Stop after migrating N rows.
  --dry-run     Print how many rows still require migration without uploading data.
  --help        Show this help.
`;

const parseRequiredPositiveInt = (flag, value) => {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} expects a positive integer value.`);
  }
  return parsed;
};

const parseArgs = (argv) => {
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: false,
    envFile: DEFAULT_ENV_FILE,
    help: false,
    limit: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help') {
      options.help = true;
      continue;
    }

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--env-file') {
      options.envFile = argv[index + 1] ?? DEFAULT_ENV_FILE;
      index += 1;
      continue;
    }

    if (arg === '--batch-size') {
      options.batchSize = parseRequiredPositiveInt(arg, argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--limit') {
      options.limit = parseRequiredPositiveInt(arg, argv[index + 1]);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
};

const stripQuotes = (value) => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

const loadEnvFile = async (filePath) => {
  const content = await fs.readFile(filePath, 'utf8');
  const entries = content.split(/\r?\n/);

  for (const line of entries) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || process.env[key]) continue;

    const value = trimmed.slice(separatorIndex + 1);
    process.env[key] = stripQuotes(value);
  }
};

const requireEnv = (name) => {
  const value = (process.env[name] ?? '').trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const hexDecode = (hex) => {
  const clean = String(hex ?? '').startsWith('\\x') ? String(hex).slice(2) : String(hex ?? '');
  if (!/^[\da-fA-F]*$/.test(clean) || clean.length % 2 !== 0) {
    return null;
  }

  const bytes = new Uint8Array(clean.length / 2);
  for (let index = 0; index < clean.length; index += 2) {
    bytes[index / 2] = Number.parseInt(clean.slice(index, index + 2), 16);
  }
  return bytes;
};

const buildStoragePath = (workspaceId, mediaId, mimeType) => {
  const ext = String(mimeType ?? '').split('/')[1]?.replace(/\+.*$/, '') || 'bin';
  return `${workspaceId}/${mediaId}.${ext}`;
};

const formatBytes = (value) => {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = Math.max(0, Number(value) || 0);
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
};

const applyLegacyFilter = (query) => (
  query
    .is('storage_path', null)
    .filter('content', 'not.is', 'null')
);

const fetchLegacyBatch = async (supabase, batchSize) => {
  const query = supabase
    .from('task_media')
    .select('id, workspace_id, mime_type, byte_size, content, created_at')
    .order('created_at', { ascending: true })
    .limit(batchSize);

  const { data, error } = await applyLegacyFilter(query);
  if (error) {
    throw new Error(`Failed to load legacy task_media rows: ${error.message}`);
  }

  return data ?? [];
};

const countRemainingLegacyRows = async (supabase) => {
  const query = supabase
    .from('task_media')
    .select('id', { count: 'exact', head: true });

  const { count, error } = await applyLegacyFilter(query);
  if (error) {
    throw new Error(`Failed to count legacy task_media rows: ${error.message}`);
  }

  return count ?? 0;
};

const migrateRow = async (supabase, bucket, row) => {
  const mediaId = typeof row.id === 'string' ? row.id : '';
  const workspaceId = typeof row.workspace_id === 'string' ? row.workspace_id : '';
  const mimeType = typeof row.mime_type === 'string' ? row.mime_type : 'application/octet-stream';
  const byteSize = typeof row.byte_size === 'number' ? row.byte_size : 0;

  if (!mediaId || !workspaceId) {
    throw new Error('Legacy row is missing id or workspace_id.');
  }

  const bytes = hexDecode(row.content);
  if (!bytes) {
    throw new Error(`Legacy row ${mediaId} has invalid bytea payload.`);
  }

  const storagePath = buildStoragePath(workspaceId, mediaId, mimeType);
  const uploadBody = new Blob([bytes], { type: mimeType });

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(storagePath, uploadBody, {
      contentType: mimeType,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Failed to upload ${mediaId} to Storage: ${uploadError.message}`);
  }

  const { error: updateError } = await supabase
    .from('task_media')
    .update({
      content: null,
      storage_path: storagePath,
    })
    .eq('id', mediaId);

  if (updateError) {
    throw new Error(`Failed to update task_media row ${mediaId}: ${updateError.message}`);
  }

  return {
    byteSize,
    mediaId,
    storagePath,
  };
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage);
    return;
  }

  await loadEnvFile(options.envFile);

  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const bucket = (process.env.TASK_MEDIA_STORAGE_BUCKET ?? DEFAULT_BUCKET).trim() || DEFAULT_BUCKET;

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const initialRemaining = await countRemainingLegacyRows(supabase);
  console.log(`Legacy rows pending migration: ${initialRemaining}`);

  if (options.dryRun || initialRemaining === 0) {
    return;
  }

  let migratedRows = 0;
  let migratedBytes = 0;

  while (true) {
    const remainingLimit = options.limit === null ? options.batchSize : Math.min(options.batchSize, options.limit - migratedRows);
    if (remainingLimit <= 0) break;

    const batch = await fetchLegacyBatch(supabase, remainingLimit);
    if (batch.length === 0) break;

    for (const row of batch) {
      const migrated = await migrateRow(supabase, bucket, row);
      migratedRows += 1;
      migratedBytes += migrated.byteSize;
      console.log(`Migrated ${migrated.mediaId} -> ${migrated.storagePath}`);

      if (options.limit !== null && migratedRows >= options.limit) {
        break;
      }
    }

    if (options.limit !== null && migratedRows >= options.limit) {
      break;
    }
  }

  const remaining = await countRemainingLegacyRows(supabase);
  console.log(`Migrated rows: ${migratedRows}`);
  console.log(`Migrated bytes: ${formatBytes(migratedBytes)}`);
  console.log(`Legacy rows still pending: ${remaining}`);

  if (remaining === 0) {
    console.log('Legacy bytea payloads are fully migrated. A follow-up schema migration can now drop public.task_media.content.');
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
