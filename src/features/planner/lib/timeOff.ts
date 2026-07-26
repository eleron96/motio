// Pure logic for time-off records ("Отметить выходной").
//
// Kept free of React and of the data layer so the timeline, the dialogs and the
// tests all share one implementation of "which days does this record cover" and
// "does this period collide with another one".

import { format } from 'date-fns';
import type { TimeOff, TimeOffDragPreview } from '@/features/planner/types/planner';

/**
 * Frozen empty array used as the store fallback. A literal `?? []` would hand
 * every render a fresh array, defeating the memo comparators the timeline rows
 * rely on (there is no virtualization — every row re-renders on every tick).
 */
export const NO_TIME_OFF: TimeOff[] = Object.freeze([] as TimeOff[]) as TimeOff[];

export type TimeOffIndex = {
  /** All records of a row — needed to check collisions while dragging. */
  byRowId: Map<string, TimeOff[]>;
  /** dayKey -> the record covering it, per row. Drives the grey shading. */
  daysByRowId: Map<string, Map<string, TimeOff>>;
};

export const EMPTY_TIME_OFF_INDEX: TimeOffIndex = {
  byRowId: new Map(),
  daysByRowId: new Map(),
};

const dayKey = (day: Date): string => format(day, 'yyyy-MM-dd');

/** Inclusive on both ends: a one-day record covers exactly that day. */
export const timeOffCoversDay = (record: TimeOff, key: string): boolean => (
  key >= record.startDate && key <= record.endDate
);

export const timeOffCoveredDays = (record: TimeOff, visibleDays: Date[]): string[] => (
  visibleDays.map(dayKey).filter((key) => timeOffCoversDay(record, key))
);

/**
 * Weekends and holidays keep their normal look: they are already non-working,
 * so shading them grey would say nothing and would fight the existing hatch.
 */
export const shouldShadeTimeOffDay = (
  covered: boolean,
  isWeekend: boolean,
  isHoliday: boolean,
): boolean => covered && !isWeekend && !isHoliday;

/** The bar always owns lane 0, so a row with a record needs one extra lane. */
export const timeOffExtraLanes = (rowRecords: TimeOff[] | undefined): number => (
  rowRecords && rowRecords.length > 0 ? 1 : 0
);

/** Task bars shift down by one lane in rows that carry a time-off bar. */
export const timeOffLaneOffset = (rowRecords: TimeOff[] | undefined): number => (
  timeOffExtraLanes(rowRecords)
);

/** Apply an in-flight drag/resize on top of the stored record. */
export const withTimeOffPreview = (record: TimeOff, preview: TimeOffDragPreview): TimeOff => (
  preview && preview.id === record.id
    ? { ...record, startDate: preview.startDate, endDate: preview.endDate }
    : record
);

/**
 * The record this candidate period would collide with, or null. Mirrors the
 * database guard from migration 0131 (inclusive ranges, self excluded by id) so
 * the user is told before the round-trip rather than by a rejected write.
 */
export const findTimeOffConflict = (
  candidate: { id?: string; startDate: string; endDate: string },
  siblings: TimeOff[],
): TimeOff | null => (
  siblings.find((other) => (
    other.id !== candidate.id
    && other.startDate <= candidate.endDate
    && other.endDate >= candidate.startDate
  )) ?? null
);

/**
 * Group records by row (= assignee id) and pre-compute the covered days inside
 * the visible window. Built once per window change in TimelineGrid, so the
 * per-cell lookup in TimelineRow stays a Map hit.
 */
export const buildTimeOffIndex = (
  records: TimeOff[],
  visibleDays: Date[],
  preview: TimeOffDragPreview = null,
): TimeOffIndex => {
  if (records.length === 0) return EMPTY_TIME_OFF_INDEX;

  const byRowId = new Map<string, TimeOff[]>();
  const daysByRowId = new Map<string, Map<string, TimeOff>>();
  const keys = visibleDays.map(dayKey);
  const windowStart = keys[0];
  const windowEnd = keys[keys.length - 1];

  records.forEach((stored) => {
    const record = withTimeOffPreview(stored, preview);
    // Only records that intersect the visible window: byRowId drives the extra
    // lane and the bar, and a record entirely off-screen would otherwise reserve
    // an empty lane 0 and push the task bars down under nothing.
    if (windowStart && windowEnd && (record.endDate < windowStart || record.startDate > windowEnd)) {
      return;
    }
    const rowRecords = byRowId.get(record.assigneeId);
    if (rowRecords) rowRecords.push(record);
    else byRowId.set(record.assigneeId, [record]);

    let days = daysByRowId.get(record.assigneeId);
    if (!days) {
      days = new Map<string, TimeOff>();
      daysByRowId.set(record.assigneeId, days);
    }
    keys.forEach((key) => {
      if (timeOffCoversDay(record, key)) days!.set(key, record);
    });
  });

  return { byRowId, daysByRowId };
};
