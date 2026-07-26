// Persistence for the calendar legend checkboxes, in the shape the planner
// already uses for the sidebar width: pure functions over an injected Storage,
// keyed per user and per workspace so two accounts on one machine (and two
// workspaces of one account) keep their own state.

import {
  DEFAULT_CALENDAR_OVERLAY_VISIBILITY,
  normalizeOverlayVisibility,
  type CalendarOverlayVisibility,
} from '@/features/planner/lib/calendarDayMarkers';

export const getCalendarLegendStorageKey = (userId: string, workspaceId: string) => (
  `planner-calendar-legend-${userId}-${workspaceId}`
);

export const readCalendarLegend = (
  storage: Pick<Storage, 'getItem'>,
  storageKey: string,
): CalendarOverlayVisibility | null => {
  const raw = storage.getItem(storageKey);
  if (!raw) return null;

  try {
    return normalizeOverlayVisibility(JSON.parse(raw));
  } catch {
    // Corrupted entry (hand-edited, truncated by a full quota): fall back to the
    // defaults rather than leaving the calendar blank.
    return DEFAULT_CALENDAR_OVERLAY_VISIBILITY;
  }
};

export const writeCalendarLegend = (
  storage: Pick<Storage, 'setItem'>,
  storageKey: string,
  visibility: CalendarOverlayVisibility,
) => {
  storage.setItem(storageKey, JSON.stringify(normalizeOverlayVisibility(visibility)));
};
