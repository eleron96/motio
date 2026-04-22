const RELOAD_GUARD_KEY = 'motio:preload-reload-at';
const RELOAD_COOLDOWN_MS = 10_000;

const PRELOAD_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
];

export const isPreloadError = (value: unknown): boolean => {
  if (!value) return false;
  const message = value instanceof Error ? value.message : String(value);
  return PRELOAD_ERROR_PATTERNS.some((pattern) => pattern.test(message));
};

type Storage = Pick<typeof window.sessionStorage, 'getItem' | 'setItem'>;
type Reloader = Pick<typeof window.location, 'reload'>;

export type PreloadReloadDeps = {
  now?: () => number;
  storage?: Storage | null;
  reloader?: Reloader;
  cooldownMs?: number;
};

/**
 * Reload the page at most once per cooldown window, using sessionStorage as a
 * guard so that a broken chunk on first paint cannot trap us in a reload loop.
 * Returns true if a reload was triggered.
 */
export const maybeReloadForPreloadError = (deps: PreloadReloadDeps = {}): boolean => {
  const {
    now = () => Date.now(),
    storage = typeof window !== 'undefined' ? window.sessionStorage : null,
    reloader = typeof window !== 'undefined' ? window.location : undefined,
    cooldownMs = RELOAD_COOLDOWN_MS,
  } = deps;

  if (!reloader) return false;

  const current = now();
  if (storage) {
    const raw = storage.getItem(RELOAD_GUARD_KEY);
    const previous = raw ? Number.parseInt(raw, 10) : Number.NaN;
    if (Number.isFinite(previous) && current - previous < cooldownMs) {
      return false;
    }
    try {
      storage.setItem(RELOAD_GUARD_KEY, String(current));
    } catch {
      // Storage may be disabled (Safari private mode); proceed with the reload anyway.
    }
  }

  reloader.reload();
  return true;
};

/**
 * Wire the browser-wide handlers that reload the app when a Vite chunk from a
 * previous deploy is requested after the bundle has been rotated. Idempotent —
 * safe to call more than once.
 */
export const installPreloadErrorReload = (deps: PreloadReloadDeps = {}): () => void => {
  if (typeof window === 'undefined') return () => undefined;

  const onPreload = () => {
    maybeReloadForPreloadError(deps);
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    if (!isPreloadError(event.reason)) return;
    maybeReloadForPreloadError(deps);
  };

  const onError = (event: ErrorEvent) => {
    if (!isPreloadError(event.error ?? event.message)) return;
    maybeReloadForPreloadError(deps);
  };

  window.addEventListener('vite:preloadError', onPreload);
  window.addEventListener('unhandledrejection', onRejection);
  window.addEventListener('error', onError);

  return () => {
    window.removeEventListener('vite:preloadError', onPreload);
    window.removeEventListener('unhandledrejection', onRejection);
    window.removeEventListener('error', onError);
  };
};
