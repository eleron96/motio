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
  isMobile?: boolean;
  attentionDate: string | null;
  todayKey: string;
  holidayDates?: Set<string>;
  onDateContextAction?: (date: string) => void;
}

export const TimelineHeader: React.FC<TimelineHeaderProps> = ({
  visibleDays,
  dayWidth,
  viewMode,
  isMobile = false,
  attentionDate,
  todayKey,
  holidayDates,
  onDateContextAction,
}) => {
  const locale = useLocaleStore((state) => state.locale);
  const dateLocale = React.useMemo(() => resolveDateFnsLocale(locale), [locale]);

  const totalWidth = visibleDays.length * dayWidth;

  return (
    <div className="relative select-none" style={{ width: totalWidth }}>
      {/* Day row (month context lives in the toolbar's scroll-aware label) */}
      <div className="flex h-14">
        {visibleDays.map((day, index) => {
          const { day: dayName, date } = formatDayHeader(day, viewMode, dateLocale, locale);
          const dayKey = format(day, 'yyyy-MM-dd');
          const today = dayKey === todayKey;
          const weekend = isWeekend(day);
          const nextDay = visibleDays[index + 1];
          const adjacentWeekend = weekend && nextDay !== undefined && isWeekend(nextDay);
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
                    adjacentWeekend && 'border-r-foreground/20',
                    isHoliday && 'holiday-hatch',
                    today && 'today-hatch',
                    onDateContextAction && 'cursor-context-menu',
                  )}
                  style={{ width: dayWidth }}
                  onDoubleClick={
                    isMobile && onDateContextAction
                      ? () => onDateContextAction(dayKey)
                      : undefined
                  }
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
