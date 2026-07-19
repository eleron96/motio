// Cron-helpers для Phase 5 account-deletion:
//   * tickAccountPurge      — POST /functions/v1/account-purge (идемпотентно).
//   * tickDataExportWorker  — POST /functions/v1/data-export { action:'generate' }.
//   * tickDataExportCleanup — пачка expired-записей (RPC _pick_expired_exports),
//                             удалить файлы в Storage bucket `user-exports`,
//                             вызвать _finalize_export_request(..., 'expired').
//   * tickHealthCheck       — RPC _account_deletion_health_check(), алерт если что-то застряло.
//
// Все тики:
//   - ловят ошибки и репортят через captureException (GlitchTip),
//   - ре-кидают ошибку наружу, чтобы index.js мог логировать в консоль.
//
// Конфиг берётся через ctx, чтобы в тестах удобно подменять fetch/pool/captureException.

const ACCOUNT_PURGE_PATH = '/functions/v1/account-purge';
const DATA_EXPORT_PATH = '/functions/v1/data-export';
const ADMIN_PATH = '/functions/v1/admin';
const EXPORT_BUCKET = 'user-exports';

const buildCtx = (ctx) => {
  if (!ctx) throw new Error('account-deletion cron: ctx is required');
  const {
    supabaseUrl,
    serviceRoleKey,
    pool,
    fetchImpl = fetch,
    captureException = () => {},
    captureMessage = () => {},
    logger = console,
    cronEnabled = true,
    exportCleanupBatchLimit = 100,
    healthCheckThresholds = {},
  } = ctx;

  if (!supabaseUrl) throw new Error('account-deletion cron: SUPABASE_URL is required');
  if (!serviceRoleKey) throw new Error('account-deletion cron: SERVICE_ROLE_KEY is required');
  if (!pool) throw new Error('account-deletion cron: pool is required');

  return {
    supabaseUrl,
    serviceRoleKey,
    pool,
    fetchImpl,
    captureException,
    captureMessage,
    logger,
    cronEnabled,
    exportCleanupBatchLimit,
    healthCheckThresholds: {
      stuckPurges: healthCheckThresholds.stuckPurges ?? 0,
      stuckExports: healthCheckThresholds.stuckExports ?? 3,
      stuckExpiredFiles: healthCheckThresholds.stuckExpiredFiles ?? 10,
    },
  };
};

const postFunction = async (ctx, path, body) => {
  const url = `${ctx.supabaseUrl}${path}`;
  const response = await ctx.fetchImpl(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ctx.serviceRoleKey}`,
    },
    body: body ? JSON.stringify(body) : '{}',
  });
  const text = await response.text();
  let parsed = null;
  if (text) {
    try { parsed = JSON.parse(text); } catch (_err) { parsed = { raw: text }; }
  }
  if (!response.ok) {
    const err = new Error(`${path} returned ${response.status}: ${text || '(empty)'}`);
    err.status = response.status;
    err.body = parsed;
    throw err;
  }
  return parsed;
};

const tickAccountPurge = async (rawCtx) => {
  const ctx = buildCtx(rawCtx);
  if (!ctx.cronEnabled) {
    ctx.logger.log('[account-purge cron] disabled via env');
    return { skipped: true, reason: 'disabled' };
  }
  try {
    const result = await postFunction(ctx, ACCOUNT_PURGE_PATH);
    ctx.logger.log(`[account-purge cron] ok: ${JSON.stringify({
      processed: result?.processed,
      purged: result?.purged,
      failed: result?.failed,
    })}`);
    if ((result?.failed ?? 0) > 0) {
      ctx.captureMessage('account-purge cron had failures', {
        level: 'warning',
        tags: { job: 'account-purge' },
        extra: { result },
      });
    }
    return result ?? {};
  } catch (error) {
    ctx.logger.error(`[account-purge cron] failed: ${error.message}`);
    ctx.captureException(error, { tags: { job: 'account-purge' } });
    throw error;
  }
};

const tickDataExportWorker = async (rawCtx) => {
  const ctx = buildCtx(rawCtx);
  try {
    const result = await postFunction(ctx, DATA_EXPORT_PATH, { action: 'generate' });
    // `generate` возвращает 200 и на no-op (не было pending) — логируем только если реально обработали.
    if (result?.status && result.status !== 'idle') {
      ctx.logger.log(`[data-export cron] ${result.status}${result.request_id ? ` (${result.request_id})` : ''}`);
    }
    return result ?? {};
  } catch (error) {
    ctx.logger.error(`[data-export cron] failed: ${error.message}`);
    ctx.captureException(error, { tags: { job: 'data-export-generate' } });
    throw error;
  }
};

const tickBroadcast = async (rawCtx) => {
  const ctx = buildCtx(rawCtx);
  try {
    // Promotes due scheduled broadcasts and sends one queued batch. Safe no-op
    // when nothing is pending. Makes delivery independent of the admin tab.
    const result = await postFunction(ctx, ADMIN_PATH, { action: 'broadcasts.tick' });
    if (result && (result.processed || result.promoted)) {
      ctx.logger.log(`[broadcast cron] promoted=${result.promoted ?? 0} sent=${result.sentCount ?? 0}`);
    }
    return result ?? {};
  } catch (error) {
    ctx.logger.error(`[broadcast cron] failed: ${error.message}`);
    ctx.captureException(error, { tags: { job: 'broadcast-tick' } });
    throw error;
  }
};

const deleteExpiredExportFile = async (ctx, filePath) => {
  if (!filePath) return { ok: true, skipped: true };
  const url = `${ctx.supabaseUrl}/storage/v1/object/${EXPORT_BUCKET}/${encodeURI(filePath)}`;
  const response = await ctx.fetchImpl(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${ctx.serviceRoleKey}` },
  });
  // 404 трактуем как уже-удалённый файл — ок.
  if (!response.ok && response.status !== 404) {
    const text = await response.text().catch(() => '');
    const err = new Error(`storage delete ${filePath} returned ${response.status}: ${text}`);
    err.status = response.status;
    throw err;
  }
  return { ok: true, status: response.status };
};

const tickDataExportCleanup = async (rawCtx) => {
  const ctx = buildCtx(rawCtx);
  const client = await ctx.pool.connect();
  const summary = { picked: 0, expired: 0, failed: 0 };
  try {
    await client.query('begin');
    const { rows } = await client.query(
      'select request_id, user_id, file_path, expires_at from public._pick_expired_exports($1)',
      [ctx.exportCleanupBatchLimit],
    );
    summary.picked = rows.length;

    for (const row of rows) {
      try {
        await deleteExpiredExportFile(ctx, row.file_path);
        await client.query(
          'select public._finalize_export_request($1, $2::text, null, null)',
          [row.request_id, 'expired'],
        );
        summary.expired += 1;
      } catch (err) {
        summary.failed += 1;
        ctx.captureException(err, {
          tags: { job: 'data-export-cleanup' },
          extra: { request_id: row.request_id, file_path: row.file_path },
        });
        // продолжаем чистить остальные — зависшая строка останется на следующий тик.
      }
    }

    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => {});
    ctx.logger.error(`[data-export cleanup] failed: ${error.message}`);
    ctx.captureException(error, { tags: { job: 'data-export-cleanup' } });
    throw error;
  } finally {
    client.release();
  }

  if (summary.picked > 0) {
    ctx.logger.log(`[data-export cleanup] ${JSON.stringify(summary)}`);
  }
  return summary;
};

const tickHealthCheck = async (rawCtx) => {
  const ctx = buildCtx(rawCtx);
  try {
    const { rows } = await ctx.pool.query('select public._account_deletion_health_check() as health');
    const health = rows[0]?.health ?? {};
    const { stuckPurges, stuckExports, stuckExpiredFiles } = ctx.healthCheckThresholds;
    const breaches = [];
    if ((health.stuck_purges ?? 0) > stuckPurges) breaches.push('stuck_purges');
    if ((health.stuck_exports ?? 0) > stuckExports) breaches.push('stuck_exports');
    if ((health.stuck_expired_files ?? 0) > stuckExpiredFiles) breaches.push('stuck_expired_files');

    if (breaches.length > 0) {
      ctx.captureMessage(`account-deletion health check breached: ${breaches.join(', ')}`, {
        level: 'warning',
        tags: { job: 'account-deletion-health' },
        extra: { health, breaches },
      });
      ctx.logger.warn(`[account-deletion health] breached: ${breaches.join(', ')} — ${JSON.stringify(health)}`);
    }
    return { health, breaches };
  } catch (error) {
    ctx.logger.error(`[account-deletion health] failed: ${error.message}`);
    ctx.captureException(error, { tags: { job: 'account-deletion-health' } });
    throw error;
  }
};

module.exports = {
  tickAccountPurge,
  tickDataExportWorker,
  tickDataExportCleanup,
  tickHealthCheck,
  tickBroadcast,
  // exported for tests
  deleteExpiredExportFile,
  postFunction,
};
