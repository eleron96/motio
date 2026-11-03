import React, { useMemo, useRef, useEffect, useCallback, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useTimelineTasks } from '@/features/planner/hooks/useTimelineTasks';
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
import { cn } from '@/shared/lib/classNames';
import { hexToRgba } from '@/features/planner/lib/colorUtils';
import { buildCalendarMonths } from '@/features/planner/lib/calendarMonths';
import { CalendarLegendPanel } from '@/features/planner/components/timeline/CalendarLegendPanel';
import { MobileCalendarLegendScreen } from '@/features/planner/components/timeline/MobileCalendarLegendScreen';
import { MobileDaySheet } from '@/features/planner/components/timeline/MobileDaySheet';
import { CalendarDayHoverContent } from '@/features/planner/components/timeline/CalendarDayHoverContent';
import { CalendarTodayButton } from '@/features/planner/components/timeline/CalendarTodayButton';
import { useCalendarLegend } from '@/features/planner/hooks/useCalendarLegend';
import { useCalendarMarks } from '@/features/planner/hooks/useCalendarMarks';
import {
  buildTimeOffByDate,
  selectCalendarTimeOff,
  timeOffCircleInsetClass,
} from '@/features/planner/lib/calendarDayMarkers';
import { NO_TIME_OFF } from '@/features/planner/lib/timeOff';
import {
  buildDayPie,
  buildPieBackground,
  buildTimeOffColorMap,
} from '@/features/planner/lib/timeOffPalette';
import { Milestone, TimeOff } from '@/features/planner/types/planner';
import { Layers } from 'lucide-react';
import { t } from '@lingui/macro';
import { useLocaleStore } from '@/shared/store/localeStore';
import { formatWeekdayLabel, resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';
import { useTodayKey } from '@/shared/hooks/useTodayKey';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { DEFAULT_NEUTRAL_COLOR } from '@/shared/lib/colors';
import { normalizeHolidayCountryCode, useHolidayMap } from '@/features/planner/hooks/useHolidayMap';
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
  const tasks = useTimelineTasks();
  const user = useAuthStore((state) => state.user);
  const currentWorkspaceRole = useAuthStore((state) => state.currentWorkspaceRole);
  const workspaces = useAuthStore((state) => state.workspaces);
  const currentWorkspaceId = useAuthStore((state) => state.currentWorkspaceId);
  const canEdit = currentWorkspaceRole === 'editor' || currentWorkspaceRole === 'admin';
  const containerRef = useRef<HTMLDivElement>(null);
  const monthRefs = useRef(new Map<string, HTMLDivElement>());
  // The legend is a column beside the grid on a desktop and a screen of its own
  // on a phone; both read and write the same `legendState`.
  const isMobile = useIsMobile();
  const [mobileLegendOpen, setMobileLegendOpen] = useState(false);
  /** The day whose sheet is open on a phone; null when nothing is open. */
  const [daySheetDate, setDaySheetDate] = useState<Date | null>(null);
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
  const holidayRegionCode = useMemo(() => (
    workspaces.find((workspace) => workspace.id === currentWorkspaceId)?.holidayRegion ?? null
  ), [workspaces, currentWorkspaceId]);

  const {
    projectById,
    assigneeById,
    milestonesByDate,
    myAssigneeId,
    taskCounts,
  } = useCalendarMarks({
    tasks,
    filters,
    assignees,
    memberGroupAssignments,
    projects,
    milestones,
    userId: user?.id,
  });

  // Two years around the current date — see lib/calendarMonths.ts for why the
  // window no longer follows the task span. The arrows and the "Today" button
  // move currentDate, so the window follows the user.
  const months = useMemo(() => buildCalendarMonths(currentDate), [currentDate]);

  const {
    legendState,
    legend,
    calendarPeople,
    peopleWithoutTimeOff,
    unknownPeopleIds,
    handleTogglePerson,
    handleToggleUnknownPeople,
    handleShowOnlyPerson,
    handleShowAllPeople,
    handleShowOnlyMe,
    handleLegendToggle,
  } = useCalendarLegend({
    userId: user?.id,
    workspaceId: currentWorkspaceId,
    months,
    timeOff,
    assignees,
    myAssigneeId,
  });

  // One stable colour per person, and one pass over the records for the whole
  // two-year window — the day cell only does a Map lookup.
  const timeOffColors = useMemo(() => buildTimeOffColorMap(assignees), [assignees]);
  const timeOffByDate = useMemo(() => {
    if (!legend.timeOff || months.length === 0) return new Map<string, TimeOff[]>();
    const windowStart = months[0];
    const windowEnd = endOfMonth(months[months.length - 1]);
    return buildTimeOffByDate(
      selectCalendarTimeOff(timeOff, assigneeById, legendState.people),
      windowStart,
      windowEnd,
    );
  }, [assigneeById, legend.timeOff, legendState.people, months, timeOff]);


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
    holidayRegionCode,
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

  // Everything the day sheet shows, looked up once for the open day. The cell
  // loop cannot hand it over — the sheet lives outside the grid so that closing
  // it does not depend on which month is still mounted.
  const daySheetKey = daySheetDate ? format(daySheetDate, 'yyyy-MM-dd') : null;
  const daySheetData = daySheetKey
    ? {
      counts: taskCounts.get(daySheetKey) ?? { total: 0, mine: 0 },
      milestones: milestonesByDate.get(daySheetKey) ?? [],
      timeOff: timeOffByDate.get(daySheetKey) ?? [],
      holidayNames: holidayMap[daySheetKey] ?? [],
    }
    : { counts: { total: 0, mine: 0 }, milestones: [], timeOff: [], holidayNames: [] };

  const closeDaySheet = useCallback(() => setDaySheetDate(null), []);

  // Rotating a phone into landscape brings the desktop layout back and takes
  // away both affordances that opened these — so neither may outlive it. Clear
  // the state rather than just hiding: a hidden-but-still-set layer springs back
  // the moment the phone is turned upright again.
  useEffect(() => {
    if (isMobile) return;
    setDaySheetDate(null);
    setMobileLegendOpen(false);
  }, [isMobile]);

  return (
    <div className="flex h-full flex-1 min-h-0 overflow-hidden">
        <div className="relative flex-1 min-h-0">
          <div
            ref={containerRef}
            className="h-full min-h-0 overflow-y-scroll overflow-x-hidden overscroll-contain scrollbar-hidden scroll-smooth select-none"
          >
          <div className="mx-auto w-full max-w-6xl px-4 py-4 space-y-8">
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
                                // A phone gets a plain tap that opens the day sheet, and no
                                // double-tap: the first tap already switches the view, so the
                                // second one would land on a calendar that is no longer there —
                                // and iOS reads a double-tap as zoom before anything else.
                                onClick={isMobile && inMonth ? () => setDaySheetDate(day) : undefined}
                                onDoubleClick={!isMobile && inMonth ? () => handleDateClick(day) : undefined}
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
                                        <CalendarDayHoverContent
                                          counts={counts}
                                          milestones={milestonesForDay}
                                          showMilestones={legend.milestones}
                                          timeOff={dayPie && timeOffForDay ? timeOffForDay : null}
                                          holidayNames={holidayNames}
                                          showHolidays={legend.holidays}
                                          projectById={projectById}
                                          assigneeById={assigneeById}
                                          timeOffColors={timeOffColors}
                                          dateLocale={dateLocale}
                                          onEditMilestone={handleEditMilestone}
                                        />
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
        <CalendarTodayButton
          visible={showTodayButton}
          scrollDirection={scrollDirection}
          onClick={() => {
            const today = format(new Date(), 'yyyy-MM-dd');
            setCurrentDate(today);
            const key = format(parseISO(today), 'yyyy-MM');
            const target = monthRefs.current.get(key);
            if (target) {
              target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }}
        />

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
          className="press absolute bottom-[calc(env(safe-area-inset-bottom,0px)+2rem)] left-6 z-30 flex h-14 w-14 items-center justify-center rounded-full border border-border bg-card shadow-md hover:bg-accent md:hidden"
        >
          <Layers className="h-6 w-6 text-muted-foreground" />
        </button>
        </div>

        <MobileDaySheet
          day={daySheetDate}
          onOpenChange={(open) => { if (!open) closeDaySheet(); }}
          counts={daySheetData.counts}
          milestones={daySheetData.milestones}
          showMilestones={legend.milestones}
          timeOff={daySheetData.timeOff}
          holidayNames={daySheetData.holidayNames}
          showHolidays={legend.holidays}
          projectById={projectById}
          assigneeById={assigneeById}
          timeOffColors={timeOffColors}
          dateLocale={dateLocale}
          canEdit={canEdit}
          onOpenDay={(day) => { closeDaySheet(); handleDateClick(day); }}
          onEditMilestone={(milestone) => { closeDaySheet(); handleEditMilestone(milestone); }}
          onCreateMilestone={(day) => { closeDaySheet(); handleCreateMilestoneOnDate(day); }}
        />

        <MobileCalendarLegendScreen
          open={mobileLegendOpen}
          onOpenChange={setMobileLegendOpen}
          visibility={legend}
          onToggle={handleLegendToggle}
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

