import { describe, expect, it } from 'vitest';
import { eachDayOfInterval, parseISO } from 'date-fns';
import {
  clampTaskDates,
  getMinEndDate,
  getTaskPosition,
} from '@/features/planner/lib/dateUtils';

describe('task date rule: end >= start (driven by the start the user set)', () => {
  describe('getMinEndDate', () => {
    it('is the start date itself — past starts are fully allowed', () => {
      expect(getMinEndDate('2020-01-01')).toBe('2020-01-01');
      expect(getMinEndDate('2030-12-31')).toBe('2030-12-31');
    });
  });

  describe('clampTaskDates', () => {
    it('pushes an inverted end up to the start', () => {
      // The reported bug: start 17th, end 16th.
      expect(clampTaskDates('2026-06-17', '2026-06-16')).toEqual({
        startDate: '2026-06-17',
        endDate: '2026-06-17',
      });
    });

    it('leaves a valid range untouched — including ranges fully in the past', () => {
      expect(clampTaskDates('2020-03-01', '2020-03-10')).toEqual({
        startDate: '2020-03-01',
        endDate: '2020-03-10',
      });
    });

    it('allows a single-day task (end equals start)', () => {
      expect(clampTaskDates('2026-06-10', '2026-06-10')).toEqual({
        startDate: '2026-06-10',
        endDate: '2026-06-10',
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
