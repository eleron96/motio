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
