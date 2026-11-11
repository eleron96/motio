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
import { useAuthStore } from '@/features/auth/store/authStore';
import { isWeekNumbersEnabled, weekNumberForColumn } from '@/features/planner/lib/weekNumbersPreference';

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

const TimelineHeaderBase: React.FC<TimelineHeaderProps> = ({
  visibleDays,
  dayWidth,
  viewMode,
  attentionDate,
  todayKey,
  holidayDates,
  onDateContextAction,
}) => {
  const locale = useLocaleStore((state) => state.locale);
  const dateLocale = React.useMemo(() => resolveDateFnsLocale(locale), [locale]);
  // Read here, not in TimelineGrid: a boolean selector keeps the grid's props
  // (and this component's memo) untouched for everyone who has it off.
  const showWeekNumbers = useAuthStore((state) => isWeekNumbersEnabled(state.profilePreferences));

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
          const weekNumber = showWeekNumbers ? weekNumberForColumn(day) : null;

          // Keyed by the day, like the row cells: see TimelineRow.
          return (
            <ContextMenu key={day.getTime()}>
              <ContextMenuTrigger asChild>
                <div
                  data-day-key={dayKey}
                  className={cn(
                    'relative flex flex-col items-center justify-center border-r border-border py-2 gap-1',
                    weekend && 'bg-timeline-weekend',
                    adjacentWeekend && 'border-r-foreground/20',
                    isHoliday && 'holiday-hatch',
                    today && 'today-hatch',
                    onDateContextAction && 'cursor-context-menu',
                  )}
                  style={{ width: dayWidth }}
                  onDoubleClick={
                    onDateContextAction
                      ? () => onDateContextAction(dayKey)
                      : undefined
                  }
                >
                  {weekNumber !== null && (
                    // Sits in the free strip above the weekday; never wraps, so in
                    // the narrow Week view it runs over the next column instead.
                    <span
                      data-week-number={weekNumber}
                      className="pointer-events-none absolute left-1 top-px whitespace-nowrap text-[10px] font-medium leading-none text-muted-foreground"
                    >
                      {t`CW ${weekNumber}`}
                    </span>
                  )}
                  <span className={cn(
                    'text-xs uppercase tracking-wide leading-none',
                    // A weekend column is darker than the rest: the muted grey
                    // is too faint on it.
                    today ? 'text-rose-700 font-semibold' : weekend ? 'text-foreground/75' : 'text-muted-foreground'
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

// The grid re-renders on every horizontal-scroll tick (focus-day changes). Its
// props are stable across a scroll (visibleDays/dayWidth/holidayDates are memoized,
// the callback is useCallback), so memoizing lets React skip rebuilding all ~122
// day cells and their Radix context menus on each tick.
export const TimelineHeader = React.memo(TimelineHeaderBase);
TimelineHeader.displayName = 'TimelineHeader';
