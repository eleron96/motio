import React, { useMemo, useRef, useEffect, useCallback, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { MilestoneDialog } from '@/features/planner/components/timeline/MilestoneDialog';
import * as HoverCardPrimitive from '@radix-ui/react-hover-card';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/shared/ui/hover-card';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/shared/ui/context-menu';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/classNames';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { hexToRgba } from '@/features/planner/lib/colorUtils';
import { buildCalendarMonths } from '@/features/planner/lib/calendarMonths';
import { formatDateRange } from '@/features/planner/lib/dateUtils';
import { CalendarLegendPanel } from '@/features/planner/components/timeline/CalendarLegendPanel';
import { MobileCalendarLegendScreen } from '@/features/planner/components/timeline/MobileCalendarLegendScreen';
import {
  buildTimeOffByDate,
  selectCalendarTimeOff,
  timeOffCircleInsetClass,
  togglePersonSelection,
  type CalendarOverlayCategory,
} from '@/features/planner/lib/calendarDayMarkers';
import { NO_TIME_OFF } from '@/features/planner/lib/timeOff';
import { isTimeOffEnabled } from '@/shared/lib/featureFlags';
import {
  buildDayPie,
  buildPieBackground,
  buildTimeOffColorMap,
  resolveTimeOffColor,
} from '@/features/planner/lib/timeOffPalette';
import {
  DEFAULT_CALENDAR_LEGEND_STATE,
  getCalendarLegendStorageKey,
  readCalendarLegend,
  writeCalendarLegend,
  type CalendarLegendState,
} from '@/features/planner/lib/calendarLegendStorage';
import { Milestone, TimeOff } from '@/features/planner/types/planner';
import { ArrowDown, ArrowUp, Layers } from 'lucide-react';
import { t } from '@lingui/macro';
import { useLocaleStore } from '@/shared/store/localeStore';
import { formatWeekdayLabel, resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';
import { useTodayKey } from '@/shared/hooks/useTodayKey';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { DEFAULT_NEUTRAL_COLOR } from '@/shared/lib/colors';
import { normalizeHolidayCountryCode, useHolidayMap } from '@/features/planner/hooks/useHolidayMap';
import { buildAssigneeGroupMap, selectFilteredTasks } from '@/features/planner/lib/timelineSelectors';
import {
  addDays,
  endOfMonth,
  endOfWeek,
  eachDayOfInterval,
  format,
  isWeekend,
  parseISO,
  startOfMonth,
  startOfWeek,
  isSameMonth,
} from 'date-fns';

export const CalendarTimeline: React.FC = () => {
  const todayKey = useTodayKey();
  const locale = useLocaleStore((state) => state.locale);
  const dateLocale = useMemo(() => resolveDateFnsLocale(locale), [locale]);
  const {
    tasks,
    milestones,
    timeOff,
    projects,
    assignees,
    memberGroupAssignments,
    filters,
    currentDate,
    setCurrentDate,
    setViewMode,
    requestScrollToDate,
    setTimelineAttentionDate,
  } = usePlannerStore(useShallow((state) => ({
    tasks: state.tasks,
    milestones: state.milestones,
    timeOff: state.timeOff ?? NO_TIME_OFF,
    projects: state.projects,
    assignees: state.assignees,
    memberGroupAssignments: state.memberGroupAssignments,
    filters: state.filters,
    currentDate: state.currentDate,
    setCurrentDate: state.setCurrentDate,
    setViewMode: state.setViewMode,
    requestScrollToDate: state.requestScrollToDate,
    setTimelineAttentionDate: state.setTimelineAttentionDate,
  })));
  const user = useAuthStore((state) => state.user);
  const currentWorkspaceRole = useAuthStore((state) => state.currentWorkspaceRole);
  const workspaces = useAuthStore((state) => state.workspaces);
  const currentWorkspaceId = useAuthStore((state) => state.currentWorkspaceId);
  const canEdit = currentWorkspaceRole === 'editor' || currentWorkspaceRole === 'admin';
  const containerRef = useRef<HTMLDivElement>(null);
  const monthRefs = useRef(new Map<string, HTMLDivElement>());
  // Legend state. Persisted per user and per workspace; `legendHydrated` stops
  // the defaults from overwriting what was stored before the read effect runs
  // (the same guard the sidebar width needs in PlannerPage).
  const [legendState, setLegendState] = useState<CalendarLegendState>(DEFAULT_CALENDAR_LEGEND_STATE);
  const legend = legendState.visibility;
  const legendHydratedRef = useRef(false);
  // The legend is a column beside the grid on a desktop and a screen of its own
  // on a phone; both read and write the same `legendState`.
  const isMobile = useIsMobile();
  const [mobileLegendOpen, setMobileLegendOpen] = useState(false);
  const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false);
  const [milestoneDialogDate, setMilestoneDialogDate] = useState<string | null>(null);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const [showTodayButton, setShowTodayButton] = useState(false);
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down'>('up');
  const [hasUserScrolled, setHasUserScrolled] = useState(false);
  const initialScrollTopRef = useRef(0);
  const scrollReadyRef = useRef(false);
  const weekdayLabels = useMemo(() => {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, index) => (
      formatWeekdayLabel(addDays(weekStart, index), locale, { style: 'narrow', dateLocale })
    ));
  }, [dateLocale, locale]);
  const fallbackHolidayLabel = t`Non-working day`;

  const holidayCountryCode = useMemo(() => {
    const currentWorkspace = workspaces.find((workspace) => workspace.id === currentWorkspaceId);
    return normalizeHolidayCountryCode(currentWorkspace?.holidayCountry);
  }, [workspaces, currentWorkspaceId]);

  const assigneeGroupMap = useMemo(
    () => buildAssigneeGroupMap(assignees, memberGroupAssignments),
    [assignees, memberGroupAssignments],
  );

  const filteredTasks = useMemo(
    () => selectFilteredTasks(tasks, filters, assigneeGroupMap, assignees),
    [tasks, filters, assigneeGroupMap, assignees],
  );

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects]
  );

  const assigneeById = useMemo(
    () => new Map(assignees.map((assignee) => [assignee.id, assignee])),
    [assignees],
  );

  const filteredMilestones = useMemo(() => {
    if (filters.projectIds.length === 0) return milestones;
    return milestones.filter((milestone) => filters.projectIds.includes(milestone.projectId));
  }, [milestones, filters.projectIds]);

  const sortedMilestones = useMemo(() => {
    return [...filteredMilestones].sort((left, right) => {
      if (left.date === right.date) {
        return left.title.localeCompare(right.title);
      }
      return left.date.localeCompare(right.date);
    });
  }, [filteredMilestones]);

  const milestonesByDate = useMemo(() => {
    const map = new Map<string, Milestone[]>();
    sortedMilestones.forEach((milestone) => {
      const list = map.get(milestone.date) ?? [];
      list.push(milestone);
      map.set(milestone.date, list);
    });
    return map;
  }, [sortedMilestones]);

  const myAssigneeId = useMemo(() => {
    if (!user?.id) return null;
    return assignees.find((assignee) => assignee.userId === user.id)?.id ?? null;
  }, [assignees, user?.id]);

  const taskCounts = useMemo(() => {
    const counts = new Map<string, { total: number; mine: number }>();
    filteredTasks.forEach(task => {
      const start = parseISO(task.startDate);
      const end = parseISO(task.endDate);
      eachDayOfInterval({ start, end }).forEach(day => {
        const key = format(day, 'yyyy-MM-dd');
        const entry = counts.get(key) ?? { total: 0, mine: 0 };
        entry.total += 1;
        if (myAssigneeId && task.assigneeIds.includes(myAssigneeId)) {
          entry.mine += 1;
        }
        counts.set(key, entry);
      });
    });
    return counts;
  }, [filteredTasks, myAssigneeId]);

  // Two years around the current date — see lib/calendarMonths.ts for why the
  // window no longer follows the task span. The arrows and the "Today" button
  // move currentDate, so the window follows the user.
  const months = useMemo(() => buildCalendarMonths(currentDate), [currentDate]);

  // One stable colour per person, and one pass over the records for the whole
  // two-year window — the day cell only does a Map lookup.
  const timeOffColors = useMemo(() => buildTimeOffColorMap(assignees), [assignees]);
  const timeOffEnabled = isTimeOffEnabled();
  const timeOffByDate = useMemo(() => {
    if (!timeOffEnabled || !legend.timeOff || months.length === 0) return new Map<string, TimeOff[]>();
    const windowStart = months[0];
    const windowEnd = endOfMonth(months[months.length - 1]);
    return buildTimeOffByDate(
      selectCalendarTimeOff(timeOff, assigneeById, legendState.people),
      windowStart,
      windowEnd,
    );
  }, [assigneeById, legend.timeOff, legendState.people, months, timeOff, timeOffEnabled]);


  const years = useMemo(() => {
    const grouped = new Map<number, Date[]>();
    months.forEach((month) => {
      const year = month.getFullYear();
      const list = grouped.get(year) ?? [];
      list.push(month);
      grouped.set(year, list);
    });
    return Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]);
  }, [months]);
  const holidayYears = useMemo(
    () => Array.from(new Set(months.map((month) => month.getFullYear()))),
    [months],
  );
  const { holidayMap, holidayDates } = useHolidayMap({
    years: holidayYears,
    holidayCountryCode,
    fallbackHolidayLabel,
    holidayLabel: t`Holiday`,
  });

  const setMonthRef = useCallback((key: string) => (node: HTMLDivElement | null) => {
    if (!node) {
      monthRefs.current.delete(key);
      return;
    }
    monthRefs.current.set(key, node);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    initialScrollTopRef.current = container.scrollTop;
    scrollReadyRef.current = false;
    requestAnimationFrame(() => {
      scrollReadyRef.current = true;
    });

    const handleScroll = () => {
      if (!scrollReadyRef.current) return;
      const threshold = Math.max(120, container.clientHeight * 0.25);
      const delta = container.scrollTop - initialScrollTopRef.current;
      setScrollDirection(delta >= 0 ? 'down' : 'up');
      setShowTodayButton(hasUserScrolled && Math.abs(delta) > threshold);
    };

    handleScroll();
    container.addEventListener('scroll', handleScroll, { passive: true });
    const handleUserScroll = () => setHasUserScrolled(true);
    container.addEventListener('wheel', handleUserScroll, { passive: true });
    container.addEventListener('touchmove', handleUserScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      container.removeEventListener('wheel', handleUserScroll);
      container.removeEventListener('touchmove', handleUserScroll);
    };
  }, [months.length, hasUserScrolled]);

  useEffect(() => {
    const key = format(parseISO(currentDate), 'yyyy-MM');
    const target = monthRefs.current.get(key);
    if (target && containerRef.current) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [currentDate, months.length]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!user?.id || !currentWorkspaceId) return;
    legendHydratedRef.current = false;
    const stored = readCalendarLegend(
      window.localStorage,
      getCalendarLegendStorageKey(user.id, currentWorkspaceId),
    );
    setLegendState(stored ?? DEFAULT_CALENDAR_LEGEND_STATE);
    legendHydratedRef.current = true;
  }, [currentWorkspaceId, user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!legendHydratedRef.current) return;
    if (!user?.id || !currentWorkspaceId) return;
    writeCalendarLegend(
      window.localStorage,
      getCalendarLegendStorageKey(user.id, currentWorkspaceId),
      legendState,
    );
  }, [currentWorkspaceId, legendState, user?.id]);

  // People shown on the calendar. A LOCAL selection, deliberately separate from
  // the global people filter: that one narrows tasks and milestones everywhere,
  // while this one only decides whose days off are marked here.
  // Only people who actually have time off inside the rendered window. A tick
  // box for somebody who never leaves toggles nothing — it just costs a row, and
  // a thirty-person team turns the panel into a wall of checkboxes. The list
  // shrinks and grows with the window as the user scrolls through years.
  const peopleIdsWithTimeOff = useMemo(() => {
    if (months.length === 0) return new Set<string>();
    const windowStart = format(months[0], 'yyyy-MM-dd');
    const windowEnd = format(endOfMonth(months[months.length - 1]), 'yyyy-MM-dd');
    const ids = new Set<string>();
    timeOff.forEach((record) => {
      if (record.endDate < windowStart || record.startDate > windowEnd) return;
      ids.add(record.assigneeId);
    });
    return ids;
  }, [months, timeOff]);

  const activePeople = useMemo(
    () => assignees.filter((assignee) => assignee.isActive),
    [assignees],
  );

  const calendarPeople = useMemo(
    () => activePeople
      .filter((assignee) => peopleIdsWithTimeOff.has(assignee.id))
      .sort((left, right) => left.name.localeCompare(right.name)),
    [activePeople, peopleIdsWithTimeOff],
  );

  /** Teammates with nothing to show in this window — counted, not listed. */
  const peopleWithoutTimeOff = activePeople.length - calendarPeople.length;

  // People with time off who are not in the assignee list — that list is pruned
  // to those with an account or a task in the loaded window, while time off
  // arrives on its own window. They share ONE row instead of a column of
  // identical "unknown user" lines, but they still have to be switchable:
  // otherwise their circles sit on the calendar with no way to hide them.
  const unknownPeopleIds = useMemo(() => {
    const knownIds = new Set(calendarPeople.map((person) => person.id));
    return Array.from(peopleIdsWithTimeOff).filter((id) => !knownIds.has(id));
  }, [calendarPeople, peopleIdsWithTimeOff]);

  const handleTogglePerson = useCallback((assigneeId: string) => {
    setLegendState((current) => ({
      ...current,
      people: togglePersonSelection(
        current.people,
        assigneeId,
        [...calendarPeople.map((person) => person.id), ...unknownPeopleIds],
      ),
    }));
  }, [calendarPeople, unknownPeopleIds]);

  const handleToggleUnknownPeople = useCallback(() => {
    setLegendState((current) => {
      const allIds = [...calendarPeople.map((person) => person.id), ...unknownPeopleIds];
      const shown = current.people === null || unknownPeopleIds.every((id) => current.people?.includes(id));
      const base = current.people ?? allIds;
      const next = shown
        ? base.filter((id) => !unknownPeopleIds.includes(id))
        : [...base, ...unknownPeopleIds.filter((id) => !base.includes(id))];
      return {
        ...current,
        people: allIds.every((id) => next.includes(id)) ? null : next,
      };
    });
  }, [calendarPeople, unknownPeopleIds]);

  const handleShowOnlyPerson = useCallback((assigneeId: string) => {
    setLegendState((current) => ({ ...current, people: [assigneeId] }));
  }, []);

  const handleShowAllPeople = useCallback(() => {
    setLegendState((current) => ({ ...current, people: null }));
  }, []);

  const handleShowOnlyMe = useCallback(() => {
    setLegendState((current) => ({ ...current, people: myAssigneeId ? [myAssigneeId] : current.people }));
  }, [myAssigneeId]);

  const handleLegendToggle = useCallback((category: CalendarOverlayCategory) => {
    setLegendState((current) => ({
      ...current,
      visibility: { ...current.visibility, [category]: !current.visibility[category] },
    }));
  }, []);

  const handleDateClick = useCallback((day: Date) => {
    const nextDate = format(day, 'yyyy-MM-dd');
    // Force retrigger of the same attention animation when opening the day timeline from calendar.
    setTimelineAttentionDate(null);
    setCurrentDate(nextDate);
    setViewMode('day');
    requestScrollToDate(nextDate);
    if (typeof window === 'undefined') {
      setTimelineAttentionDate(nextDate);
      return;
    }
    window.requestAnimationFrame(() => {
      setTimelineAttentionDate(nextDate);
    });
  }, [requestScrollToDate, setCurrentDate, setTimelineAttentionDate, setViewMode]);

  const handleMilestoneDialogChange = useCallback((open: boolean) => {
    setMilestoneDialogOpen(open);
    if (!open) {
      setMilestoneDialogDate(null);
      setEditingMilestone(null);
    }
  }, []);

  const handleEditMilestone = useCallback((milestone: Milestone) => {
    setEditingMilestone(milestone);
    setMilestoneDialogDate(null);
    setMilestoneDialogOpen(true);
  }, []);

  const handleCreateMilestoneOnDate = useCallback((day: Date) => {
    if (!canEdit) return;
    setEditingMilestone(null);
    setMilestoneDialogDate(format(day, 'yyyy-MM-dd'));
    setMilestoneDialogOpen(true);
  }, [canEdit]);

  return (
    <div className="flex h-full flex-1 min-h-0 overflow-hidden">
        <div className="relative flex-1 min-h-0">
          <div
            ref={containerRef}
            className="h-full min-h-0 overflow-y-scroll overflow-x-hidden overscroll-contain scrollbar-hidden scroll-smooth select-none"
          >
          <div className="w-full max-w-6xl px-4 py-4 space-y-8">
            {years.map(([year, yearMonths]) => (
              <div key={year} className="grid gap-4 md:grid-cols-[80px,1fr]">
                <div className="text-lg font-semibold text-muted-foreground">{year}</div>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {yearMonths.map((month) => {
                    const monthKey = format(month, 'yyyy-MM');
                    const monthStart = startOfMonth(month);
                    const monthEnd = endOfMonth(month);
                    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
                    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
                    const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

                    return (
                      <div
                        key={monthKey}
                        ref={setMonthRef(monthKey)}
                        className="w-full rounded-lg border border-border bg-card p-3 shadow-sm"
                      >
                        <div className="mb-2 text-sm font-semibold text-foreground">
                          {format(month, 'LLLL yyyy', { locale: dateLocale })}
                        </div>
                        <div className="grid grid-cols-7 text-[11px] text-muted-foreground uppercase tracking-wide">
                          {weekdayLabels.map((label, index) => (
                            <div key={`weekday-${index}`} className="flex items-center justify-center py-1">
                              {label}
                            </div>
                          ))}
                        </div>
                        <div className="mt-1 grid grid-cols-7 gap-0">
                          {days.map((day, index) => {
                            const key = format(day, 'yyyy-MM-dd');
                            const counts = taskCounts.get(key) ?? { total: 0, mine: 0 };
                            const inMonth = isSameMonth(day, month);
                            const weekend = isWeekend(day);
                            const today = key === todayKey;
                            const prevDay = index > 0 ? days[index - 1] : null;
                            const nextDay = index < days.length - 1 ? days[index + 1] : null;
                            const prevKey = prevDay ? format(prevDay, 'yyyy-MM-dd') : '';
                            const nextKey = nextDay ? format(nextDay, 'yyyy-MM-dd') : '';
                            const isHoliday = inMonth && holidayDates.has(key);
                            const prevIsHoliday = Boolean(prevDay && holidayDates.has(prevKey) && isSameMonth(prevDay, month));
                            const nextIsHoliday = Boolean(nextDay && holidayDates.has(nextKey) && isSameMonth(nextDay, month));
                            const holidayStarts = isHoliday && (index % 7 === 0 || !prevIsHoliday);
                            const holidayEnds = isHoliday && (index % 7 === 6 || !nextIsHoliday);
                            const holidayRadius = holidayStarts && holidayEnds
                              ? 'rounded-full'
                              : holidayStarts
                              ? 'rounded-l-full'
                              : holidayEnds
                              ? 'rounded-r-full'
                              : 'rounded-none';
                            const holidayNames = holidayMap[key] ?? [];
                            const milestonesForDay = milestonesByDate.get(key) ?? [];
                            const timeOffForDay = inMonth ? timeOffByDate.get(key) : undefined;
                            const dayPie = timeOffForDay ? buildDayPie(timeOffForDay, timeOffColors) : null;

                            const cell = (
                              <div
                                key={key}
                                className="relative flex h-11 w-9 flex-col items-center justify-start pt-0.5"
                                onDoubleClick={inMonth ? () => handleDateClick(day) : undefined}
                              >
                                {legend.holidays && isHoliday && (
                                  <div
                                    className={cn(
                                      'pointer-events-none absolute inset-x-1 top-0.5 h-7 bg-rose-200/70',
                                      holidayRadius
                                    )}
                                  />
                                )}
                                {inMonth ? (
                                  <HoverCard openDelay={350} closeDelay={150}>
                                    <HoverCardTrigger asChild>
                                      <div className="relative z-10 flex w-full cursor-default flex-col items-center gap-0.5">
                                        <span className="relative flex h-7 w-7 items-center justify-center">
                                          {dayPie && (
                                            // The away-circle sits BEHIND the number: holidays keep their
                                            // pill and today keeps its ring, so a day can carry all three
                                            // without three competing circles. On a holiday it also steps
                                            // back to 70% so the pill reads around it.
                                            <span
                                              aria-hidden="true"
                                              className={cn(
                                                'absolute rounded-full ring-1 ring-card',
                                                timeOffCircleInsetClass(isHoliday),
                                              )}
                                              style={{ background: buildPieBackground(dayPie) }}
                                            />
                                          )}
                                          <span
                                            className={cn(
                                              'relative flex h-7 w-7 items-center justify-center text-xs',
                                              weekend && inMonth && !dayPie && 'text-amber-600',
                                              counts.total > 0 && 'font-semibold',
                                              dayPie && 'font-semibold text-foreground',
                                              today ? 'rounded-full border border-sky-500/70 bg-sky-100/70 text-sky-700' : 'rounded-md',
                                            )}
                                          >
                                            {format(day, 'd')}
                                          </span>
                                        </span>
                                        <span className="pointer-events-none flex h-1.5 items-center justify-center gap-0.5">
                                          {legend.milestones && milestonesForDay.slice(0, 4).map((milestone) => {
                                            const project = projectById.get(milestone.projectId);
                                            const color = project?.color ?? DEFAULT_NEUTRAL_COLOR;
                                            const dotColor = hexToRgba(color, 0.8) ?? color;
                                            return (
                                              <span
                                                key={milestone.id}
                                                className="h-1.5 w-1.5 rounded-full"
                                                style={{ backgroundColor: dotColor }}
                                              />
                                            );
                                          })}
                                          {legend.milestones && milestonesForDay.length > 4 && (
                                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/70" />
                                          )}
                                        </span>
                                      </div>
                                    </HoverCardTrigger>
                                    <HoverCardPrimitive.Portal>
                                      <HoverCardContent
                                        side="top"
                                        align="center"
                                        sideOffset={6}
                                        className="w-56 rounded-lg border border-border bg-card/95 p-0 text-xs text-foreground shadow-md backdrop-blur"
                                      >
                                        <div className="space-y-2 p-3">
                                          {legend.milestones && milestonesForDay.length > 0 && (
                                            <div className="space-y-1 border-b border-border/60 pb-2">
                                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                                {t`Milestones`}
                                              </div>
                                              <div className="space-y-0.5">
                                                {milestonesForDay.map((milestone) => {
                                                  const project = projectById.get(milestone.projectId);
                                                  const color = project?.color ?? DEFAULT_NEUTRAL_COLOR;
                                                  const dotColor = hexToRgba(color, 0.8) ?? color;
                                                  return (
                                                    <button
                                                      type="button"
                                                      key={milestone.id}
                                                      onClick={() => handleEditMilestone(milestone)}
                                                      className="flex w-full items-start gap-2 rounded-md px-2 py-1 text-left hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                                                      aria-label={t`Edit milestone`}
                                                    >
                                                      <span
                                                        className="mt-1 h-2 w-2 shrink-0 rounded-full"
                                                        style={{ backgroundColor: dotColor }}
                                                      />
                                                      <span className="min-w-0">
                                                        <span className="block truncate text-[10px] text-muted-foreground">
                                                          {project
                                                            ? formatProjectLabel(project.name, project.code)
                                                            : t`Project`}
                                                        </span>
                                                        <span className="block truncate text-sm">
                                                          {milestone.title}
                                                        </span>
                                                      </span>
                                                    </button>
                                                  );
                                                })}
                                              </div>
                                            </div>
                                          )}
                                          <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground">{t`Total`}</span>
                                            <span className="font-semibold">{counts.total}</span>
                                          </div>
                                          <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground">{t`Mine`}</span>
                                            <span className="font-semibold">{counts.mine}</span>
                                          </div>
                                          {dayPie && timeOffForDay && (
                                            <div className="space-y-1 border-t border-border/60 pt-1.5">
                                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                                {t`Away`}
                                              </div>
                                              <div className="space-y-0.5">
                                                {timeOffForDay.map((record) => {
                                                  const person = assigneeById.get(record.assigneeId);
                                                  return (
                                                    <div key={record.id} className="flex items-start gap-2">
                                                      <span
                                                        className="mt-1 h-2 w-2 shrink-0 rounded-full"
                                                        style={{ backgroundColor: resolveTimeOffColor(timeOffColors, record.assigneeId) }}
                                                      />
                                                      <span className="min-w-0">
                                                        <span className="block truncate text-[11px] text-foreground">
                                                          {person?.name ?? t`Unknown user`}
                                                        </span>
                                                        <span className="block truncate text-[10px] text-muted-foreground">
                                                          {formatDateRange(record.startDate, record.endDate, dateLocale)}
                                                          {record.note ? ` · ${record.note}` : ''}
                                                        </span>
                                                      </span>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            </div>
                                          )}
                                          {legend.holidays && holidayNames.length > 0 && (
                                            <div className="border-t border-border/60 pt-1 text-[11px] text-muted-foreground">
                                              <span className="text-foreground">{t`Holiday:`}</span>{' '}
                                              {holidayNames.join(', ')}
                                            </div>
                                          )}
                                        </div>
                                      </HoverCardContent>
                                    </HoverCardPrimitive.Portal>
                                  </HoverCard>
                                ) : (
                                  <div className="h-7 w-7" />
                                )}
                              </div>
                            );

                            // Right-click a day to open the milestone menu, mirroring
                            // the timeline header. Out-of-month / read-only cells stay plain.
                            if (!inMonth || !canEdit) {
                              return cell;
                            }

                            return (
                              <ContextMenu key={key}>
                                <ContextMenuTrigger asChild>{cell}</ContextMenuTrigger>
                                <ContextMenuContent>
                                  <ContextMenuItem onSelect={() => handleCreateMilestoneOnDate(day)}>
                                    {t`Create milestone`}
                                  </ContextMenuItem>
                                </ContextMenuContent>
                              </ContextMenu>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className={cn(
            // z-20: the day cells inside the scroller are `relative z-10`, and a
            // floating button left on z-auto is painted — and click-blocked —
            // by whichever week row happens to scroll under it.
            'absolute bottom-4 right-4 z-20 shadow-md transition-all duration-200 ease-out',
            showTodayButton
              ? 'opacity-100 translate-y-0 pointer-events-auto'
              : 'opacity-0 translate-y-2 pointer-events-none'
          )}
          onClick={() => {
            const today = format(new Date(), 'yyyy-MM-dd');
            setCurrentDate(today);
            const key = format(parseISO(today), 'yyyy-MM');
            const target = monthRefs.current.get(key);
            if (target) {
              target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }}
          aria-label={t`Back to today`}
        >
          {scrollDirection === 'down' ? (
            <ArrowUp className="h-4 w-4" />
          ) : (
            <ArrowDown className="h-4 w-4" />
          )}
        </Button>

        {/* The way into the legend on a phone, where the side panel is hidden.
            Same round card button as "filters" on the timeline, in the same
            bottom-left corner: on this view that corner is free (the filter and
            add buttons are hidden), so the two never collide and the thumb keeps
            one habit across views. It stays put rather than fading with the
            scroll — nothing else on the calendar says what the marks mean. */}
        <button
          type="button"
          onClick={() => setMobileLegendOpen(true)}
          aria-label={t`On the calendar`}
          className="absolute bottom-4 left-4 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card shadow-md hover:bg-accent md:hidden"
        >
          <Layers className="h-5 w-5 text-muted-foreground" />
        </button>
        </div>

        <MobileCalendarLegendScreen
          // Rotating a phone into landscape brings the desktop column back and
          // hides the button that opened this — the screen must not outlive it.
          open={mobileLegendOpen && isMobile}
          onOpenChange={setMobileLegendOpen}
          visibility={legend}
          onToggle={handleLegendToggle}
          showTimeOffRow={timeOffEnabled}
          people={calendarPeople}
          peopleColors={timeOffColors}
          selectedPeople={legendState.people}
          onTogglePerson={handleTogglePerson}
          unknownPeopleIds={unknownPeopleIds}
          onToggleUnknownPeople={handleToggleUnknownPeople}
          hiddenPeopleCount={peopleWithoutTimeOff}
          onShowAllPeople={handleShowAllPeople}
          onShowOnlyMe={handleShowOnlyMe}
          myAssigneeId={myAssigneeId}
        />

        <CalendarLegendPanel
          visibility={legend}
          onToggle={handleLegendToggle}
          showTimeOffRow={timeOffEnabled}
          people={calendarPeople}
          peopleColors={timeOffColors}
          selectedPeople={legendState.people}
          onTogglePerson={handleTogglePerson}
          unknownPeopleIds={unknownPeopleIds}
          onToggleUnknownPeople={handleToggleUnknownPeople}
          hiddenPeopleCount={peopleWithoutTimeOff}
          onShowOnlyPerson={handleShowOnlyPerson}
          onShowAllPeople={handleShowAllPeople}
          onShowOnlyMe={handleShowOnlyMe}
          myAssigneeId={myAssigneeId}
        />

        <MilestoneDialog
          open={milestoneDialogOpen}
          onOpenChange={handleMilestoneDialogChange}
          date={milestoneDialogDate}
          milestone={editingMilestone}
          canEdit={canEdit}
        />
    </div>
  );
};

