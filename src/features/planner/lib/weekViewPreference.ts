// The optional "Week" timeline view is gated by a per-user profile preference.
// Keep the storage key and the read logic in one place so the toggle (account
// settings), the view switcher (TimelineControls) and the fallback guard
// (PlannerPage) all agree.
export const WEEK_VIEW_PREFERENCE_KEY = 'week_view_enabled';

export const isWeekViewEnabled = (
  preferences: Record<string, unknown> | null | undefined,
): boolean => preferences?.[WEEK_VIEW_PREFERENCE_KEY] === true;
