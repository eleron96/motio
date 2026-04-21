// Минимальный Sentry-совместимый клиент для GlitchTip через fetch.
// Повторяет паттерн из infra/supabase/functions/_shared/sentryCapture.ts, но в CommonJS.
// Отсутствие DSN → no-op.
const { randomUUID } = require('crypto');

const DSN = process.env.GLITCHTIP_DSN || '';

let parsed = null;

const parseDsn = (dsn) => {
  try {
    const url = new URL(dsn);
    return {
      publicKey: url.username,
      projectId: url.pathname.replace('/', ''),
      host: `${url.protocol}//${url.host}`,
    };
  } catch (_err) {
    return null;
  }
};

const getParsed = () => {
  if (parsed) return parsed;
  if (!DSN) return null;
  parsed = parseDsn(DSN);
  return parsed;
};

const captureException = (error, options = {}) => {
  const dsn = getParsed();
  if (!dsn) return;

  const err = error instanceof Error ? error : new Error(String(error));
  const stackFrames = err.stack
    ? err.stack.split('\n').slice(1, 20).map((line) => ({ filename: line.trim() }))
    : undefined;

  const event = {
    event_id: randomUUID().replace(/-/g, ''),
    timestamp: new Date().toISOString(),
    platform: 'node',
    level: options.level || 'error',
    server_name: 'backup-service',
    exception: {
      values: [{
        type: err.name,
        value: err.message,
        stacktrace: stackFrames ? { frames: stackFrames } : undefined,
      }],
    },
    tags: options.tags || {},
    extra: options.extra || {},
  };

  const storeUrl = `${dsn.host}/api/${dsn.projectId}/store/?sentry_version=7&sentry_key=${dsn.publicKey}`;

  fetch(storeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  }).catch(() => {
    // swallow — мониторинг не должен ломать воркер.
  });
};

const captureMessage = (message, options = {}) => {
  captureException(new Error(message), { ...options, level: options.level || 'warning' });
};

module.exports = { captureException, captureMessage };
