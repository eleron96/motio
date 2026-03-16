import { supabase } from '@/shared/lib/supabaseClient';

const storageKey = (userId: string) => `motio_daily_brief_${userId}`;

export const toLocalDateString = (date: Date): string =>
  date.toLocaleDateString('en-CA'); // "2026-03-15"

// --- localStorage (cache layer) ---

const getLocalShownDate = (userId: string): string | null =>
  localStorage.getItem(storageKey(userId));

const setLocalShownDate = (userId: string, date: string): void =>
  localStorage.setItem(storageKey(userId), date);

// --- Supabase (sync layer) ---

interface RemoteState {
  shownDate: string | null;
  /** Берём из preferences.daily_brief_enabled; по умолчанию true */
  enabled: boolean;
}

const fetchRemoteState = async (userId: string): Promise<RemoteState> => {
  const { data } = await supabase
    .from('profiles')
    .select('daily_brief_shown_date, preferences')
    .eq('id', userId)
    .single();

  const prefs = (data?.preferences ?? {}) as Record<string, unknown>;
  // Если поле отсутствует — считаем включённым (обратная совместимость)
  const enabled = prefs.daily_brief_enabled !== false;

  return {
    shownDate: (data?.daily_brief_shown_date as string | null) ?? null,
    enabled,
  };
};

export const updateRemoteShownDate = async (userId: string, date: string): Promise<void> => {
  await supabase
    .from('profiles')
    .update({ daily_brief_shown_date: date })
    .eq('id', userId);
};

// --- Public API ---

/**
 * Marks today as shown: updates both localStorage and Supabase.
 * localStorage is updated synchronously; Supabase is fire-and-forget.
 */
export const markShownToday = (userId: string): void => {
  const today = toLocalDateString(new Date());
  setLocalShownDate(userId, today);
  // fire-and-forget — не блокируем UI
  updateRemoteShownDate(userId, today).catch(() => {});
};

/**
 * Quick synchronous check using localStorage only.
 * Returns false if before 9 AM or already shown today locally.
 */
export const isLocallyShownToday = (userId: string): boolean => {
  const now = new Date();
  if (now.getHours() < 9) return false;
  const today = toLocalDateString(now);
  return getLocalShownDate(userId) === today;
};

/**
 * Full check: fast local first, then Supabase if local says "not shown".
 * Returns true if modal should be shown.
 * Проверяет и дату, и настройку daily_brief_enabled одним запросом.
 */
export const shouldShowNow = async (userId: string): Promise<boolean> => {
  const now = new Date();
  if (now.getHours() < 9) return false;

  const today = toLocalDateString(now);

  // Быстрый путь: localStorage уже знает — лишних запросов к Supabase не делаем
  if (getLocalShownDate(userId) === today) return false;

  // Медленный путь: один запрос к Supabase — проверяем и дату, и настройку
  const { shownDate, enabled } = await fetchRemoteState(userId);

  // Пользователь отключил функцию в настройках
  if (!enabled) return false;

  if (shownDate === today) {
    // Синхронизируем локальный кэш — на этом устройстве тоже не показываем
    setLocalShownDate(userId, today);
    return false;
  }

  return true;
};

export const getMsUntilNext9AM = (): number => {
  const now = new Date();
  const next9 = new Date(now);
  next9.setHours(9, 0, 0, 0);
  if (now >= next9) {
    next9.setDate(next9.getDate() + 1);
  }
  return next9.getTime() - now.getTime();
};
