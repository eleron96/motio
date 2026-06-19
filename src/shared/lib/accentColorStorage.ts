import { DEFAULT_ACCENT_ID, isValidAccentId } from '@/shared/lib/accentColor';

// Cache the chosen accent locally so it can be applied at module load — before
// the profile round-trip — avoiding a flash of the default color on reload.
const STORAGE_KEY = 'ui-accent-color';

export const getStoredAccentId = (): string => {
  if (typeof window === 'undefined') return DEFAULT_ACCENT_ID;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isValidAccentId(stored) ? stored : DEFAULT_ACCENT_ID;
};

export const setStoredAccentId = (id: string) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, id);
};
