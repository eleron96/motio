import { describe, expect, it } from 'vitest';
import { buildTimeSeriesData, buildWidgetData } from '@/features/dashboard/lib/dashboardUtils';
import type {
  DashboardSeriesRow,
  DashboardStatsRow,
  DashboardStatus,
  DashboardWidget,
} from '@/features/dashboard/types/dashboard';

// groupId is what lets a chart paint a person in their own colour: the series
// label is not enough, two teammates can share a name.

const statuses: DashboardStatus[] = [
  { id: 'status-1', name: 'To do', emoji: null, isFinal: false, isCancelled: false, color: '#94a3b8' },
];

const statsRow = (over: Partial<DashboardStatsRow> = {}): DashboardStatsRow => ({
  assignee_id: 'assignee-1',
  assignee_name: 'Emma',
  project_id: 'project-1',
  project_name: 'Alpha',
  task_type_id: 'type-1',
  task_type_name: 'Task',
  status_id: 'status-1',
  status_name: 'To do',
  status_is_final: false,
  total: 3,
  ...over,
});

const seriesRow = (over: Partial<DashboardSeriesRow> = {}): DashboardSeriesRow => ({
  bucket_date: '2026-07-30',
  ...statsRow(),
  ...over,
});

const widget = (over: Partial<DashboardWidget> = {}): DashboardWidget => ({
  id: 'widget-1',
  type: 'bar',
  title: 'By person',
  period: 'day',
  statusFilter: 'all',
  groupBy: 'assignee',
  includeUnassigned: true,
  ...over,
} as DashboardWidget);

describe('buildWidgetData groupId', () => {
  it('carries the assignee id out with each series', () => {
    const data = buildWidgetData(
      [statsRow(), statsRow({ assignee_id: 'assignee-2', assignee_name: 'Ben', total: 1 })],
      widget(),
      statuses,
    );

    expect(data.series.map((item) => [item.name, item.groupId])).toEqual([
      ['Emma', 'assignee-1'],
      ['Ben', 'assignee-2'],
    ]);
  });

  it('distinguishes two people who share a name', () => {
    const data = buildWidgetData(
      [
        statsRow({ assignee_id: 'assignee-1', assignee_name: 'Alex', total: 5 }),
        statsRow({ assignee_id: 'assignee-2', assignee_name: 'Alex', total: 2 }),
      ],
      widget(),
      statuses,
    );

    expect(data.series.map((item) => item.groupId)).toEqual(['assignee-1', 'assignee-2']);
  });

  it('marks tasks with nobody assigned so the sentinel is colourable too', () => {
    const data = buildWidgetData(
      [statsRow({ assignee_id: null, assignee_name: null })],
      widget(),
      statuses,
    );

    expect(data.series[0].groupId).toBe('unassigned');
  });

  it('uses the entity id for the other groupings as well', () => {
    const byProject = buildWidgetData([statsRow()], widget({ groupBy: 'project' }), statuses);
    const byStatus = buildWidgetData([statsRow()], widget({ groupBy: 'status' }), statuses);
    const byType = buildWidgetData([statsRow()], widget({ groupBy: 'task_type' }), statuses);

    expect(byProject.series[0].groupId).toBe('project-1');
    expect(byStatus.series[0].groupId).toBe('status-1');
    expect(byType.series[0].groupId).toBe('type-1');
  });
});

describe('buildTimeSeriesData groupId', () => {
  it('keeps the id next to the sanitized series key', () => {
    const data = buildTimeSeriesData([seriesRow()], widget({ type: 'line' }), statuses);

    // The key has every non-alphanumeric character flattened, which is exactly
    // why the raw id has to travel alongside it.
    expect(data.seriesKeys?.[0].key).toBe('series_assignee_1');
    expect(data.seriesKeys?.[0].groupId).toBe('assignee-1');
    expect(data.series[0].groupId).toBe('assignee-1');
  });

  it('survives a uuid-shaped id without losing it', () => {
    const uuid = '22222222-0000-0000-0000-000000000001';
    const data = buildTimeSeriesData(
      [seriesRow({ assignee_id: uuid })],
      widget({ type: 'line' }),
      statuses,
    );

    expect(data.seriesKeys?.[0].groupId).toBe(uuid);
  });
});
