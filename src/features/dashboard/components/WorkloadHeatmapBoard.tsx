import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addDays,
  addWeeks,
  eachDayOfInterval,
  eachMonthOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getDay,
  getYear,
  isWeekend,
  startOfMonth,
  startOfWeek,
  subWeeks,
} from 'date-fns';
import { t, Trans } from '@lingui/macro';
import { useNavigate } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { cn } from '@/shared/lib/classNames';
import { useLocaleStore } from '@/shared/store/localeStore';
import { formatWeekdayLabel, resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';
import { useHolidayMap, normalizeHolidayCountryCode } from '@/features/planner/hooks/useHolidayMap';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useDashboardStore } from '@/features/dashboard/store/dashboardStore';
import type { DashboardMilestone } from '@/features/dashboard/types/dashboard';
import {
  autoCapacityPerPerson,
  colorForLevel,
  dayPercent,
  levelForPercent,
  milestoneKernelSum,
  parseIsoDate,
  resolveCapacity,
  workloadMilestones,
  type HeatmapLevel,
} from '@/features/dashboard/lib/workloadHeatmap';

// Fixed, non-configurable window: ~3 months of context before today, ~6 months
// ahead. Opens with the current month flush to the left and scrolls horizontally.
const WEEKS_BEFORE = 13;
const WEEKS_AFTER = 26;

const MILESTONE_COLOR = '#0E9F6E'; // teal marker — distinct from the warm load ramp
const WEEKEND_BG = 'rgba(128, 128, 138, 0.20)'; // neutral, a shade darker than a free day
// Diagonal hatch for holidays — reads on light and dark surfaces.
const HOLIDAY_HATCH: React.CSSProperties = {
  backgroundColor: 'rgba(128, 128, 138, 0.10)',
  backgroundImage:
    'repeating-linear-gradient(45deg, rgba(128,128,138,0.6) 0, rgba(128,128,138,0.6) 1.5px, transparent 1.5px, transparent 5px)',
};

const LEGEND_LEVELS: HeatmapLevel[] = [1, 2, 3, 4, 5];

type DateFnsLocale = ReturnType<typeof resolveDateFnsLocale>;

type DayCellData = {
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
  milestones: DashboardMilestone[];
};

export const WorkloadHeatmapBoard: React.FC = () => {
  const currentWorkspaceId = useAuthStore((state) => state.currentWorkspaceId);
  const workspaces = useAuthStore((state) => state.workspaces);
  const heatmap = useDashboardStore((state) => state.heatmap);
  const loadHeatmap = useDashboardStore((state) => state.loadHeatmap);
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
  const handleOpenDay = useCallback((iso: string) => {
    setPlannerCurrentDate(iso);
    setTimelineAttentionDate(iso);
    requestScrollToDate(iso);
    navigate('/app');
  }, [navigate, requestScrollToDate, setPlannerCurrentDate, setTimelineAttentionDate]);

  // Open a specific milestone in the projects "milestones" submenu.
  const handleOpenMilestone = useCallback((milestoneId: string) => {
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
  }, [currentWorkspaceId, startIso, endIso, loadHeatmap]);

  const dateLocale = useMemo(() => resolveDateFnsLocale(locale), [locale]);
  const workspace = useMemo(
    () => workspaces.find((item) => item.id === currentWorkspaceId) ?? null,
    [workspaces, currentWorkspaceId],
  );
  const headcount = useMemo(() => assignees.filter((a) => a.isActive).length, [assignees]);
  const showHeat = headcount > 0;

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
      loads.push(day.taskCount / Math.max(headcount, 1));
    });
    return loads;
  }, [heatmap.days, todayIso, holidayMap, headcount]);
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

  const stripRef = useRef<HTMLDivElement>(null);
  const todayMonthRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const dragRef = useRef<{ startX: number; startLeft: number } | null>(null);
  const didAutoScroll = useRef(false);
  const [nav, setNav] = useState({ todayVisible: true });

  const syncScrollUi = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const { scrollLeft, scrollWidth, clientWidth } = strip;
    const maxScroll = Math.max(1, scrollWidth - clientWidth);
    const posFrac = Math.min(1, Math.max(0, scrollLeft / maxScroll));
    if (thumbRef.current && trackRef.current) {
      const usable = Math.max(0, trackRef.current.clientWidth - thumbRef.current.offsetWidth);
      thumbRef.current.style.left = `${posFrac * usable}px`;
    }
    let todayVisible = true;
    const target = todayMonthRef.current;
    if (target) {
      const s = strip.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      todayVisible = rect.right > s.left + 8 && rect.left < s.right - 8;
    }
    setNav((prev) => (prev.todayVisible === todayVisible ? prev : { todayVisible }));
  }, []);

  const onScroll = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = 0;
      syncScrollUi();
    });
  }, [syncScrollUi]);

  const alignTodayLeft = useCallback((smooth: boolean) => {
    const strip = stripRef.current;
    const target = todayMonthRef.current;
    if (!strip || !target) return;
    const s = strip.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    const contentLeft = (rect.left - s.left) + strip.scrollLeft;
    strip.scrollTo({ left: Math.max(0, contentLeft - 4), behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  const onThumbPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const strip = stripRef.current;
    if (!strip) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { startX: event.clientX, startLeft: strip.scrollLeft };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onThumbPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const strip = stripRef.current;
    const track = trackRef.current;
    if (!drag || !strip || !track) return;
    const maxScroll = strip.scrollWidth - strip.clientWidth;
    const usable = track.clientWidth - (thumbRef.current?.offsetWidth ?? 0);
    const deltaScroll = usable > 0 ? ((event.clientX - drag.startX) / usable) * maxScroll : 0;
    strip.scrollLeft = drag.startLeft + deltaScroll;
  }, []);

  const onThumbPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // pointer capture may already be released
    }
  }, []);

  const onTrackPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (thumbRef.current?.contains(event.target as Node)) return;
    const strip = stripRef.current;
    const track = trackRef.current;
    if (!strip || !track) return;
    const rect = track.getBoundingClientRect();
    const capWidth = thumbRef.current?.offsetWidth ?? 0;
    const usable = Math.max(1, rect.width - capWidth);
    const frac = Math.min(1, Math.max(0, (event.clientX - rect.left - capWidth / 2) / usable));
    strip.scrollTo({ left: frac * (strip.scrollWidth - strip.clientWidth), behavior: 'smooth' });
  }, []);

  // Open on the current month, flush left. Wait for data so the strip is mounted
  // and laid out (it briefly unmounts behind the loading state on first fetch).
  useEffect(() => {
    if (didAutoScroll.current) return;
    if (heatmap.days.length === 0) return;
    if (!stripRef.current || !todayMonthRef.current) return;
    didAutoScroll.current = true;
    alignTodayLeft(false);
    syncScrollUi();
  }, [heatmap.days.length, months, alignTodayLeft, syncScrollUi]);

  useEffect(() => {
    const handler = () => syncScrollUi();
    window.addEventListener('resize', handler);
    syncScrollUi();
    return () => {
      window.removeEventListener('resize', handler);
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    };
  }, [syncScrollUi]);

  const buildDay = (date: Date): DayCellData => {
    const iso = format(date, 'yyyy-MM-dd');
    const inRange = iso >= startIso && iso <= endIso;
    const taskCount = countsByDate.get(iso) ?? 0;
    const weekend = isWeekend(date);
    const holidayNames = holidayMap[iso] ?? null;
    const isWorkday = !weekend && !holidayNames;
    const percent = showHeat
      ? dayPercent(taskCount, headcount, capacity, milestoneKernelSum(iso, loadBearingMilestones))
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
      milestones: milestonesByDate.get(iso) ?? [],
    };
  };

  if (heatmap.loading && heatmap.days.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Trans>Loading workload...</Trans>
      </div>
    );
  }

  if (heatmap.error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <span>{heatmap.error}</span>
        <button
          type="button"
          className="rounded-md border border-border px-3 py-1.5 text-foreground hover:bg-muted"
          onClick={() => currentWorkspaceId && loadHeatmap(currentWorkspaceId, startIso, endIso)}
        >
          <Trans>Retry</Trans>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-3 px-1">
        <div>
          <h2 className="text-base font-medium">
            <Trans>Team workload</Trans>
          </h2>
          <p className="text-xs text-muted-foreground">
            <Trans>Task density and milestones across the coming months</Trans>
          </p>
          {showHeat && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              <Trans>Full day ≈ {capacityDisplay} tasks/person</Trans>
              {' · '}
              {capacityOverride
                ? <Trans>set manually</Trans>
                : autoCapacity
                  ? <Trans>auto from history</Trans>
                  : <Trans>default</Trans>}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            {LEGEND_LEVELS.map((level) => (
              <span
                key={level}
                className="h-3 w-3 rounded-[3px]"
                style={{ backgroundColor: colorForLevel(level).bg }}
              />
            ))}
            <span className="ml-1"><Trans>Load</Trans></span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rotate-45" style={{ backgroundColor: MILESTONE_COLOR }} />
            <Trans>Milestone</Trans>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[3px] border border-border" style={HOLIDAY_HATCH} />
            <Trans>Holiday</Trans>
          </span>
        </div>
      </div>

      {!showHeat && (
        <div className="mx-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Trans>Add active assignees to see the workload gradient. Milestones are still shown.</Trans>
        </div>
      )}

      <div
        ref={stripRef}
        onScroll={onScroll}
        className="overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex gap-6 px-1 pb-1">
            {months.map((month) => {
              const monthKey = format(month, 'yyyy-MM');
              const monthStart = startOfMonth(month);
              const monthDays = eachDayOfInterval({ start: monthStart, end: endOfMonth(month) });
              const leadingBlanks = (getDay(monthStart) + 6) % 7;
              const isTodayMonth = monthKey === todayMonthKey;
              return (
                <div key={monthKey} ref={isTodayMonth ? todayMonthRef : undefined} className="shrink-0">
                  <p className="mb-1.5 text-sm font-medium capitalize">
                    {format(month, 'LLLL yyyy', { locale: dateLocale })}
                  </p>
                  <div className="grid grid-cols-7 gap-1" style={{ width: 7 * 34 }}>
                    {weekdayLabels.map((label, index) => (
                      <div
                        key={`${monthKey}-wd-${index}`}
                        className="pb-0.5 text-center text-[10px] text-muted-foreground"
                      >
                        {label}
                      </div>
                    ))}
                    {Array.from({ length: leadingBlanks }, (_, index) => (
                      <div key={`${monthKey}-blank-${index}`} />
                    ))}
                    {monthDays.map((date) => (
                      <HeatmapDayCell
                        key={format(date, 'yyyy-MM-dd')}
                        day={buildDay(date)}
                        showHeat={showHeat}
                        dateLocale={dateLocale}
                        projectNameById={projectNameById}
                        onOpenDay={handleOpenDay}
                        onOpenMilestone={handleOpenMilestone}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      <div className="flex items-center gap-2 px-1">
        <div
          ref={trackRef}
          onPointerDown={onTrackPointerDown}
          className="relative h-6 flex-1 cursor-pointer"
        >
          <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-muted-foreground/40" />
          <div
            ref={thumbRef}
            onPointerDown={onThumbPointerDown}
            onPointerMove={onThumbPointerMove}
            onPointerUp={onThumbPointerUp}
            onPointerCancel={onThumbPointerUp}
            className="absolute top-1/2 h-4 w-12 -translate-y-1/2 cursor-grab select-none rounded-full border border-border bg-card transition-colors hover:border-muted-foreground/60 active:cursor-grabbing"
          />
        </div>
        {!nav.todayVisible && (
          <button
            type="button"
            onClick={() => alignTodayLeft(true)}
            className="ml-1 shrink-0 rounded-full border border-border px-3 py-1 text-xs text-foreground hover:bg-muted"
          >
            <Trans>Today</Trans>
          </button>
        )}
      </div>
    </div>
  );
};

type HeatmapDayCellProps = {
  day: DayCellData;
  showHeat: boolean;
  dateLocale: DateFnsLocale;
  projectNameById: Map<string, string>;
  onOpenDay: (iso: string) => void;
  onOpenMilestone: (milestoneId: string) => void;
};

const HeatmapDayCell: React.FC<HeatmapDayCellProps> = ({
  day,
  showHeat,
  dateLocale,
  projectNameById,
  onOpenDay,
  onOpenMilestone,
}) => {
  if (!day.inRange) {
    return (
      <div className="flex h-8 items-center justify-center rounded-[4px] text-[11px] text-muted-foreground/40">
        {day.dayNumber}
      </div>
    );
  }

  const isHoliday = Boolean(day.holidayNames && day.holidayNames.length > 0);
  const colored = showHeat && !day.isWeekend && !isHoliday && day.level > 0;
  const hasMilestones = day.milestones.length > 0;

  let cellStyle: React.CSSProperties | undefined;
  if (colored) {
    const { bg, fg } = colorForLevel(day.level);
    cellStyle = { backgroundColor: bg, color: fg };
  } else if (isHoliday) {
    cellStyle = HOLIDAY_HATCH;
  } else if (day.isWeekend) {
    cellStyle = { backgroundColor: WEEKEND_BG };
  }

  const neutralText = !colored;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'relative flex h-8 items-center justify-center rounded-[4px] text-[11px]',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            !cellStyle && 'border border-border',
            neutralText && 'text-muted-foreground',
            day.isToday && 'heatmap-today relative z-10 font-semibold',
          )}
          style={cellStyle}
          aria-label={format(day.date, 'd MMMM yyyy', { locale: dateLocale })}
        >
          <span className="leading-none">{day.dayNumber}</span>
          {hasMilestones && (
            <span
              className="absolute bottom-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rotate-45"
              style={{ backgroundColor: MILESTONE_COLOR }}
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-64">
        <p className="text-sm font-medium capitalize">
          {format(day.date, 'd MMMM yyyy', { locale: dateLocale })}
        </p>
        {isHoliday ? (
          <p className="mt-1 text-xs text-muted-foreground">
            <Trans>Holiday</Trans>
            {' — '}
            {day.holidayNames?.join(', ')}
          </p>
        ) : day.isWeekend ? (
          <p className="mt-1 text-xs text-muted-foreground">
            <Trans>Day off</Trans>
          </p>
        ) : null}
        <p className="mt-1 text-xs text-muted-foreground">
          <Trans>Tasks</Trans>
          {`: ${day.taskCount}`}
          {showHeat && (
            <>
              {' · '}
              <Trans>Load</Trans>
              {`: ${day.percent}%`}
              {day.percent > 100 && (
                <span className="text-destructive">
                  {' · '}
                  <Trans>overloaded</Trans>
                </span>
              )}
            </>
          )}
        </p>
        <div className="mt-3 border-t border-border pt-2">
          <p className="mb-1 text-xs font-medium">
            <Trans>Milestones</Trans>
          </p>
          {hasMilestones ? (
            <ul className="space-y-1.5">
              {day.milestones.map((milestone) => {
                const projectName = projectNameById.get(milestone.projectId);
                return (
                  <li key={milestone.id}>
                    <button
                      type="button"
                      onClick={() => onOpenMilestone(milestone.id)}
                      className="flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-muted"
                    >
                      <span
                        className="mt-1 h-2 w-2 shrink-0 rotate-45"
                        style={{ backgroundColor: MILESTONE_COLOR }}
                      />
                      <span className="min-w-0">
                        <span className="text-foreground">{milestone.title}</span>
                        {projectName && (
                          <span className="text-muted-foreground"> · {projectName}</span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              <Trans>No milestones on this day</Trans>
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onOpenDay(day.iso)}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <Trans>Open on timeline</Trans>
        </button>
      </PopoverContent>
    </Popover>
  );
};

export default WorkloadHeatmapBoard;
