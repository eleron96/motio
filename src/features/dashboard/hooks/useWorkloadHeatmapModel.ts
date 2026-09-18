import { useCallback, useEffect, useMemo } from 'react';
import {
  addDays,
  addWeeks,
  eachMonthOfInterval,
  endOfWeek,
  format,
  getYear,
  isWeekend,
  startOfMonth,
  startOfWeek,
  subWeeks,
} from 'date-fns';
import { t } from '@lingui/macro';
import { useNavigate } from 'react-router-dom';
import { useLocaleStore } from '@/shared/store/localeStore';
import { formatWeekdayLabel, resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';
import { useHolidayMap, normalizeHolidayCountryCode } from '@/features/planner/hooks/useHolidayMap';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useDashboardStore } from '@/features/dashboard/store/dashboardStore';
import type { DashboardMilestone } from '@/features/dashboard/types/dashboard';
import {
  autoCapacityPerPerson,
  availableHeadcount,
  awayCountByDate,
  dayPercent,
  historyLoadPerPerson,
  levelForPercent,
  milestoneKernelSum,
  parseIsoDate,
  resolveCapacity,
  workloadMilestones,
  type HeatmapLevel,
} from '@/features/dashboard/lib/workloadHeatmap';

// Fixed, non-configurable window: ~3 months of context before today, ~6 months
// ahead. The desktop strip opens with the current month flush to the left, the
// phone list with it at the top.
export const WEEKS_BEFORE = 13;
export const WEEKS_AFTER = 26;

export type DateFnsLocale = ReturnType<typeof resolveDateFnsLocale>;

export type HeatmapDayCell = {
  date: Date;
  iso: string;
  dayNumber: string;
  inRange: boolean;
  isToday: boolean;
  isWeekend: boolean;
  holidayNames: string[] | null;
  level: HeatmapLevel;
  percent: number;
  taskCount: number;
  /** Active people away that day, and the whole team for the "N of M" reading. */
  awayCount: number;
  headcount: number;
  /** Nobody left to work: the day is shown as non-working, not as an overload. */
  isTeamAway: boolean;
  milestones: DashboardMilestone[];
};

/**
 * Everything the workload board knows, independent of how it is drawn.
 *
 * The desktop strip and the phone list show the same window, the same colours
 * and the same day reading; only the layout differs. Keeping the data, the
 * capacity calibration and the day math here means a phone can never disagree
 * with a laptop about how hot a day is.
 */
export const useWorkloadHeatmapModel = () => {
  const currentWorkspaceId = useAuthStore((state) => state.currentWorkspaceId);
  const workspaces = useAuthStore((state) => state.workspaces);
  const heatmap = useDashboardStore((state) => state.heatmap);
  const loadHeatmap = useDashboardStore((state) => state.loadHeatmap);
  const timeOff = useDashboardStore((state) => state.timeOff);
  const loadTimeOff = useDashboardStore((state) => state.loadTimeOff);
  const setHeatmapAutoCapacity = useDashboardStore((state) => state.setHeatmapAutoCapacity);
  const milestones = useDashboardStore((state) => state.milestones);
  const assignees = useDashboardStore((state) => state.assignees);
  const projects = useDashboardStore((state) => state.projects);
  const locale = useLocaleStore((state) => state.locale);
  const navigate = useNavigate();
  const requestScrollToDate = usePlannerStore((state) => state.requestScrollToDate);
  const setPlannerCurrentDate = usePlannerStore((state) => state.setCurrentDate);
  const setTimelineAttentionDate = usePlannerStore((state) => state.setTimelineAttentionDate);

  // Open a specific day on the timeline: re-anchor the visible range to it, queue
  // a scroll, flash the date column (timeline-date-attention pulse), then navigate.
  const openDay = useCallback((iso: string) => {
    setPlannerCurrentDate(iso);
    setTimelineAttentionDate(iso);
    requestScrollToDate(iso);
    navigate('/app');
  }, [navigate, requestScrollToDate, setPlannerCurrentDate, setTimelineAttentionDate]);

  // Open a specific milestone in the projects "milestones" submenu.
  const openMilestone = useCallback((milestoneId: string) => {
    navigate(`/app/projects?milestone=${encodeURIComponent(milestoneId)}`);
  }, [navigate]);

  const now = useMemo(() => new Date(), []);
  const rangeStart = useMemo(
    () => startOfWeek(subWeeks(now, WEEKS_BEFORE), { weekStartsOn: 1 }),
    [now],
  );
  const rangeEnd = useMemo(
    () => endOfWeek(addWeeks(now, WEEKS_AFTER), { weekStartsOn: 1 }),
    [now],
  );
  const startIso = format(rangeStart, 'yyyy-MM-dd');
  const endIso = format(rangeEnd, 'yyyy-MM-dd');
  const todayIso = format(now, 'yyyy-MM-dd');
  const todayMonthKey = format(startOfMonth(now), 'yyyy-MM');

  useEffect(() => {
    if (!currentWorkspaceId) return;
    void loadHeatmap(currentWorkspaceId, startIso, endIso);
    void loadTimeOff(currentWorkspaceId, startIso, endIso);
  }, [currentWorkspaceId, startIso, endIso, loadHeatmap, loadTimeOff]);

  const retry = useCallback(() => {
    if (!currentWorkspaceId) return;
    void loadHeatmap(currentWorkspaceId, startIso, endIso);
  }, [currentWorkspaceId, loadHeatmap, startIso, endIso]);

  const dateLocale = useMemo(() => resolveDateFnsLocale(locale), [locale]);
  const workspace = useMemo(
    () => workspaces.find((item) => item.id === currentWorkspaceId) ?? null,
    [workspaces, currentWorkspaceId],
  );
  const activeAssigneeIds = useMemo(
    () => new Set(assignees.filter((a) => a.isActive).map((a) => a.id)),
    [assignees],
  );
  const headcount = activeAssigneeIds.size;
  const showHeat = headcount > 0;

  // People away per day. Absences of disabled assignees are ignored — they are not
  // in the headcount either, so counting them would shrink the denominator twice.
  const awayByDate = useMemo(
    () => awayCountByDate(timeOff.records, activeAssigneeIds, { startIso, endIso }),
    [timeOff.records, activeAssigneeIds, startIso, endIso],
  );

  const holidayCountryCode = useMemo(
    () => normalizeHolidayCountryCode(workspace?.holidayCountry),
    [workspace],
  );
  const fallbackHolidayLabel = t`Non-working day`;
  const holidayLabel = t`Holiday`;
  const holidayYears = useMemo(() => {
    const years: number[] = [];
    for (let year = getYear(rangeStart); year <= getYear(rangeEnd); year += 1) {
      years.push(year);
    }
    return years;
  }, [rangeStart, rangeEnd]);
  const { holidayMap } = useHolidayMap({
    years: holidayYears,
    holidayCountryCode,
    fallbackHolidayLabel,
    holidayLabel,
  });

  const countsByDate = useMemo(() => {
    const map = new Map<string, number>();
    heatmap.days.forEach((day) => map.set(day.date, day.taskCount));
    return map;
  }, [heatmap.days]);

  const milestonesByDate = useMemo(() => {
    const map = new Map<string, DashboardMilestone[]>();
    milestones.forEach((milestone) => {
      const list = map.get(milestone.date) ?? [];
      list.push(milestone);
      map.set(milestone.date, list);
    });
    return map;
  }, [milestones]);

  // Only milestones flagged as load-bearing feed the heat math; the rest still
  // render as chips (via milestonesByDate) — they exist, they just don't pin a crew.
  const loadBearingMilestones = useMemo(() => workloadMilestones(milestones), [milestones]);

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    projects.forEach((project) => map.set(project.id, project.name));
    return map;
  }, [projects]);

  // Capacity: owner override → auto from this team's recent history → default.
  const historyLoads = useMemo(() => {
    const loads: number[] = [];
    heatmap.days.forEach((day) => {
      if (day.date >= todayIso) return;
      if (isWeekend(parseIsoDate(day.date)) || holidayMap[day.date]) return;
      // Past days count against who actually worked them, so a stretch of holidays
      // doesn't drag the team's "normal day" down and make every other day look hot.
      const load = historyLoadPerPerson(
        day.taskCount,
        availableHeadcount(headcount, awayByDate.get(day.date) ?? 0),
      );
      if (load !== null) loads.push(load);
    });
    return loads;
  }, [heatmap.days, todayIso, holidayMap, headcount, awayByDate]);
  const autoCapacity = useMemo(() => autoCapacityPerPerson(historyLoads), [historyLoads]);
  useEffect(() => {
    setHeatmapAutoCapacity(autoCapacity);
  }, [autoCapacity, setHeatmapAutoCapacity]);
  const capacityOverride = workspace?.heatmapCapacityPerPerson ?? null;
  const capacity = useMemo(
    () => resolveCapacity(capacityOverride, autoCapacity),
    [capacityOverride, autoCapacity],
  );
  const capacityDisplay = Math.round(capacity * 10) / 10;

  const months = useMemo(
    () => eachMonthOfInterval({ start: rangeStart, end: rangeEnd }),
    [rangeStart, rangeEnd],
  );

  const weekdayLabels = useMemo(
    () => Array.from({ length: 7 }, (_, index) => formatWeekdayLabel(
      addDays(rangeStart, index),
      locale,
      { style: 'short', dateLocale },
    )),
    [rangeStart, locale, dateLocale],
  );

  const buildDay = useCallback((date: Date): HeatmapDayCell => {
    const iso = format(date, 'yyyy-MM-dd');
    const inRange = iso >= startIso && iso <= endIso;
    const taskCount = countsByDate.get(iso) ?? 0;
    const weekend = isWeekend(date);
    const holidayNames = holidayMap[iso] ?? null;
    const awayCount = awayByDate.get(iso) ?? 0;
    const available = availableHeadcount(headcount, awayCount);
    // Nobody available is not a hot day, it's a day the team doesn't work: colouring
    // it bordeaux would confuse "no one to do it" with "too much to do".
    const isTeamAway = showHeat && available === 0;
    const isWorkday = !weekend && !holidayNames && !isTeamAway;
    const percent = showHeat && !isTeamAway
      ? dayPercent(taskCount, available, capacity, milestoneKernelSum(iso, loadBearingMilestones))
      : 0;
    return {
      date,
      iso,
      dayNumber: format(date, 'd'),
      inRange,
      isToday: iso === todayIso,
      isWeekend: weekend,
      holidayNames,
      level: showHeat && isWorkday ? levelForPercent(percent) : 0,
      percent,
      taskCount,
      awayCount,
      headcount,
      isTeamAway,
      milestones: milestonesByDate.get(iso) ?? [],
    };
  }, [
    startIso,
    endIso,
    countsByDate,
    holidayMap,
    awayByDate,
    headcount,
    showHeat,
    capacity,
    loadBearingMilestones,
    todayIso,
    milestonesByDate,
  ]);

  return {
    heatmap,
    retry,
    showHeat,
    capacityDisplay,
    capacityOverride,
    autoCapacity,
    months,
    weekdayLabels,
    todayMonthKey,
    todayIso,
    dateLocale,
    projectNameById,
    buildDay,
    openDay,
    openMilestone,
  };
};
