// Lightweight env-based feature flags. Vite inlines `import.meta.env.VITE_*` at
// build time, so checks compile down to constants — no runtime overhead.
//
// Flags default to OFF for safety: missing or empty env var → disabled.

const readFlag = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
};

export const isAccountDeletionEnabled = (): boolean => (
  readFlag(import.meta.env.VITE_FEATURE_ACCOUNT_DELETION)
);

export const isProjectCardEnabled = (): boolean => (
  readFlag(import.meta.env.VITE_FEATURE_PROJECT_CARD)
);

/**
 * When on, the new Project Card UI is rendered on mobile too (otherwise mobile
 * falls back to the legacy panel). Implies `isProjectCardEnabled`.
 *
 * Edit flows are gated separately as they are layered in across mobile phases
 * (M1 = read-only, M2 = status + activity composer, etc.) — for now the same
 * flag covers the whole mobile path.
 */
export const isProjectCardMobileEnabled = (): boolean => (
  isProjectCardEnabled()
  && readFlag(import.meta.env.VITE_FEATURE_PROJECT_CARD_MOBILE)
);
