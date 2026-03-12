import { addDays, format, parseISO, subDays, subMonths, subWeeks } from 'date-fns';
import {
  DashboardBarPalette,
  DashboardFilterField,
  DashboardFilterGroup,
  DashboardFilterOperator,
  DashboardPeriod,
  DashboardStatus,
  DashboardSeriesRow,
  DashboardStatsRow,
  DashboardSeriesKey,
  DashboardWidget,
  DashboardWidgetData,
} from '@/features/dashboard/types/dashboard';
import { formatStatusLabel } from '@/shared/lib/statusLabels';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { DashboardOption } from '@/features/dashboard/types/dashboard';
import {
  DASHBOARD_CHECKER_COLORS,
  DASHBOARD_MONO_COLORS,
  DASHBOARD_PASTEL_DAWN_COLORS,
  DASHBOARD_PASTEL_MINT_COLORS,
  DASHBOARD_PASTEL_SKY_COLORS,
} from '@/shared/lib/colors';

export const DEFAULT_BAR_PALETTE: DashboardBarPalette = 'pastel-sky';

export const BAR_PALETTES: Record<DashboardBarPalette, { label: string; colors: string[] }> = {
  'pastel-sky': {
    label: 'Pastel sky',
    colors: [...DASHBOARD_PASTEL_SKY_COLORS],
  },
  'pastel-dawn': {
    label: 'Pastel dawn',
    colors: [...DASHBOARD_PASTEL_DAWN_COLORS],
  },
  'pastel-mint': {
    label: 'Pastel mint',
    colors: [...DASHBOARD_PASTEL_MINT_COLORS],
  },
  mono: {
    label: 'Monochrome',
    colors: [...DASHBOARD_MONO_COLORS],
  },
  checker: {
    label: 'Checkerboard',
    colors: [...DASHBOARD_CHECKER_COLORS],
  },
};

export const getBarPalette = (palette?: DashboardBarPalette) => {
  const key = palette && BAR_PALETTES[palette] ? palette : DEFAULT_BAR_PALETTE;
  return BAR_PALETTES[key].colors;
};

export const createWidgetId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `widget-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const getPeriodRange = (period: DashboardPeriod) => {
  const end = new Date();
  const start =
    period === 'day'
      ? subDays(end, 0)
      : period === 'week'
        ? subWeeks(end, 1)
        : subMonths(end, 1);
  return {
    startDate: format(start, 'yyyy-MM-dd'),
    endDate: format(end, 'yyyy-MM-dd'),
  };
};

export const isCancelledStatusName = (name: string) => {
  const value = name.trim().toLowerCase();
  return value.includes('\u043e\u0442\u043c\u0435\u043d') || value.includes('cancel');
};

const resolveIsCancelled = (status: DashboardStatus) => (
  status.isCancelled ?? isCancelledStatusName(status.name)
);

const buildStatusSets = (statuses: DashboardStatus[]) => {
  const cancelled = statuses
    .filter((status) => resolveIsCancelled(status))
    .map((status) => status.id);
  const closed = statuses
    .filter((status) => status.isFinal && !resolveIsCancelled(status))
    .map((status) => status.id);
  const active = statuses
    .filter((status) => !status.isFinal && !resolveIsCancelled(status))
    .map((status) => status.id);
  const all = statuses.map((status) => status.id);

  return {
    all: new Set(all),
    active: new Set(active),
    final: new Set(closed),
    cancelled: new Set(cancelled),
  };
};

const resolveStatusFilter = (widget: DashboardWidget, statuses: DashboardStatus[]) => {
  const sets = buildStatusSets(statuses);
  if (widget.statusFilter === 'custom') {
    const customIds = widget.statusIds ?? [];
    return customIds.length > 0 ? new Set(customIds) : sets.all;
  }
  if (widget.statusFilter === 'active') return sets.active;
  if (widget.statusFilter === 'final') return sets.final;
  if (widget.statusFilter === 'cancelled') return sets.cancelled;
  return sets.all;
};

const getFieldValue = (
  row: Pick<DashboardStatsRow, 'assignee_id' | 'project_id' | 'status_id' | 'group_id'>,
  field: DashboardFilterField,
) => {
  if (field === 'assignee') return row.assignee_id ?? null;
  if (field === 'project') return row.project_id ?? null;
  if (field === 'group') return row.group_id ?? null;
  return row.status_id;
};

const UNASSIGNED_FILTER_VALUE = '__unassigned__';
const NO_TYPE_LABEL = 'No type';

const matchesOperator = (value: string | null, operator: DashboardFilterOperator, target: string) => {
  const isMatch = target === UNASSIGNED_FILTER_VALUE ? value === null : value === target;
  return operator === 'eq' ? isMatch : !isMatch;
};

type FilterRow = Pick<DashboardStatsRow, 'assignee_id' | 'project_id' | 'status_id' | 'group_id'>;

const matchesGroup = (row: FilterRow, group: DashboardFilterGroup) => {
  const rules = group.rules.filter((rule) => rule.value);
  if (!rules.length) return true;
  const matches = rules.map((rule) => (
    matchesOperator(getFieldValue(row, rule.field), rule.operator, rule.value)
  ));
  return group.match === 'and' ? matches.every(Boolean) : matches.some(Boolean);
};

const matchesFilterGroups = (row: FilterRow, groups?: DashboardFilterGroup[]) => {
  if (!groups || groups.length === 0) return true;
  const meaningfulGroups = groups.filter((group) => group.rules.some((rule) => rule.value));
  if (!meaningfulGroups.length) return true;
  return meaningfulGroups.some((group) => matchesGroup(row, group));
};

const widgetUsesAssigneeFilters = (widget: DashboardWidget) => (
  widget.filterGroups?.some((group) => group.rules.some((rule) => (
    (rule.field === 'assignee' || rule.field === 'group') && rule.value
  )))
);

export const shouldUseAssigneeRows = (widget: DashboardWidget) => (
  widget.groupBy === 'assignee' || widgetUsesAssigneeFilters(widget)
);

const buildDateRange = (period: DashboardPeriod) => {
  const { startDate, endDate } = getPeriodRange(period);
  const dates: string[] = [];
  let cursor = parseISO(startDate);
  const end = parseISO(endDate);
  while (cursor <= end) {
    dates.push(format(cursor, 'yyyy-MM-dd'));
    cursor = addDays(cursor, 1);
  }
  return dates;
};

const toSeriesKey = (value: string) => `series_${value.replace(/[^a-z0-9]/gi, '_')}`;

export const buildWidgetData = (
  rows: DashboardStatsRow[],
  widget: DashboardWidget,
  statuses: DashboardStatus[],
  projects: DashboardOption[] = [],
): DashboardWidgetData => {
  const groupBy = widget.groupBy ?? 'none';
  const statusById = new Map(statuses.map((status) => [status.id, status]));
  const projectNameById = new Map(
    projects.map((project) => [project.id, formatProjectLabel(project.name, project.code)]),
  );
  const statusFilter = statuses.length > 0
    ? resolveStatusFilter(widget, statuses)
    : new Set(rows.map((row) => row.status_id));
  const filtered = rows.filter((row) => (
    statusFilter.has(row.status_id) && matchesFilterGroups(row, widget.filterGroups)
  ));
  const seriesMap = new Map<string, { name: string; value: number }>();

  if (groupBy === 'assignee') {
    filtered.forEach((row) => {
      if (!widget.includeUnassigned && !row.assignee_id) return;
      const key = row.assignee_id ?? 'unassigned';
      const name = row.assignee_name ?? 'Unassigned';
      const existing = seriesMap.get(key) ?? { name, value: 0 };
      existing.value += row.total;
      seriesMap.set(key, existing);
    });
  } else if (groupBy === 'status') {
    filtered.forEach((row) => {
      const key = row.status_id;
      const status = statusById.get(key);
      const name = status
        ? formatStatusLabel(status.name, status.emoji)
        : row.status_name;
      const existing = seriesMap.get(key) ?? { name, value: 0 };
      existing.value += row.total;
      seriesMap.set(key, existing);
    });
  } else if (groupBy === 'project') {
    filtered.forEach((row) => {
      const key = row.project_id ?? 'no-project';
      const name = row.project_id
        ? projectNameById.get(row.project_id) ?? row.project_name ?? 'No project'
        : 'No project';
      const existing = seriesMap.get(key) ?? { name, value: 0 };
      existing.value += row.total;
      seriesMap.set(key, existing);
    });
  } else if (groupBy === 'task_type') {
    filtered.forEach((row) => {
      const key = row.task_type_id ?? 'no-type';
      const name = row.task_type_name ?? NO_TYPE_LABEL;
      const existing = seriesMap.get(key) ?? { name, value: 0 };
      existing.value += row.total;
      seriesMap.set(key, existing);
    });
  }

  const series = Array.from(seriesMap.values()).sort((a, b) => b.value - a.value);
  const total = groupBy === 'none'
    ? filtered.reduce((sum, row) => sum + row.total, 0)
    : series.reduce((sum, item) => sum + item.value, 0);

  return { total, series };
};

export const buildTimeSeriesData = (
  rows: DashboardSeriesRow[],
  widget: DashboardWidget,
  statuses: DashboardStatus[],
  projects: DashboardOption[] = [],
): DashboardWidgetData => {
  const groupBy = widget.groupBy ?? 'none';
  const statusById = new Map(statuses.map((status) => [status.id, status]));
  const projectNameById = new Map(
    projects.map((project) => [project.id, formatProjectLabel(project.name, project.code)]),
  );
  const statusFilter = statuses.length > 0
    ? resolveStatusFilter(widget, statuses)
    : new Set(rows.map((row) => row.status_id));
  const filtered = rows.filter((row) => (
    statusFilter.has(row.status_id) && matchesFilterGroups(row, widget.filterGroups)
  ));
  const seriesKeysMap = new Map<string, DashboardSeriesKey>();
  const totalsByKey = new Map<string, number>();
  const dateMap = new Map<string, Record<string, number>>();
  let total = 0;

  const pushValue = (date: string, key: string, value: number) => {
    if (!dateMap.has(date)) dateMap.set(date, {});
    const entry = dateMap.get(date) ?? {};
    entry[key] = (entry[key] ?? 0) + value;
    dateMap.set(date, entry);
  };

  filtered.forEach((row) => {
    if (groupBy === 'assignee' && !widget.includeUnassigned && !row.assignee_id) return;
    let rawKey = 'total';
    let label = 'Total';
    if (groupBy === 'assignee') {
      rawKey = row.assignee_id ?? 'unassigned';
      label = row.assignee_name ?? 'Unassigned';
    } else if (groupBy === 'status') {
      rawKey = row.status_id;
      const status = statusById.get(row.status_id);
      label = status
        ? formatStatusLabel(status.name, status.emoji)
        : row.status_name;
    } else if (groupBy === 'project') {
      rawKey = row.project_id ?? 'no-project';
      label = row.project_id
        ? projectNameById.get(row.project_id) ?? row.project_name ?? 'No project'
        : 'No project';
    } else if (groupBy === 'task_type') {
      rawKey = row.task_type_id ?? 'no-type';
      label = row.task_type_name ?? NO_TYPE_LABEL;
    }
    const seriesKey = toSeriesKey(rawKey);
    if (!seriesKeysMap.has(seriesKey)) {
      seriesKeysMap.set(seriesKey, { key: seriesKey, label });
    }
    totalsByKey.set(seriesKey, (totalsByKey.get(seriesKey) ?? 0) + row.total);
    pushValue(row.bucket_date, seriesKey, row.total);
    total += row.total;
  });

  const seriesKeys = Array.from(seriesKeysMap.values())
    .map((item) => ({ ...item, total: totalsByKey.get(item.key) ?? 0 }))
    .sort((a, b) => b.total - a.total);

  const dates = buildDateRange(widget.period);
  const timeSeries = dates.map((date) => {
    const point: Record<string, number | string> = { date };
    seriesKeys.forEach((seriesKey) => {
      point[seriesKey.key] = dateMap.get(date)?.[seriesKey.key] ?? 0;
    });
    return point as { date: string };
  });

  const series = seriesKeys.map((item) => ({
    name: item.label,
    value: item.total,
  }));

  return { total, series, timeSeries, seriesKeys: seriesKeys.map(({ total: _total, ...rest }) => rest) };
};
