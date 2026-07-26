import { describe, expect, it, vi } from 'vitest';
import {
  getCalendarLegendStorageKey,
  readCalendarLegend,
  writeCalendarLegend,
} from '@/features/planner/lib/calendarLegendStorage';
import { DEFAULT_CALENDAR_OVERLAY_VISIBILITY } from '@/features/planner/lib/calendarDayMarkers';

const storageWith = (raw: string | null) => ({ getItem: vi.fn(() => raw) });

describe('calendar legend storage', () => {
  it('keys per user and per workspace', () => {
    expect(getCalendarLegendStorageKey('u1', 'w1')).toBe('planner-calendar-legend-u1-w1');
    expect(getCalendarLegendStorageKey('u1', 'w2')).not.toBe(getCalendarLegendStorageKey('u1', 'w1'));
  });

  it('returns null when nothing is stored, so the caller can keep the defaults', () => {
    expect(readCalendarLegend(storageWith(null), 'key')).toBeNull();
  });

  it('reads a stored value back', () => {
    const stored = JSON.stringify({ holidays: false, milestones: true, timeOff: true });

    expect(readCalendarLegend(storageWith(stored), 'key')).toEqual({
      holidays: false,
      milestones: true,
      timeOff: true,
    });
  });

  it('fills missing categories from the defaults', () => {
    expect(readCalendarLegend(storageWith(JSON.stringify({ timeOff: true })), 'key')).toEqual({
      holidays: true,
      milestones: true,
      timeOff: true,
    });
  });

  it('falls back to the defaults on corrupted JSON instead of throwing', () => {
    expect(readCalendarLegend(storageWith('{oops'), 'key')).toEqual(DEFAULT_CALENDAR_OVERLAY_VISIBILITY);
  });

  it('writes a normalized value', () => {
    const setItem = vi.fn();
    writeCalendarLegend({ setItem }, 'key', { holidays: true, milestones: false, timeOff: true });

    expect(setItem).toHaveBeenCalledWith(
      'key',
      JSON.stringify({ holidays: true, milestones: false, timeOff: true }),
    );
  });
});
