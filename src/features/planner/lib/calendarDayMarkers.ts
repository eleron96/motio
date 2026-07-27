// What the calendar draws on top of a day, and which of it the legend shows.
//
// Kept free of React so the arithmetic is testable and runs once for the whole
// two-year window instead of per day cell.

import { format } from 'date-fns';
import type { Assignee, TimeOff } from '@/features/planner/types/planner';

export type CalendarOverlayCategory = 'holidays' | 'milestones' | 'timeOff';

export type CalendarOverlayVisibility = Record<CalendarOverlayCategory, boolean>;

/**
 * Holidays and milestones are what the calendar already showed, so they stay on;
 * team time off is new and opt-in, per the product decision.
 */
export const DEFAULT_CALENDAR_OVERLAY_VISIBILITY: CalendarOverlayVisibility = {
  holidays: true,
  milestones: true,
  timeOff: false,
};

export const CALENDAR_OVERLAY_CATEGORIES: CalendarOverlayCategory[] = [
  'holidays',
  'milestones',
  'timeOff',
];

export const normalizeOverlayVisibility = (value: unknown): CalendarOverlayVisibility => {
  if (!value || typeof value !== 'object') return DEFAULT_CALENDAR_OVERLAY_VISIBILITY;
  const source = value as Partial<Record<CalendarOverlayCategory, unknown>>;
  return CALENDAR_OVERLAY_CATEGORIES.reduce((result, category) => {
    result[category] = typeof source[category] === 'boolean'
      ? (source[category] as boolean)
      : DEFAULT_CALENDAR_OVERLAY_VISIBILITY[category];
    return result;
  }, {} as CalendarOverlayVisibility);
};

/**
 * Which people the calendar marks. `null` means everyone — kept distinct from
 * an empty array, which means the user has unticked every single person and
 * should see nothing rather than everything.
 */
export type CalendarPeopleSelection = string[] | null;

export const normalizePeopleSelection = (value: unknown): CalendarPeopleSelection => {
  if (!Array.isArray(value)) return null;
  const ids = value.filter((item): item is string => typeof item === 'string');
  return ids.length === value.length ? ids : null;
};

export const isPersonShown = (
  selection: CalendarPeopleSelection,
  assigneeId: string,
): boolean => selection === null || selection.includes(assigneeId);

/** Toggle one person, keeping "everyone" as the state when nothing is excluded. */
export const togglePersonSelection = (
  selection: CalendarPeopleSelection,
  assigneeId: string,
  allIds: string[],
): CalendarPeopleSelection => {
  const current = selection ?? allIds;
  const next = current.includes(assigneeId)
    ? current.filter((id) => id !== assigneeId)
    : [...current, assigneeId];

  // Everyone ticked again — store it as "everyone" so people added later are
  // included automatically instead of silently missing.
  if (allIds.length > 0 && allIds.every((id) => next.includes(id))) return null;
  return next;
};

/**
 * Records worth drawing: people who are still on the team. Deliberately NOT
 * narrowed by the people filter — the calendar answers "who is away in the
 * team", and a filter set for the timeline should not silently hide colleagues
 * from that picture (product decision).
 */
export const selectCalendarTimeOff = (
  records: TimeOff[],
  assigneeById: Map<string, Assignee>,
  people: CalendarPeopleSelection = null,
): TimeOff[] => records.filter((record) => (
  assigneeById.get(record.assigneeId)?.isActive !== false
  && isPersonShown(people, record.assigneeId)
));

const dayKey = (day: Date): string => format(day, 'yyyy-MM-dd');

/**
 * dayKey -> records covering it, clipped to the rendered window.
 *
 * Walks the RECORDS and expands each one's own span. The obvious alternative —
 * walking the visible days and asking each record — is what buildTimeOffIndex
 * does for the timeline (~120 days), and it does not scale here: the calendar
 * renders ~750 days, so that shape would be 750 × records comparisons.
 */
export const buildTimeOffByDate = (
  records: TimeOff[],
  windowStart: Date,
  windowEnd: Date,
): Map<string, TimeOff[]> => {
  const byDate = new Map<string, TimeOff[]>();
  if (records.length === 0) return byDate;

  const startKey = dayKey(windowStart);
  const endKey = dayKey(windowEnd);

  records.forEach((record) => {
    if (record.endDate < startKey || record.startDate > endKey) return;

    // Iterate on the record's own (clipped) span, day by day, as strings —
    // cheaper than constructing Date objects for every covered day.
    const from = record.startDate < startKey ? startKey : record.startDate;
    const to = record.endDate > endKey ? endKey : record.endDate;

    const cursor = new Date(`${from}T12:00:00`);
    const last = new Date(`${to}T12:00:00`);
    while (cursor <= last) {
      const key = dayKey(cursor);
      const list = byDate.get(key);
      if (list) list.push(record);
      else byDate.set(key, [record]);
      cursor.setDate(cursor.getDate() + 1);
    }
  });

  return byDate;
};

/**
 * How much of the day cell the away-circle takes on a public holiday.
 *
 * On a statutory holiday nobody is working anyway, so the circle steps back to
 * 70% of its diameter: the rose holiday pill stays readable around it instead of
 * the two marks merging into one blob. Same reasoning as the timeline, which
 * skips shading holidays outright (shouldShadeTimeOffDay) — the calendar keeps a
 * quieter mark rather than none, because here the circle is the only thing
 * saying who is away.
 *
 * Weekends are NOT included: they carry no pill to compete with, and the amber
 * day number already tells them apart.
 */
export const TIME_OFF_HOLIDAY_CIRCLE_SCALE = 0.7;

/**
 * Tailwind inset for the away-circle. A square box inset by N% on every side is
 * (100 - 2N)% wide, so 15% yields exactly the 70% above.
 *
 * The class is a LITERAL on purpose: Tailwind scans source text, so a value
 * built by string interpolation would never make it into the stylesheet and the
 * circle would silently keep its full size. The unit test pins the two together.
 */
export const timeOffCircleInsetClass = (isHoliday: boolean): string => (
  isHoliday ? 'inset-[15%]' : 'inset-0'
);
