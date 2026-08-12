import { describe, expect, it } from 'vitest';
import { buildWidgetData } from '@/features/dashboard/lib/dashboardUtils';
import type {
  DashboardOption,
  DashboardStatsRow,
  DashboardStatus,
  DashboardWidget,
} from '@/features/dashboard/types/dashboard';

/**
 * The server joins the catalogs and always returns current names. The
 * dashboard's own copy of the catalogs is loaded once per workspace and is not
 * refreshed when someone renames a status in settings — so it must never
 * override the server. It only supplies decoration: the status emoji and the
 * project code.
 */

const widget: DashboardWidget = {
  id: 'w1',
  type: 'bar',
  title: 'Tasks',
  period: 'week',
  groupBy: 'status',
  statusFilter: 'all',
};

const row = (overrides: Partial<DashboardStatsRow> = {}): DashboardStatsRow => ({
  status_id: 'st-1',
  status_name: 'In review',
  assignee_id: null,
  assignee_name: null,
  project_id: null,
  project_name: null,
  group_id: null,
  task_type_id: null,
  task_type_name: null,
  total: 3,
  ...overrides,
} as DashboardStatsRow);

const staleStatus: DashboardStatus = {
  id: 'st-1',
  name: 'Review',
  emoji: '👀',
  isFinal: false,
  isCancelled: false,
  color: '#000000',
};

describe('widget legend — status names', () => {
  it('shows the renamed status from the server, not the stale local copy', () => {
    const data = buildWidgetData([row()], widget, [staleStatus]);

    expect(data.series[0].name).toBe('👀 In review');
  });

  it('still decorates it with the emoji the local catalog knows', () => {
    const data = buildWidgetData([row()], widget, [staleStatus]);

    expect(data.series[0].name.startsWith('👀')).toBe(true);
  });

  it('falls back to the local name when the server sent none', () => {
    const data = buildWidgetData([row({ status_name: '' })], widget, [staleStatus]);

    expect(data.series[0].name).toBe('👀 Review');
  });

  it('survives a status the local catalog has never heard of', () => {
    const data = buildWidgetData([row({ status_id: 'st-new', status_name: 'Blocked' })], widget, []);

    expect(data.series[0].name).toBe('Blocked');
  });
});

describe('widget legend — project names', () => {
  const projectWidget: DashboardWidget = { ...widget, groupBy: 'project' };
  const staleProject: DashboardOption = { id: 'p-1', name: 'Old site', code: 'WEB' };

  it('shows the renamed project from the server but keeps its code', () => {
    const data = buildWidgetData(
      [row({ project_id: 'p-1', project_name: 'Company website' })],
      projectWidget,
      [staleStatus],
      [staleProject],
    );

    expect(data.series[0].name).toBe('[WEB] Company website');
  });

  it('labels project-less rows without inventing a name', () => {
    const data = buildWidgetData([row()], projectWidget, [staleStatus], [staleProject]);

    expect(data.series[0].name).toBe('No project');
  });
});
