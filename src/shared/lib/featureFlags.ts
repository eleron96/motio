// Lightweight env-based feature flags. Vite inlines `import.meta.env.VITE_*` at
// build time, so checks compile down to constants — no runtime overhead.
//
// Flags default to OFF for safety: missing or empty env var → disabled.

import { isDemoRoute } from '@/features/demo/hooks/useIsDemo';

const readFlag = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
};

export const isAccountDeletionEnabled = (): boolean => (
  readFlag(import.meta.env.VITE_FEATURE_ACCOUNT_DELETION)
);

// The /demo sandbox is a self-contained showcase: force the customer/contacts
// and workload-heatmap features on there regardless of the build-time env, so
// the demo always exhibits them (and works under a plain `npm run dev` too).
export const isProjectCardEnabled = (): boolean => (
  isDemoRoute() || readFlag(import.meta.env.VITE_FEATURE_PROJECT_CARD)
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

/**
 * When on, the built-in "workload heatmap" board is available on the dashboard
 * page (a toggle in the toolbar) and its per-workspace switch shows up in
 * workspace settings. Off by default so the migration and code can ship dormant
 * ahead of GA; the per-workspace `heatmap_enabled` flag gates it after that.
 */
export const isWorkloadHeatmapEnabled = (): boolean => (
  isDemoRoute() || readFlag(import.meta.env.VITE_FEATURE_WORKLOAD_HEATMAP)
);

/**
 * When on, adding a customer contact or an external team member suggests people
 * already entered elsewhere in the workspace, so they don't have to be retyped
 * per project. Purely additive — the existing add forms are unchanged when
 * there is nothing to suggest. Off by default; only affects the Project Card,
 * so it implies `isProjectCardEnabled`.
 */
export const isPeopleSuggestEnabled = (): boolean => (
  isProjectCardEnabled()
  && readFlag(import.meta.env.VITE_FEATURE_PEOPLE_SUGGEST)
);

/**
 * When on, the browser push-notification opt-in appears in account settings and
 * the app registers its service worker. Off by default so the transport can
 * ship dormant; browser capability detection (isPushSupported) still applies on
 * top of the flag, so unsupported browsers never see it. Not forced on in /demo
 * — the demo sandbox runs without the backend that stores subscriptions.
 */
export const isPushEnabled = (): boolean => (
  readFlag(import.meta.env.VITE_FEATURE_PUSH)
);

/**
 * When on, a person can mark their own days off ("Отметить выходной") on the
 * timeline: the record renders as a bar on lane 0 of their row and shades the
 * covered working days. Off by default so the table and the render can ship
 * dormant; forced on in /demo so the sandbox always exhibits it.
 */
export const isTimeOffEnabled = (): boolean => (
  isDemoRoute() || readFlag(import.meta.env.VITE_FEATURE_TIME_OFF)
);
