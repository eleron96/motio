import React, { useMemo, useRef, useEffect, useCallback, useState } from 'react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { MilestoneDialog } from '@/features/planner/components/timeline/MilestoneDialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/ui/tooltip';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/classNames';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { hexToRgba } from '@/features/planner/lib/colorUtils';
import { Milestone } from '@/features/planner/types/planner';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { t } from '@lingui/macro';
import { useLocaleStore } from '@/shared/store/localeStore';
import { formatWeekdayLabel, resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';
import {
  addDays,
  addMonths,
  addYears,
  endOfMonth,
  endOfYear,
  endOfWeek,
  eachDayOfInterval,
  format,
  isToday,
  isWeekend,
  max,
  min,
  parseISO,
  startOfMonth,
  startOfYear,
  startOfWeek,
  isSameMonth,
} from 'date-fns';

const DEFAULT_HOLIDAY_COUNTRY_CODE = 'RU';
const HOLIDAY_RETRY_DELAY_MS = 30000;

const normalizeHolidayCountryCode = (value: string | null | undefined) => {
  const code = (value ?? '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : DEFAULT_HOLIDAY_COUNTRY_CODE;
};

export const CalendarTimeline: React.FC = () => {
  const locale = useLocaleStore((state) => state.locale);
  const dateLocale = useMemo(() => resolveDateFnsLocale(locale), [locale]);
  const {
    tasks,
    milestones,
    projects,
    assignees,
    memberGroupAssignments,
    filters,
    currentDate,
    setCurrentDate,
    setViewMode,
    requestScrollToDate,
    setTimelineAttentionDate,
  } = usePlannerStore();
  const user = useAuthStore((state) => state.user);
  const currentWorkspaceRole = useAuthStore((state) => state.currentWorkspaceRole);
  const workspaces = useAuthStore((state) => state.workspaces);
  const currentWorkspaceId = useAuthStore((state) => state.currentWorkspaceId);
  const canEdit = currentWorkspaceRole === 'editor' || currentWorkspaceRole === 'admin';
  const containerRef = useRef<HTMLDivElement>(null);
  const monthRefs = useRef(new Map<string, HTMLDivElement>());
  const loadedHolidayYears = useRef(new Set<number>());
  const loadingHolidayYears = useRef(new Set<number>());
  const [holidayReloadToken, setHolidayReloadToken] = useState(0);
  const [holidayMap, setHolidayMap] = useState<Record<string, string[]>>({});
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

  const assigneeGroupMap = useMemo(() => {
    const groupByUserId = new Map(memberGroupAssignments.map((assignment) => [assignment.userId, assignment.groupId]));
    const map = new Map<string, string>();
    assignees.forEach((assignee) => {
      if (!assignee.userId) return;
      const groupId = groupByUserId.get(assignee.userId);
      if (groupId) {
        map.set(assignee.id, groupId);
      }
    });
    return map;
  }, [assignees, memberGroupAssignments]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      if (filters.projectIds.length > 0 && task.projectId && !filters.projectIds.includes(task.projectId)) {
        return false;
      }
      if (filters.assigneeIds.length > 0) {
        if (!task.assigneeIds.some((id) => filters.assigneeIds.includes(id))) {
          return false;
        }
      } else if (filters.hideUnassigned && task.assigneeIds.length === 0) {
        return false;
      }
      if (filters.statusIds.length > 0 && !filters.statusIds.includes(task.statusId)) {
        return false;
      }
      if (filters.typeIds.length > 0 && !filters.typeIds.includes(task.typeId)) {
        return false;
      }
      if (filters.tagIds.length > 0 && !filters.tagIds.some(id => task.tagIds.includes(id))) {
        return false;
      }
      if (filters.groupIds.length > 0) {
        const matchesGroup = task.assigneeIds.some((id) => {
          const groupId = assigneeGroupMap.get(id);
          return groupId ? filters.groupIds.includes(groupId) : false;
        });
        if (!matchesGroup) {
          return false;
        }
      }
      return true;
    });
  }, [tasks, filters, assigneeGroupMap]);

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects]
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

  const months = useMemo(() => {
    const baseDate = parseISO(currentDate);
    const startDates = filteredTasks.map((task) => parseISO(task.startDate));
    const endDates = filteredTasks.map((task) => parseISO(task.endDate));
    const minTaskDate = min([baseDate, ...startDates]);
    const maxTaskDate = max([baseDate, ...endDates]);

    const rangeStart = startOfYear(addYears(minTaskDate, -1));
    const rangeEnd = endOfYear(addYears(maxTaskDate, 5));
    const result: Date[] = [];
    let cursor = startOfMonth(rangeStart);
    while (cursor <= rangeEnd) {
      result.push(cursor);
      cursor = addMonths(cursor, 1);
    }
    return result;
  }, [currentDate, filteredTasks]);

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

  useEffect(() => {
    loadedHolidayYears.current.clear();
    loadingHolidayYears.current.clear();
    setHolidayMap({});
  }, [holidayCountryCode]);

  useEffect(() => {
    const years = Array.from(new Set(months.map((month) => month.getFullYear())));
    const toLoad = years.filter((year) => (
      !loadedHolidayYears.current.has(year) && !loadingHolidayYears.current.has(year)
    ));
    if (toLoad.length === 0) return;

    let active = true;
    const controller = new AbortController();
    let retryTimer: number | null = null;
    let shouldRetry = false;

    const mergeHolidayEntries = (entries: Record<string, string[]>) => {
      setHolidayMap((prev) => {
        const next = { ...prev };
        Object.entries(entries).forEach(([date, labels]) => {
          const existing = next[date] ?? [];
          labels.forEach((label) => {
            if (!existing.includes(label)) {
              existing.push(label);
            }
          });
          next[date] = existing;
        });
        return next;
      });
    };

    const loadNagerYear = async (year: number) => {
      const response = await fetch(
        `https://date.nager.at/api/v3/PublicHolidays/${year}/${holidayCountryCode}`,
        { signal: controller.signal },
      );
      if (!response.ok) {
        throw new Error(`Holiday fetch failed: ${response.status}`);
      }
      const entries: Record<string, string[]> = {};
      const data = (await response.json()) as Array<{ date?: string; localName?: string; name?: string }>;
      data.forEach((holiday) => {
        if (!holiday.date) return;
        const label = holiday.localName || holiday.name || t`Holiday`;
        const existing = entries[holiday.date] ?? [];
        if (existing.includes(label)) return;
        entries[holiday.date] = [...existing, label];
      });
      return entries;
    };

    const loadRuProductionCalendarYear = async (year: number) => {
      const response = await fetch(
        `https://isdayoff.ru/api/getdata?year=${year}&cc=ru`,
        { signal: controller.signal },
      );
      if (!response.ok) {
        throw new Error(`Holiday production calendar fetch failed: ${response.status}`);
      }
      const raw = (await response.text()).trim();
      if (!raw || !/^[0-9]+$/.test(raw)) {
        throw new Error('Holiday production calendar returned invalid payload');
      }

      const yearStart = startOfYear(new Date(year, 0, 1));
      const entries: Record<string, string[]> = {};
      for (let index = 0; index < raw.length; index += 1) {
        const code = raw[index];
        if (code !== '1') continue;
        const day = addDays(yearStart, index);
        // Keep standard weekends styled as weekends; mark weekday non-working days from production calendar.
        if (isWeekend(day)) continue;
        const key = format(day, 'yyyy-MM-dd');
        entries[key] = [fallbackHolidayLabel];
      }
      return entries;
    };

    const loadYear = async (year: number) => {
      loadingHolidayYears.current.add(year);
      try {
        if (holidayCountryCode === 'RU') {
          let ruEntries: Record<string, string[]> | null = null;
          let nagerEntries: Record<string, string[]> = {};
          let ruLoadFailed = false;
          let nagerLoadFailed = false;

          try {
            ruEntries = await loadRuProductionCalendarYear(year);
          } catch (productionError) {
            if ((productionError as { name?: string })?.name === 'AbortError') {
              return;
            }
            ruLoadFailed = true;
            console.error(productionError);
          }

          try {
            nagerEntries = await loadNagerYear(year);
          } catch (nagerError) {
            if ((nagerError as { name?: string })?.name === 'AbortError') {
              return;
            }
            nagerLoadFailed = true;
            console.error(nagerError);
          }

          if (!active) return;

          if (ruEntries) {
            const merged = { ...ruEntries };
            Object.entries(nagerEntries).forEach(([date, labels]) => {
              const existing = merged[date] ?? [];
              labels.forEach((label) => {
                if (!existing.includes(label)) {
                  existing.push(label);
                }
              });
              merged[date] = existing;
            });
            mergeHolidayEntries(merged);
            loadedHolidayYears.current.add(year);
            return;
          }

          if (Object.keys(nagerEntries).length > 0) {
            mergeHolidayEntries(nagerEntries);
            loadedHolidayYears.current.add(year);
            return;
          }

          if (ruLoadFailed || nagerLoadFailed) {
            shouldRetry = true;
          }
          return;
        }

        const entries = await loadNagerYear(year);
        if (!active) return;
        mergeHolidayEntries(entries);
        loadedHolidayYears.current.add(year);
      } catch (error) {
        if ((error as { name?: string })?.name !== 'AbortError') {
          console.error(error);
          shouldRetry = true;
        }
      } finally {
        loadingHolidayYears.current.delete(year);
      }
    };

    const loadSequentially = async () => {
      for (const year of toLoad) {
        if (!active) return;
        await loadYear(year);
      }
    };

    void loadSequentially().finally(() => {
      if (!active || !shouldRetry) return;
      retryTimer = window.setTimeout(() => {
        setHolidayReloadToken((prev) => prev + 1);
      }, HOLIDAY_RETRY_DELAY_MS);
    });

    return () => {
      active = false;
      controller.abort();
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [months, holidayCountryCode, holidayReloadToken, fallbackHolidayLabel]);

  const holidayDates = useMemo(() => new Set(Object.keys(holidayMap)), [holidayMap]);

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
    setTimelineAttentionDate(nextDate);
    setCurrentDate(nextDate);
    setViewMode('week');
    requestScrollToDate(nextDate);
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

  return (
    <div className="flex h-full flex-1 min-h-0 overflow-hidden">
      <TooltipProvider delayDuration={350}>
        <div className="relative flex-1 min-h-0">
          <div
            ref={containerRef}
            className="h-full min-h-0 overflow-y-scroll overflow-x-hidden overscroll-contain scrollbar-hidden scroll-smooth select-none"
          >
          <div className="mx-auto w-full max-w-6xl px-4 py-4 space-y-8">
            {years.map(([year, yearMonths]) => (
              <div key={year} className="grid gap-4 md:grid-cols-[80px,1fr]">
                <div className="text-lg font-semibold text-muted-foreground">{year}</div>
                <div className="grid grid-cols-4 gap-6">
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
                            const today = isToday(day);
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

                            return (
                              <div
                                key={key}
                                className="relative flex h-9 w-9 items-center justify-center"
                              >
                                {isHoliday && (
                                  <div
                                    className={cn(
                                      'pointer-events-none absolute inset-1 bg-rose-200/70',
                                      holidayRadius
                                    )}
                                  />
                                )}
                                {inMonth ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="relative z-10 flex h-full w-full items-center justify-center">
                                        <button
                                          type="button"
                                          onClick={() => handleDateClick(day)}
                                          className={cn(
                                            'flex h-7 w-7 items-center justify-center text-xs focus-visible:outline-none',
                                            weekend && inMonth && 'text-amber-600',
                                            counts.total > 0 && 'font-semibold',
                                            today ? 'rounded-full border border-sky-500/70 bg-sky-100/70 text-sky-700' : 'rounded-md',
                                            'hover:bg-muted/40'
                                          )}
                                        >
                                          {format(day, 'd')}
                                        </button>
                                        {milestonesByDate.has(key) && (
                                          <div className="absolute bottom-0.5 left-1/2 flex -translate-x-1/2 flex-wrap items-center justify-center gap-0.5">
                                            {(milestonesByDate.get(key) ?? []).map((milestone) => {
                                              const project = projectById.get(milestone.projectId);
                                              const color = project?.color ?? '#94a3b8';
                                              const dotColor = hexToRgba(color, 0.8) ?? color;

                                              return (
                                                <button
                                                  key={milestone.id}
                                                  type="button"
                                                  className="h-2 w-2 rounded-full"
                                                  style={{ backgroundColor: dotColor }}
                                                  onClick={(event) => {
                                                    event.stopPropagation();
                                                    handleDateClick(parseISO(milestone.date));
                                                  }}
                                                  onContextMenu={(event) => {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    handleEditMilestone(milestone);
                                                  }}
                                                />
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent
                                      side="top"
                                      sideOffset={6}
                                      className="w-44 rounded-lg border border-border bg-card/95 px-3 py-2 text-xs text-foreground shadow-sm backdrop-blur"
                                    >
                                      <div className="space-y-1">
                                        {milestonesForDay.length > 0 && (
                                          <div className="border-b border-border/60 pb-1">
                                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                              {t`Milestones`}
                                            </div>
                                            <div className="mt-1 space-y-1">
                                              {milestonesForDay.map((milestone) => {
                                                const project = projectById.get(milestone.projectId);
                                                const color = project?.color ?? '#94a3b8';
                                                const dotColor = hexToRgba(color, 0.8) ?? color;
                                                return (
                                                  <div key={milestone.id} className="flex items-center gap-2">
                                                    <span
                                                      className="h-2 w-2 rounded-full"
                                                      style={{ backgroundColor: dotColor }}
                                                    />
                                                    <div className="min-w-0">
                                                      <div className="truncate">{milestone.title}</div>
                                                      <div className="text-[10px] text-muted-foreground truncate">
                                                        {project
                                                          ? formatProjectLabel(project.name, project.code)
                                                          : t`Project`}
                                                      </div>
                                                    </div>
                                                  </div>
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
                                        {holidayNames.length > 0 && (
                                          <div className="border-t border-border/60 pt-1 text-[11px] text-muted-foreground">
                                            <span className="text-foreground">{t`Holiday:`}</span>{' '}
                                            {holidayNames.join(', ')}
                                          </div>
                                        )}
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <div className="h-7 w-7" />
                                )}
                              </div>
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
            'absolute bottom-4 right-4 shadow-md transition-all duration-200 ease-out',
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
        </div>

        <MilestoneDialog
          open={milestoneDialogOpen}
          onOpenChange={handleMilestoneDialogChange}
          date={milestoneDialogDate}
          milestone={editingMilestone}
          canEdit={canEdit}
          allowDateEdit={Boolean(editingMilestone)}
        />
      </TooltipProvider>
    </div>
  );
};
