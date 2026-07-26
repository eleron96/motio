// Persistence for the calendar legend — the category checkboxes and the local
// people selection — in the shape the planner already uses for the sidebar
// width: pure functions over an injected Storage, keyed per user and per
// workspace so two accounts on one machine (and two workspaces of one account)
// keep their own state.

import {
  DEFAULT_CALENDAR_OVERLAY_VISIBILITY,
  normalizeOverlayVisibility,
  normalizePeopleSelection,
  type CalendarOverlayVisibility,
  type CalendarPeopleSelection,
} from '@/features/planner/lib/calendarDayMarkers';

export type CalendarLegendState = {
  visibility: CalendarOverlayVisibility;
  /** null = everyone, which is also what a fresh calendar starts with. */
  people: CalendarPeopleSelection;
};

export const DEFAULT_CALENDAR_LEGEND_STATE: CalendarLegendState = {
  visibility: DEFAULT_CALENDAR_OVERLAY_VISIBILITY,
  people: null,
};

export const getCalendarLegendStorageKey = (userId: string, workspaceId: string) => (
  `planner-calendar-legend-${userId}-${workspaceId}`
);

const normalizeLegendState = (value: unknown): CalendarLegendState => {
  if (!value || typeof value !== 'object') return DEFAULT_CALENDAR_LEGEND_STATE;
  const source = value as { visibility?: unknown; people?: unknown };

  // The first release stored the visibility object on its own, so an entry
  // without a `visibility` key is that older shape.
  const visibility = 'visibility' in source
    ? normalizeOverlayVisibility(source.visibility)
    : normalizeOverlayVisibility(value);

  return { visibility, people: normalizePeopleSelection(source.people) };
};

export const readCalendarLegend = (
  storage: Pick<Storage, 'getItem'>,
  storageKey: string,
): CalendarLegendState | null => {
  const raw = storage.getItem(storageKey);
  if (!raw) return null;

  try {
    return normalizeLegendState(JSON.parse(raw));
  } catch {
    // Corrupted entry (hand-edited, truncated by a full quota): fall back to the
    // defaults rather than leaving the calendar blank.
    return DEFAULT_CALENDAR_LEGEND_STATE;
  }
};

export const writeCalendarLegend = (
  storage: Pick<Storage, 'setItem'>,
  storageKey: string,
  state: CalendarLegendState,
) => {
  storage.setItem(storageKey, JSON.stringify(normalizeLegendState(state)));
};
