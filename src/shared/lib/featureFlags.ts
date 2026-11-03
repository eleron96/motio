// Lightweight env-based feature flags. Vite inlines `import.meta.env.VITE_*` at
// build time, so checks compile down to constants — no runtime overhead.
//
// Flags default to OFF for safety: missing or empty env var → disabled.
//
// A flag lives only while its feature rolls out. Once it is on everywhere —
// production, testing and the self-host default — remove it together with the
// code behind "off".

import { isDemoRoute } from '@/features/demo/hooks/useIsDemo';

const readFlag = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
};

export const isAccountDeletionEnabled = (): boolean => (
  readFlag(import.meta.env.VITE_FEATURE_ACCOUNT_DELETION)
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
 * When on, a person can turn on the board (kanban) view in account settings →
 * Appearance and then switch the planner between the timeline and a board of
 * status columns. A hidden beta: the manifesto still says "no kanban", so it
 * is NOT forced on in /demo (the public sandbox) — only the build env enables it.
 */
export const isBoardViewEnabled = (): boolean => (
  readFlag(import.meta.env.VITE_FEATURE_KANBAN)
);

/**
 * When on, workspace admins see the "API" section in workspace settings, where
 * they create and revoke tokens for importing absences from another system
 * (Edge Function `api`, docs/api.md). The endpoint itself works without the
 * flag but is useless without a token. Never in /demo: the sandbox has no
 * backend to keep tokens.
 */
export const isWorkspaceApiEnabled = (): boolean => (
  !isDemoRoute() && readFlag(import.meta.env.VITE_FEATURE_WORKSPACE_API)
);

/**
 * When on, an open task card shows teammates' drafts live and semi-transparent:
 * the subtask or comment someone is typing, an edit of a subtask, that someone
 * edits the description. Desktop only for now. Needs the realtime.messages
 * policies of migration 0159. Never in /demo: the sandbox has no realtime.
 */
export const isTaskLiveDraftsEnabled = (): boolean => (
  !isDemoRoute() && readFlag(import.meta.env.VITE_FEATURE_TASK_LIVE_DRAFTS)
);

/**
 * Every interface flag as this build has it, for the admin "System" section.
 * Raw build values only — the /demo forcing above does not apply here.
 */
export const listBuildFeatureFlags = (): Array<{ name: string; enabled: boolean }> => [
  { name: 'VITE_FEATURE_PUSH', enabled: readFlag(import.meta.env.VITE_FEATURE_PUSH) },
  { name: 'VITE_FEATURE_KANBAN', enabled: readFlag(import.meta.env.VITE_FEATURE_KANBAN) },
  { name: 'VITE_FEATURE_ACCOUNT_DELETION', enabled: readFlag(import.meta.env.VITE_FEATURE_ACCOUNT_DELETION) },
  { name: 'VITE_FEATURE_WORKSPACE_API', enabled: readFlag(import.meta.env.VITE_FEATURE_WORKSPACE_API) },
  { name: 'VITE_FEATURE_TASK_LIVE_DRAFTS', enabled: readFlag(import.meta.env.VITE_FEATURE_TASK_LIVE_DRAFTS) },
];

