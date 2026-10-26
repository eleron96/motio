import { describe, expect, it } from 'vitest';
import { buildTaskRange, shouldReuseLoadedWindow } from '@/features/planner/store/plannerStore.helpers';

const dayWindow = { ...buildTaskRange('2026-03-15', 'day'), viewMode: 'day' as const, workspaceId: 'ws-1' };
const calendarWindow = { ...buildTaskRange('2026-03-15', 'calendar'), viewMode: 'calendar' as const, workspaceId: 'ws-1' };

describe('shouldReuseLoadedWindow', () => {
  it('reloads when nothing is loaded or the workspace changed', () => {
    expect(shouldReuseLoadedWindow(null, { workspaceId: 'ws-1', currentDate: '2026-03-15', viewMode: 'day' })).toBe(false);
    expect(shouldReuseLoadedWindow(dayWindow, { workspaceId: 'ws-2', currentDate: '2026-03-15', viewMode: 'day' })).toBe(false);
  });

  it('keeps the historical rule for the same mode: reuse while the date stays inside', () => {
    expect(shouldReuseLoadedWindow(dayWindow, { workspaceId: 'ws-1', currentDate: '2026-05-01', viewMode: 'day' })).toBe(true);
    expect(shouldReuseLoadedWindow(dayWindow, { workspaceId: 'ws-1', currentDate: '2026-07-01', viewMode: 'day' })).toBe(false);
  });

  it('switches Day and Week without refetching at the same date', () => {
    expect(shouldReuseLoadedWindow(dayWindow, { workspaceId: 'ws-1', currentDate: '2026-03-15', viewMode: 'week' })).toBe(true);
  });

  it('refetches Day to Week once the date moved and the week window is no longer covered', () => {
    expect(shouldReuseLoadedWindow(dayWindow, { workspaceId: 'ws-1', currentDate: '2026-04-15', viewMode: 'week' })).toBe(false);
  });

  it('reuses the wide calendar window for Day, but not the other way round', () => {
    expect(shouldReuseLoadedWindow(calendarWindow, { workspaceId: 'ws-1', currentDate: '2026-09-01', viewMode: 'day' })).toBe(true);
    expect(shouldReuseLoadedWindow(dayWindow, { workspaceId: 'ws-1', currentDate: '2026-03-15', viewMode: 'calendar' })).toBe(false);
  });
});
