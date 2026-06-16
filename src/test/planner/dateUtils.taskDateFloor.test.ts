import { describe, expect, it } from 'vitest';
import { eachDayOfInterval, parseISO } from 'date-fns';
import {
  clampTaskDates,
  getMinEndDate,
  getTaskPosition,
  shiftDatesToMinEnd,
} from '@/features/planner/lib/dateUtils';

const TODAY = '2026-06-16';

describe('task date floor: end >= max(today, start)', () => {
  describe('getMinEndDate', () => {
    it('floors at today when the start is in the past', () => {
      expect(getMinEndDate('2026-06-10', TODAY)).toBe(TODAY);
    });

    it('floors at the start when the start is after today', () => {
      expect(getMinEndDate('2026-06-20', TODAY)).toBe('2026-06-20');
    });
  });

  describe('clampTaskDates (forms + resize)', () => {
    it('pushes an end that is before today up to today', () => {
      expect(clampTaskDates('2026-06-10', '2026-06-12', TODAY)).toEqual({
        startDate: '2026-06-10',
        endDate: TODAY,
      });
    });

    it('pushes an inverted end (before start) up to the start', () => {
      // The exact bug from the report: start 17th, end 16th.
      expect(clampTaskDates('2026-06-17', '2026-06-16', TODAY)).toEqual({
        startDate: '2026-06-17',
        endDate: '2026-06-17',
      });
    });

    it('leaves a valid future range untouched', () => {
      expect(clampTaskDates('2026-06-20', '2026-06-25', TODAY)).toEqual({
        startDate: '2026-06-20',
        endDate: '2026-06-25',
      });
    });
  });

  describe('shiftDatesToMinEnd (whole-bar move)', () => {
    it('shifts a past range forward so it ends today, preserving its length', () => {
      // 4-day task dragged fully into the past.
      expect(shiftDatesToMinEnd('2026-06-01', '2026-06-04', TODAY)).toEqual({
        startDate: '2026-06-13', // today - 3 days → 4-day span kept
        endDate: TODAY,
      });
    });

    it('leaves a range that already ends today or later untouched', () => {
      expect(shiftDatesToMinEnd('2026-06-16', '2026-06-20', TODAY)).toEqual({
        startDate: '2026-06-16',
        endDate: '2026-06-20',
      });
    });
  });

  describe('getTaskPosition defensive width', () => {
    const visibleDays = eachDayOfInterval({
      start: parseISO('2026-06-10'),
      end: parseISO('2026-06-25'),
    });

    it('never renders a zero/negative width for an inverted range', () => {
      const position = getTaskPosition('2026-06-17', '2026-06-16', visibleDays, 120);
      expect(position).not.toBeNull();
      // Pre-fix this was 0 * 120 - 4 = -4 (collapsed bar overlapping neighbours).
      expect(position!.width).toBeGreaterThan(0);
    });
  });
});
