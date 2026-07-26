import { describe, expect, it, vi } from 'vitest';
import {
  getCalendarLegendStorageKey,
  readCalendarLegend,
  writeCalendarLegend,
} from '@/features/planner/lib/calendarLegendStorage';
import { DEFAULT_CALENDAR_LEGEND_STATE } from '@/features/planner/lib/calendarLegendStorage';

const storageWith = (raw: string | null) => ({ getItem: vi.fn(() => raw) });

describe('calendar legend storage', () => {
  it('keys per user and per workspace', () => {
    expect(getCalendarLegendStorageKey('u1', 'w1')).toBe('planner-calendar-legend-u1-w1');
    expect(getCalendarLegendStorageKey('u1', 'w2')).not.toBe(getCalendarLegendStorageKey('u1', 'w1'));
  });

  it('returns null when nothing is stored, so the caller can keep the defaults', () => {
    expect(readCalendarLegend(storageWith(null), 'key')).toBeNull();
  });

  it('reads a stored value back, people included', () => {
    const stored = JSON.stringify({
      visibility: { holidays: false, milestones: true, timeOff: true },
      people: ['a1', 'a2'],
    });

    expect(readCalendarLegend(storageWith(stored), 'key')).toEqual({
      visibility: { holidays: false, milestones: true, timeOff: true },
      people: ['a1', 'a2'],
    });
  });

  it('reads the first-release shape, where only the categories were stored', () => {
    const legacy = JSON.stringify({ holidays: false, milestones: true, timeOff: true });

    expect(readCalendarLegend(storageWith(legacy), 'key')).toEqual({
      visibility: { holidays: false, milestones: true, timeOff: true },
      people: null,
    });
  });

  it('fills missing categories from the defaults and defaults people to everyone', () => {
    const stored = JSON.stringify({ visibility: { timeOff: true } });

    expect(readCalendarLegend(storageWith(stored), 'key')).toEqual({
      visibility: { holidays: true, milestones: true, timeOff: true },
      people: null,
    });
  });

  it('falls back to the defaults on corrupted JSON instead of throwing', () => {
    expect(readCalendarLegend(storageWith('{oops'), 'key')).toEqual(DEFAULT_CALENDAR_LEGEND_STATE);
  });

  it('writes a normalized value', () => {
    const setItem = vi.fn();
    writeCalendarLegend({ setItem }, 'key', {
      visibility: { holidays: true, milestones: false, timeOff: true },
      people: ['a1'],
    });

    expect(setItem).toHaveBeenCalledWith(
      'key',
      JSON.stringify({
        visibility: { holidays: true, milestones: false, timeOff: true },
        people: ['a1'],
      }),
    );
  });
});
