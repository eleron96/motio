import { describe, expect, it } from 'vitest';
import { format } from 'date-fns';
import { buildTaskRange, planTaskWindowLoad } from '@/features/planner/store/plannerStore.helpers';
import { getVisibleRange } from '@/features/planner/lib/dateUtils';

// Loaded around 15 March: 2025-12-15 … 2026-06-15.
const dayWindow = { ...buildTaskRange('2026-03-15', 'day'), viewMode: 'day' as const, workspaceId: 'ws-1' };
const calendarWindow = { ...buildTaskRange('2026-03-15', 'calendar'), viewMode: 'calendar' as const, workspaceId: 'ws-1' };

const request = (currentDate: string, viewMode: 'day' | 'week' | 'calendar' = 'day', workspaceId = 'ws-1') => (
  { workspaceId, currentDate, viewMode }
);

describe('planTaskWindowLoad', () => {
  it('loads everything when nothing is loaded or the workspace changed', () => {
    expect(planTaskWindowLoad(null, request('2026-03-15'))).toBe('full');
    expect(planTaskWindowLoad(dayWindow, request('2026-03-15', 'day', 'ws-2'))).toBe('full');
  });

  it('reuses the window while it covers every rendered day', () => {
    expect(planTaskWindowLoad(dayWindow, request('2026-03-15'))).toBe('reuse');
    expect(planTaskWindowLoad(dayWindow, request('2026-04-10'))).toBe('reuse');
  });

  it('shifts the window once the rendered days run past it, though the date is still inside', () => {
    // 1 May is inside the loaded window, but the timeline renders up to
    // 1 July — under the old date-only rule these days were drawn empty.
    expect(planTaskWindowLoad(dayWindow, request('2026-05-01'))).toBe('shift');
    expect(planTaskWindowLoad(dayWindow, request('2026-01-20'))).toBe('shift');
    expect(planTaskWindowLoad(dayWindow, request('2026-09-01'))).toBe('shift');
  });

  it('checks the same days the timeline renders', () => {
    const visible = getVisibleRange('2026-04-15', 'day');
    expect(format(visible.start, 'yyyy-MM-dd')).toBe('2026-02-15');
    expect(format(visible.end, 'yyyy-MM-dd')).toBe('2026-06-15');
    // The last rendered day is exactly the last loaded one: still covered.
    expect(planTaskWindowLoad(dayWindow, request('2026-04-15'))).toBe('reuse');
    expect(planTaskWindowLoad(dayWindow, request('2026-04-16'))).toBe('shift');
  });

  it('switches Day and Week without refetching at the same date', () => {
    expect(planTaskWindowLoad(dayWindow, request('2026-03-15', 'week'))).toBe('reuse');
    // A week forward keeps it; Week rounds the rendered range out to whole weeks.
    expect(planTaskWindowLoad(dayWindow, request('2026-03-22', 'week'))).toBe('reuse');
    expect(planTaskWindowLoad(dayWindow, request('2026-04-15', 'week'))).toBe('shift');
  });

  it('never mixes the calendar year with the Day/Week window, in either direction', () => {
    // A year of cached tasks would change timeline row heights in Day.
    expect(planTaskWindowLoad(calendarWindow, request('2026-09-01', 'day'))).toBe('full');
    expect(planTaskWindowLoad(dayWindow, request('2026-03-15', 'calendar'))).toBe('full');
  });

  it('keeps the date rule for the calendar year', () => {
    expect(planTaskWindowLoad(calendarWindow, request('2027-03-01', 'calendar'))).toBe('reuse');
    expect(planTaskWindowLoad(calendarWindow, request('2027-04-01', 'calendar'))).toBe('shift');
  });
});
