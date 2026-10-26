import { isBoardViewEnabled } from '@/shared/lib/featureFlags';

// The board (kanban) view is gated twice: the build-time flag and a per-user
// profile preference, like the optional Week view. Keep the key and the read
// logic in one place so the toggle (account settings), the view switcher
// (TimelineControls) and the fallback guard (PlannerPage) all agree.
export const BOARD_VIEW_PREFERENCE_KEY = 'board_view_enabled';

export const isBoardViewPreferenceOn = (
  preferences: Record<string, unknown> | null | undefined,
): boolean => preferences?.[BOARD_VIEW_PREFERENCE_KEY] === true;

/** The board can be shown: the feature is built in and the person turned it on. */
export const isBoardViewAvailable = (
  preferences: Record<string, unknown> | null | undefined,
): boolean => isBoardViewEnabled() && isBoardViewPreferenceOn(preferences);
