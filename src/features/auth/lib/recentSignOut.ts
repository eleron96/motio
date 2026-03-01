const RECENT_SIGN_OUT_KEY = 'motio_recent_sign_out_at';
const RECENT_SIGN_OUT_TTL_MS = 5 * 60 * 1000;

const getSessionStorage = (): Storage | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch (_error) {
    return null;
  }
};

export const markRecentSignOut = (): void => {
  const storage = getSessionStorage();
  if (!storage) return;
  storage.setItem(RECENT_SIGN_OUT_KEY, String(Date.now()));
};

export const clearRecentSignOut = (): void => {
  const storage = getSessionStorage();
  if (!storage) return;
  storage.removeItem(RECENT_SIGN_OUT_KEY);
};

export const consumeRecentSignOut = (): boolean => {
  const storage = getSessionStorage();
  if (!storage) return false;

  const raw = storage.getItem(RECENT_SIGN_OUT_KEY);
  storage.removeItem(RECENT_SIGN_OUT_KEY);
  if (!raw) return false;

  const marker = Number(raw);
  if (!Number.isFinite(marker)) return false;
  return Date.now() - marker <= RECENT_SIGN_OUT_TTL_MS;
};
