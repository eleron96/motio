export type AuthSessionState = 'signed-in' | 'signed-out';

export interface AuthSessionSyncPayload {
  state: AuthSessionState;
  at: number;
  source: string;
}

export const AUTH_SESSION_SYNC_STORAGE_KEY = 'motio_auth_session_sync';
const AUTH_SESSION_SYNC_SOURCE_KEY = 'motio_auth_session_sync_source';

const getSessionStorage = (): Storage | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch (_error) {
    return null;
  }
};

const getLocalStorage = (): Storage | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch (_error) {
    return null;
  }
};

const createSourceId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const getSourceId = () => {
  const storage = getSessionStorage();
  if (!storage) return createSourceId();

  const existing = storage.getItem(AUTH_SESSION_SYNC_SOURCE_KEY);
  if (existing) return existing;

  const next = createSourceId();
  storage.setItem(AUTH_SESSION_SYNC_SOURCE_KEY, next);
  return next;
};

export const parseAuthSessionSyncPayload = (raw: string | null | undefined): AuthSessionSyncPayload | null => {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<AuthSessionSyncPayload>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.state !== 'signed-in' && parsed.state !== 'signed-out') return null;
    if (!Number.isFinite(parsed.at)) return null;
    if (typeof parsed.source !== 'string' || parsed.source.trim().length === 0) return null;

    return {
      state: parsed.state,
      at: parsed.at,
      source: parsed.source,
    };
  } catch (_error) {
    return null;
  }
};

export const broadcastAuthSessionSync = (state: AuthSessionState) => {
  const storage = getLocalStorage();
  if (!storage) return;

  const payload: AuthSessionSyncPayload = {
    state,
    at: Date.now(),
    source: getSourceId(),
  };
  storage.setItem(AUTH_SESSION_SYNC_STORAGE_KEY, JSON.stringify(payload));
};

export const isAuthSessionSyncStorageEvent = (event: StorageEvent): boolean => (
  event.key === AUTH_SESSION_SYNC_STORAGE_KEY && typeof event.newValue === 'string'
);

export const getAuthSessionStateFromStorageEvent = (event: StorageEvent): AuthSessionState | null => {
  if (!isAuthSessionSyncStorageEvent(event)) return null;
  return parseAuthSessionSyncPayload(event.newValue)?.state ?? null;
};

export const isSupabaseAuthStorageKey = (key: string | null): boolean => (
  typeof key === 'string' && key.startsWith('sb-') && key.includes('-auth-token')
);
