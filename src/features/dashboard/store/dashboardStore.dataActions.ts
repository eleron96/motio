import { supabase } from '@/shared/lib/supabaseClient';
import { getAdminUserId } from '@/shared/lib/adminConfig';
import { getStatusEmoji, splitStatusLabel } from '@/shared/lib/statusLabels';
import {
  DashboardPeriod,
  DashboardSeriesRow,
  DashboardStatsRow,
  DashboardTimeOff,
} from '@/features/dashboard/types/dashboard';
import { resolveDashboardIncludeDisabledAssignees } from '@/features/dashboard/lib/dashboardAssigneeOptions';
import { getPeriodRange } from '@/features/dashboard/lib/dashboardUtils';
import type { WorkloadDay } from '@/features/dashboard/lib/workloadHeatmap';
import {
  type DashboardGetState,
  type DashboardSetState,
  type DashboardState,
  type DashboardStatsVariants,
  getStatsVariantKey,
  STATS_CACHE_TTL_MS,
} from '@/features/dashboard/store/dashboardStore.contract';

// What the dashboard reads to draw itself: catalogs for the filters, milestones,
// the workload heatmap with its absences, and the task statistics per period.
type DataActions = Pick<
  DashboardState,
  | 'loadFilterOptions'
  | 'loadMilestones'
  | 'loadHeatmap'
  | 'loadTimeOff'
  | 'setHeatmapAutoCapacity'
  | 'refreshAfterCatalogChange'
  | 'loadStats'
>;

export const createDashboardDataActions = (
  set: DashboardSetState,
  get: DashboardGetState,
): DataActions => ({
  loadFilterOptions: async (workspaceId) => {
    const [statusesRes, projectsRes, assigneesRes, groupsRes, membersRes] = await Promise.all([
      supabase
        .from('statuses')
        .select('id, name, emoji, color, is_final, is_cancelled')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: true }),
      supabase
        .from('projects')
        .select('id, name, code, color')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: true }),
      supabase
        .from('assignees')
        .select('id, name, user_id, is_active, color')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: true }),
      supabase
        .from('member_groups')
        .select('id, name')
        .eq('workspace_id', workspaceId)
        .order('name', { ascending: true }),
      supabase
        .from('workspace_members')
        .select('user_id, group_id')
        .eq('workspace_id', workspaceId),
    ]);

    if (statusesRes.error || projectsRes.error || assigneesRes.error || groupsRes.error || membersRes.error) {
      set({
        error: statusesRes.error?.message
          || projectsRes.error?.message
          || assigneesRes.error?.message
          || groupsRes.error?.message
          || membersRes.error?.message
          || 'Failed to load filter options.',
      });
      return;
    }

    const adminUserId = await getAdminUserId();
    const statuses = (statusesRes.data ?? []).map((row) => {
      const { name: cleanedName, emoji: inlineEmoji } = splitStatusLabel(row.name as string);
      const hasEmojiField = Object.prototype.hasOwnProperty.call(row, 'emoji');
      const explicitEmoji = typeof row.emoji === 'string' ? row.emoji.trim() : row.emoji;
      const resolvedEmoji = hasEmojiField
        ? (explicitEmoji || null)
        : (inlineEmoji ?? getStatusEmoji(cleanedName));
      const isCancelled = Boolean(row.is_cancelled);
      return {
        id: row.id as string,
        name: cleanedName,
        emoji: resolvedEmoji ?? null,
        color: row.color as string,
        isFinal: Boolean(row.is_final) && !isCancelled,
        isCancelled,
      };
    });
    const projects = (projectsRes.data ?? []).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      code: (row as { code?: string | null }).code ?? null,
      color: row.color ?? undefined,
    }));
    const assignees = (assigneesRes.data ?? [])
      .filter((row) => (adminUserId ? row.user_id !== adminUserId : true))
      .map((row) => ({
        id: row.id as string,
        name: row.name as string,
        isActive: row.is_active ?? true,
        color: (row as { color?: string | null }).color ?? undefined,
      }));

    const groups = (groupsRes.data ?? []).map((row) => ({
      id: row.id as string,
      name: row.name as string,
    }));

    const groupByUserId = new Map(
      (membersRes.data ?? []).map((row) => [row.user_id as string, row.group_id as string | null]),
    );
    const assigneeGroupMap = (assigneesRes.data ?? []).reduce<Record<string, string | null>>((acc, row) => {
      const groupId = row.user_id ? groupByUserId.get(row.user_id as string) ?? null : null;
      acc[row.id as string] = groupId;
      return acc;
    }, {});

    set({ statuses, projects, assignees, groups, assigneeGroupMap });
  },
  loadMilestones: async (workspaceId) => {
    const { data, error } = await supabase
      .from('milestones')
      .select('id, title, project_id, date, include_in_workload')
      .eq('workspace_id', workspaceId)
      .order('date', { ascending: true });

    if (error) {
      set({ error: error.message });
      return;
    }

    const milestones = (data ?? []).map((row) => ({
      id: row.id as string,
      title: row.title as string,
      projectId: row.project_id as string,
      date: row.date as string,
      includeInWorkload: (row.include_in_workload as boolean | null) ?? true,
    }));

    set({ milestones });
  },
  loadHeatmap: async (workspaceId, startDate, endDate) => {
    const rangeKey = `${workspaceId}:${startDate}:${endDate}`;
    const current = get().heatmap;
    if (current.loading) return;
    if (current.rangeKey === rangeKey && current.error === null && current.days.length > 0) return;

    set({ heatmap: { ...current, loading: true, error: null, rangeKey } });

    const { data, error } = await supabase.rpc('workspace_workload_heatmap', {
      p_workspace_id: workspaceId,
      p_start_date: startDate,
      p_end_date: endDate,
    });

    if (get().heatmap.rangeKey !== rangeKey) return;

    if (error) {
      set({ heatmap: { days: [], rangeKey, loading: false, error: error.message } });
      return;
    }

    const days: WorkloadDay[] = ((data ?? []) as Array<{ bucket_date: string; task_count: number }>)
      .map((row) => ({ date: row.bucket_date, taskCount: Number(row.task_count) || 0 }));

    set({ heatmap: { days, rangeKey, loading: false, error: null } });
  },
  loadTimeOff: async (workspaceId, startDate, endDate) => {
    // Absences are only ever read here to shrink the heatmap denominator.
    const rangeKey = `${workspaceId}:${startDate}:${endDate}`;
    const current = get().timeOff;
    if (current.loading) return;
    if (current.rangeKey === rangeKey && current.error === null) return;

    set({ timeOff: { ...current, loading: true, error: null, rangeKey } });

    // Windowed like the timeline query (plannerStore.workspaceActions): a record
    // that merely overlaps the window comes back whole and is clipped client-side.
    const { data, error } = await supabase
      .from('time_off')
      .select('id, assignee_id, start_date, end_date')
      .eq('workspace_id', workspaceId)
      .gte('end_date', startDate)
      .lte('start_date', endDate);

    if (get().timeOff.rangeKey !== rangeKey) return;

    if (error) {
      // A failed absence load must not blank out the board: the heat still means
      // something without it, so keep the error and fall back to no absences.
      set({ timeOff: { records: [], rangeKey, loading: false, error: error.message } });
      return;
    }

    const records: DashboardTimeOff[] = ((data ?? []) as Array<{
      id: string;
      assignee_id: string;
      start_date: string;
      end_date: string;
    }>).map((row) => ({
      id: row.id,
      assigneeId: row.assignee_id,
      startDate: row.start_date,
      endDate: row.end_date,
    }));

    set({ timeOff: { records, rangeKey, loading: false, error: null } });
  },
  setHeatmapAutoCapacity: (value) => {
    if (get().heatmapAutoCapacity === value) return;
    set({ heatmapAutoCapacity: value });
  },
  refreshAfterCatalogChange: async (workspaceId) => {
    // Обнуляем отметки свежести: иначе loadStats увидит «данные моложе минуты»
    // и молча выйдет, оставив на экране прежние подписи.
    set((state) => {
      const stale = (variants: DashboardStatsVariants): DashboardStatsVariants => ({
        activeOnly: { ...variants.activeOnly, lastLoaded: null },
        includeDisabled: { ...variants.includeDisabled, lastLoaded: null },
      });
      const statsByPeriod = { ...state.statsByPeriod };
      (Object.keys(statsByPeriod) as Array<keyof typeof statsByPeriod>).forEach((period) => {
        statsByPeriod[period] = stale(statsByPeriod[period]);
      });
      return { statsByPeriod };
    });

    await get().loadFilterOptions(workspaceId);

    // Перезапрашиваем ровно те срезы, которые нужны текущим виджетам.
    const widgets = get().widgets;
    const wanted = new Map<string, { period: DashboardPeriod; series: boolean; disabled: boolean }>();
    widgets.forEach((widget) => {
      if (widget.type === 'milestone' || widget.type === 'milestone_calendar') return;
      const disabled = resolveDashboardIncludeDisabledAssignees(widget);
      const series = widget.type === 'line' || widget.type === 'area';
      const key = `${widget.period}:${disabled}`;
      const existing = wanted.get(key);
      wanted.set(key, {
        period: widget.period,
        disabled,
        series: series || Boolean(existing?.series),
      });
    });

    await Promise.all(
      Array.from(wanted.values()).map((item) => (
        get().loadStats(workspaceId, item.period, item.series, item.disabled)
      )),
    );
  },

  loadStats: async (workspaceId, period, includeSeries = false, includeDisabledAssignees = false) => {
    const variantKey = getStatsVariantKey(includeDisabledAssignees);
    const current = get().statsByPeriod[period][variantKey];
    const now = Date.now();
    const hasFreshData = Boolean(current.lastLoaded) && now - (current.lastLoaded ?? 0) < STATS_CACHE_TTL_MS;
    const hasSeriesData = current.seriesRows.length > 0 || current.seriesRowsBase.length > 0;
    if (current.loading) return;
    if (hasFreshData && (!includeSeries || hasSeriesData)) return;
    set((state) => ({
      statsByPeriod: {
        ...state.statsByPeriod,
        [period]: {
          ...state.statsByPeriod[period],
          [variantKey]: {
            ...state.statsByPeriod[period][variantKey],
            loading: true,
            error: null,
          },
        },
      },
    }));
    const { startDate, endDate } = getPeriodRange(period);
    const [aggregateRes, aggregateBaseRes, seriesRes, seriesBaseRes] = await Promise.all([
      supabase
        .rpc('dashboard_task_counts', {
          p_workspace_id: workspaceId,
          p_start_date: startDate,
          p_end_date: endDate,
          p_include_disabled_assignees: includeDisabledAssignees,
        }),
      supabase
        .rpc('dashboard_task_counts_base', {
          p_workspace_id: workspaceId,
          p_start_date: startDate,
          p_end_date: endDate,
          p_include_disabled_assignees: includeDisabledAssignees,
        }),
      includeSeries
        ? supabase.rpc('dashboard_task_time_series', {
          p_workspace_id: workspaceId,
          p_start_date: startDate,
          p_end_date: endDate,
          p_include_disabled_assignees: includeDisabledAssignees,
        })
        : Promise.resolve({ data: [], error: null }),
      includeSeries
        ? supabase.rpc('dashboard_task_time_series_base', {
          p_workspace_id: workspaceId,
          p_start_date: startDate,
          p_end_date: endDate,
          p_include_disabled_assignees: includeDisabledAssignees,
        })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (aggregateRes.error || aggregateBaseRes.error || seriesRes.error || seriesBaseRes.error) {
      set((state) => ({
        statsByPeriod: {
          ...state.statsByPeriod,
          [period]: {
            ...state.statsByPeriod[period],
            [variantKey]: {
              ...state.statsByPeriod[period][variantKey],
              loading: false,
              error: aggregateRes.error?.message
                || aggregateBaseRes.error?.message
                || seriesRes.error?.message
                || seriesBaseRes.error?.message
                || 'Failed to load stats.',
            },
          },
        },
      }));
      return;
    }
    const rows = (aggregateRes.data ?? []).map((row: DashboardStatsRow & { total: number | string }) => ({
      ...row,
      total: Number(row.total),
    }));
    const rowsBase = (aggregateBaseRes.data ?? []).map((row: DashboardStatsRow & { total: number | string }) => ({
      ...row,
      total: Number(row.total),
    }));
    const seriesRows = (seriesRes.data ?? []).map((row: DashboardSeriesRow & { total: number | string }) => ({
      ...row,
      total: Number(row.total),
    }));
    const seriesRowsBase = (seriesBaseRes.data ?? []).map((row: DashboardSeriesRow & { total: number | string }) => ({
      ...row,
      total: Number(row.total),
    }));
    set((state) => ({
      statsByPeriod: {
        ...state.statsByPeriod,
        [period]: {
          ...state.statsByPeriod[period],
          [variantKey]: {
            rows,
            rowsBase,
            seriesRows,
            seriesRowsBase,
            loading: false,
            error: null,
            lastLoaded: Date.now(),
          },
        },
      },
    }));
  },
});
