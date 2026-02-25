import React from 'react';
import { format } from 'date-fns';
import { isWeekend, formatDayHeader, shouldApplyHolidayHatch } from '@/features/planner/lib/dateUtils';
import { ViewMode } from '@/features/planner/types/planner';
import { cn } from '@/shared/lib/classNames';
import { useLocaleStore } from '@/shared/store/localeStore';
import { resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/shared/ui/context-menu';
import { t } from '@lingui/macro';

interface TimelineHeaderProps {
  visibleDays: Date[];
  dayWidth: number;
  viewMode: ViewMode;
  scrollLeft: number;
  viewportWidth: number;
  attentionDate: string | null;
  todayKey: string;
  holidayDates?: Set<string>;
  onDateContextAction?: (date: string) => void;
}

export const TimelineHeader: React.FC<TimelineHeaderProps> = ({
  visibleDays,
  dayWidth,
  viewMode,
  scrollLeft,
  viewportWidth,
  attentionDate,
  todayKey,
  holidayDates,
  onDateContextAction,
}) => {
  const locale = useLocaleStore((state) => state.locale);
  const dateLocale = React.useMemo(() => resolveDateFnsLocale(locale), [locale]);

  // Group days by month for month labels
  const monthGroups = React.useMemo(() => {
    const groups: { month: string; days: number; startIndex: number }[] = [];
    let currentMonth = '';
    let currentCount = 0;
    let startIndex = 0;
    
    visibleDays.forEach((day, index) => {
      const monthKey = format(day, 'MMMM yyyy', { locale: dateLocale });
      if (monthKey !== currentMonth) {
        if (currentMonth) {
          groups.push({ month: currentMonth, days: currentCount, startIndex });
        }
        currentMonth = monthKey;
        currentCount = 1;
        startIndex = index;
      } else {
        currentCount++;
      }
    });
    
    if (currentMonth) {
      groups.push({ month: currentMonth, days: currentCount, startIndex });
    }
    
    return groups;
  }, [visibleDays, dateLocale]);

  const totalWidth = visibleDays.length * dayWidth;
  const activeMonth = React.useMemo(() => {
    if (visibleDays.length === 0) return '';
    if (!dayWidth) return format(visibleDays[0], 'MMMM yyyy', { locale: dateLocale });
    const centerPx = scrollLeft + viewportWidth / 2;
    const centerIndex = Math.min(
      visibleDays.length - 1,
      Math.max(0, Math.floor(centerPx / dayWidth))
    );
    return format(visibleDays[centerIndex], 'MMMM yyyy', { locale: dateLocale });
  }, [visibleDays, dayWidth, scrollLeft, viewportWidth, dateLocale]);

  const labelLeft = Math.min(
    totalWidth,
    Math.max(0, scrollLeft + viewportWidth / 2)
  );
  
  return (
    <div className="relative select-none" style={{ width: totalWidth }}>
      {/* Month row */}
      <div className="flex h-10 bg-timeline-header border-b border-border">
        {monthGroups.map((group) => (
          <div
            key={`${group.month}-${group.startIndex}`}
            className="flex items-center px-2 border-r border-border"
            style={{ width: group.days * dayWidth }}
          >
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">
              {group.month}
            </span>
          </div>
        ))}
      </div>

      {activeMonth && viewportWidth > 0 && (
        <div
          className="pointer-events-none absolute top-0 z-10 flex h-10 items-center"
          style={{ left: labelLeft, transform: 'translateX(-50%)' }}
        >
          <span className="rounded-full bg-background/80 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-foreground/80 shadow-sm backdrop-blur">
            {activeMonth}
          </span>
        </div>
      )}
      
      {/* Day row */}
      <div className="flex h-14">
        {visibleDays.map((day, index) => {
          const { day: dayName, date } = formatDayHeader(day, viewMode, dateLocale, locale);
          const dayKey = format(day, 'yyyy-MM-dd');
          const today = dayKey === todayKey;
          const weekend = isWeekend(day);
          const isHoliday = shouldApplyHolidayHatch(dayKey, weekend, holidayDates);
          const isAttentionDay = attentionDate === dayKey;
          
          return (
            <ContextMenu key={index}>
              <ContextMenuTrigger asChild>
                <div
                  data-day-key={dayKey}
                  className={cn(
                    'flex flex-col items-center justify-center border-r border-border transition-colors py-2 gap-1',
                    weekend && 'bg-timeline-weekend',
                    isHoliday && 'holiday-hatch',
                    today && 'today-hatch',
                    onDateContextAction && 'cursor-context-menu',
                  )}
                  style={{ width: dayWidth }}
                >
                  <span className={cn(
                    'text-xs uppercase tracking-wide leading-none',
                    today ? 'text-rose-700 font-semibold' : 'text-muted-foreground'
                  )}>
                    {dayName}
                  </span>
                  <span className={cn(
                    'inline-flex items-center justify-center text-lg font-medium leading-none',
                    today ? 'text-rose-700' : 'text-foreground'
                  )}>
                    <span className={cn(
                      'inline-flex items-center justify-center',
                      today && 'rounded-full bg-rose-100/80 px-2.5 py-0.5',
                      isAttentionDay && 'timeline-date-attention rounded-full px-2.5 py-0.5'
                    )}>
                      {date}
                    </span>
                  </span>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem
                  disabled={!onDateContextAction}
                  onSelect={() => onDateContextAction?.(dayKey)}
                >
                  {t`Create milestone`}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>
    </div>
  );
};
