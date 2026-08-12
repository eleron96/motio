import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Settings open as a dialog on top of the dashboard, so the page never
 * remounts and its own catalogs stay as they were loaded. This action is what
 * closing the settings triggers: reload the catalogs and force the stats to be
 * re-fetched despite their one-minute cache.
 */

vi.mock('@/shared/lib/supabaseClient', () => ({
  supabase: { from: () => { throw new Error('not used'); }, rpc: () => { throw new Error('not used'); } },
  getSupabase: () => { throw new Error('not used'); },
}));

vi.mock('@/shared/lib/adminConfig', () => ({ getAdminUserId: async () => null }));

import { useDashboardStore } from '@/features/dashboard/store/dashboardStore';
import type { DashboardWidget } from '@/features/dashboard/types/dashboard';

const widget = (overrides: Partial<DashboardWidget>): DashboardWidget => ({
  id: 'w1',
  type: 'bar',
  title: 'Tasks',
  period: 'week',
  groupBy: 'status',
  statusFilter: 'all',
  ...overrides,
});

beforeEach(() => {
  useDashboardStore.setState({ widgets: [] });
});

describe('refreshAfterCatalogChange', () => {
  it('reloads the catalogs and re-fetches the periods the widgets actually use', async () => {
    const loadFilterOptions = vi.fn(async () => {});
    const loadStats = vi.fn(async () => {});
    useDashboardStore.setState({
      widgets: [widget({}), widget({ id: 'w2', period: 'month', type: 'line' })],
      loadFilterOptions,
      loadStats,
    } as never);

    await useDashboardStore.getState().refreshAfterCatalogChange('ws-1');

    expect(loadFilterOptions).toHaveBeenCalledWith('ws-1');
    expect(loadStats).toHaveBeenCalledTimes(2);
    // Последний аргумент — «учитывать отключённых людей»: вне группировки по
    // исполнителям это всегда так, ровно как решает сама страница дашборда.
    expect(loadStats).toHaveBeenCalledWith('ws-1', 'week', false, true);
    // Линейный виджет просит ещё и ряд по дням.
    expect(loadStats).toHaveBeenCalledWith('ws-1', 'month', true, true);
  });

  it('clears the freshness marks so the one-minute cache cannot swallow the refetch', async () => {
    useDashboardStore.setState({
      widgets: [],
      loadFilterOptions: vi.fn(async () => {}),
      loadStats: vi.fn(async () => {}),
      statsByPeriod: {
        ...useDashboardStore.getState().statsByPeriod,
        week: {
          activeOnly: { ...useDashboardStore.getState().statsByPeriod.week.activeOnly, lastLoaded: Date.now() },
          includeDisabled: { ...useDashboardStore.getState().statsByPeriod.week.includeDisabled, lastLoaded: Date.now() },
        },
      },
    } as never);

    await useDashboardStore.getState().refreshAfterCatalogChange('ws-1');

    const week = useDashboardStore.getState().statsByPeriod.week;
    expect(week.activeOnly.lastLoaded).toBeNull();
    expect(week.includeDisabled.lastLoaded).toBeNull();
  });

  it('does not ask for stats of milestone widgets — they have none', async () => {
    const loadStats = vi.fn(async () => {});
    useDashboardStore.setState({
      widgets: [widget({ type: 'milestone' }), widget({ id: 'w2', type: 'milestone_calendar' })],
      loadFilterOptions: vi.fn(async () => {}),
      loadStats,
    } as never);

    await useDashboardStore.getState().refreshAfterCatalogChange('ws-1');

    expect(loadStats).not.toHaveBeenCalled();
  });
});
