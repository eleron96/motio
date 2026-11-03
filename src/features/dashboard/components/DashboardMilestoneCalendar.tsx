import React from 'react';
import {
  addDays,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  isWithinInterval,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { t } from '@lingui/macro';
import { cn } from '@/shared/lib/classNames';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/ui/tooltip';
import { useLocaleStore } from '@/shared/store/localeStore';
import { formatWeekdayLabel, resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';
import { DEFAULT_NEUTRAL_COLOR } from '@/shared/lib/colors';
import type {
  DashboardMilestone,
  DashboardMilestoneCalendarMode,
  DashboardOption,
  DashboardWidgetSize,
} from '@/features/dashboard/types/dashboard';

interface DashboardMilestoneCalendarProps {
  milestones: DashboardMilestone[];
  projects: DashboardOption[];
  /** The current month, or a rolling five weeks from this one. */
  calendarMode: DashboardMilestoneCalendarMode;
  size: DashboardWidgetSize;
  gapClass: string;
}

/** A month grid with a dot per milestone in its project's colour; hover lists the day's milestones. */
export const DashboardMilestoneCalendar: React.FC<DashboardMilestoneCalendarProps> = ({
  milestones,
  projects,
  calendarMode,
  size,
  gapClass,
}) => {
  const locale = useLocaleStore((state) => state.locale);
  const dateLocale = React.useMemo(() => resolveDateFnsLocale(locale), [locale]);
  const isSmall = size === 'small';
  const projectNameById = new Map(
    projects.map((project) => [project.id, formatProjectLabel(project.name, project.code)]),
  );
  const projectColorById = new Map(
    projects.map((project) => [project.id, project.color ?? DEFAULT_NEUTRAL_COLOR]),
  );
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const calendarStart = calendarMode === 'month'
    ? startOfWeek(monthStart, { weekStartsOn: 1 })
    : startOfWeek(now, { weekStartsOn: 1 });
  const calendarEnd = calendarMode === 'month'
    ? endOfWeek(monthEnd, { weekStartsOn: 1 })
    : endOfWeek(addWeeks(calendarStart, 4), { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const weekdayLabelStyle: 'narrow' | 'short' = isSmall ? 'narrow' : 'short';
  const weekdayLabels = Array.from({ length: 7 }, (_, index) => (
    formatWeekdayLabel(addDays(calendarStart, index), locale, { style: weekdayLabelStyle, dateLocale })
  ));
  const calendarLabel = calendarMode === 'month'
    ? format(monthStart, 'LLLL yyyy', { locale: dateLocale })
    : `${format(calendarStart, 'MMM d', { locale: dateLocale })} - ${format(calendarEnd, 'MMM d', { locale: dateLocale })}`;
  const milestonesByDate = milestones.reduce((map, milestone) => {
    const list = map.get(milestone.date) ?? [];
    list.push(milestone);
    map.set(milestone.date, list);
    return map;
  }, new Map<string, DashboardMilestone[]>());
  const milestonesInCalendar = milestones.filter((milestone) => (
    isWithinInterval(parseISO(milestone.date), { start: calendarStart, end: calendarEnd })
  ));

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn('flex h-full min-h-0 flex-col', gapClass)}>
        <div className={cn('flex items-center justify-between text-muted-foreground', isSmall ? 'text-[10px]' : 'text-xs')}>
          <span className={cn('truncate', isSmall && 'max-w-[120px]')}>{calendarLabel}</span>
          {!isSmall && <span>{t`${milestonesInCalendar.length} milestones`}</span>}
        </div>
        <div className={cn('grid grid-cols-7', isSmall ? 'text-[9px]' : 'text-[10px]')}>
          {weekdayLabels.map((label, index) => (
            <div
              key={format(addDays(calendarStart, index), 'yyyy-MM-dd')}
              className="text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>
        <div
          className={cn('grid grid-cols-7 flex-1 min-h-0', isSmall ? 'gap-0.5' : 'gap-1')}
          style={{ gridAutoRows: '1fr' }}
        >
          {calendarDays.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const dayMilestones = milestonesByDate.get(key) ?? [];
            const dayColors = dayMilestones.map(
              (milestone) => projectColorById.get(milestone.projectId) ?? DEFAULT_NEUTRAL_COLOR,
            );
            const maxDots = isSmall ? 2 : size === 'medium' ? 3 : 4;
            const visibleColors = dayColors.slice(0, maxDots);
            const moreCount = dayColors.length - visibleColors.length;
            const isOutsideMonth = calendarMode === 'month' && !isSameMonth(day, monthStart);
            const dayCell = (
              <div
                className={cn(
                  'rounded-md border border-transparent leading-none',
                  isSmall ? 'p-0.5 text-[9px]' : 'p-1 text-[11px]',
                  isOutsideMonth && 'text-muted-foreground/50',
                  isToday(day) && 'border-primary text-primary',
                )}
              >
                <div className={cn(isSmall ? 'text-[9px]' : 'text-[11px]')}>
                  {format(day, 'd')}
                </div>
                {dayMilestones.length > 0 && (
                  <div className={cn('flex items-center gap-1', isSmall ? 'mt-0.5' : 'mt-1')}>
                    {visibleColors.map((color, index) => (
                      <span
                        key={`${key}-dot-${index}`}
                        className={cn('rounded-full', isSmall ? 'h-1 w-1' : 'h-1.5 w-1.5')}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    {moreCount > 0 && (
                      <span className="text-[9px] text-muted-foreground">+{moreCount}</span>
                    )}
                  </div>
                )}
              </div>
            );

            if (dayMilestones.length === 0) {
              return React.cloneElement(dayCell, { key });
            }

            return (
              <Tooltip key={key}>
                <TooltipTrigger asChild>
                  {dayCell}
                </TooltipTrigger>
                <TooltipContent side="top" align="start" className="max-w-xs p-2 text-xs">
                  <div className="grid gap-1">
                    {dayMilestones.map((milestone) => {
                      const projectName = projectNameById.get(milestone.projectId) ?? t`No project`;
                      const projectColor = projectColorById.get(milestone.projectId) ?? DEFAULT_NEUTRAL_COLOR;
                      return (
                        <div key={milestone.id} className="flex items-start gap-2">
                          <span
                            className="mt-1 h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: projectColor }}
                          />
                          <div className="min-w-0">
                            <div className="truncate text-xs font-medium text-foreground">
                              {milestone.title}
                            </div>
                            <div className="truncate text-[10px] text-muted-foreground">
                              {projectName}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
};
