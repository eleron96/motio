import React, { useCallback, useRef, useState } from 'react';
import { format } from 'date-fns';
import { isWeekend, shouldApplyHolidayHatch } from '@/features/planner/lib/dateUtils';
import { shouldShadeTimeOffDay } from '@/features/planner/lib/timeOff';
import { TimeOff, ViewMode } from '@/features/planner/types/planner';
import type { TimeOffMotifId } from '@/features/planner/lib/timeOffMotifs';
import { cn } from '@/shared/lib/classNames';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/shared/ui/context-menu';
import { t } from '@lingui/macro';
import { useIsMobile } from '@/shared/hooks/use-mobile';

interface TimelineRowProps {
  rowId: string;
  rowIndex: number;
  visibleDays: Date[];
  dayWidth: number;
  viewMode: ViewMode;
  todayKey: string;
  holidayDates?: Set<string>;
  /** dayKey -> the time-off record covering it, for THIS row only. */
  timeOffDays?: Map<string, TimeOff>;
  /**
   * Decorative stamp for this person's time-off days. Absent when the row has no
   * record — the CSS body hangs off the attribute, so no attribute means no
   * pseudo-element at all.
   */
  timeOffMotif?: TimeOffMotifId;
  height: number;
  children: React.ReactNode;
  /** May open the create dialog by double-click (task editing OR marking time off). */
  canEdit?: boolean;
  /** May create a TASK specifically — gates the context-menu item. */
  canCreateTask?: boolean;
  onCreateTask?: (date: string, rowId: string) => void;
  onDateClick?: (date: string, rowId: string) => boolean | void;
}

const TimelineRowBase: React.FC<TimelineRowProps> = ({
  rowId,
  rowIndex,
  visibleDays,
  dayWidth,
  viewMode,
  todayKey,
  holidayDates,
  timeOffDays,
  timeOffMotif,
  height,
  children,
  canEdit = false,
  canCreateTask,
  onCreateTask,
  onDateClick,
}) => {
  const [contextDate, setContextDate] = useState<string | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const tapStartRef = useRef<{ x: number; y: number } | null>(null);
  const isMobile = useIsMobile();

  const getDateAtClientX = useCallback((element: Element, clientX: number) => {
    const rect = element.getBoundingClientRect();
    const offsetX = clientX - rect.left;
    const index = Math.floor(offsetX / dayWidth);
    if (index < 0 || index >= visibleDays.length) return null;
    return format(visibleDays[index], 'yyyy-MM-dd');
  }, [dayWidth, visibleDays]);

  const getDateFromEvent = useCallback((event: React.MouseEvent<HTMLDivElement>) => (
    getDateAtClientX(event.currentTarget, event.clientX)
  ), [getDateAtClientX]);

  const handleDoubleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!canEdit || !onCreateTask) return;
    const date = getDateFromEvent(event);
    if (!date) return;
    // Double click on a row cell is reserved for task creation only.
    // Milestone open/pick flow is handled by single-click/header milestone overlays.
    onCreateTask(date, rowId);
  }, [canEdit, getDateFromEvent, onCreateTask, rowId]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const date = getDateFromEvent(event);
    if (!date) return;
    onDateClick?.(date, rowId);
  }, [getDateFromEvent, onDateClick, rowId]);

  const handleContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const date = getDateFromEvent(event);
    setContextDate(date);
  }, [getDateFromEvent]);

  // Mobile Safari/Chrome often suppress `onDoubleClick` for touch input, so
  // we detect double-tap manually: two taps within 300ms, close in space, with
  // no significant movement between touchstart and touchend (which would be a
  // scroll gesture, not a tap).
  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    tapStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchEnd = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const start = tapStartRef.current;
    tapStartRef.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;
    if (Math.abs(touch.clientX - start.x) > 10 || Math.abs(touch.clientY - start.y) > 10) {
      lastTapRef.current = null;
      return;
    }
    const now = Date.now();
    const prev = lastTapRef.current;
    if (
      canEdit
      && onCreateTask
      && prev
      && now - prev.time < 300
      && Math.abs(prev.x - touch.clientX) < 40
      && Math.abs(prev.y - touch.clientY) < 40
    ) {
      lastTapRef.current = null;
      const date = getDateAtClientX(event.currentTarget, touch.clientX);
      if (!date) return;
      event.preventDefault();
      onCreateTask(date, rowId);
      return;
    }
    lastTapRef.current = { time: now, x: touch.clientX, y: touch.clientY };
  }, [canEdit, getDateAtClientX, onCreateTask, rowId]);

  return (
    // The motif attribute sits on the row root, the common ancestor of the day
    // cells and the bar layer, so one declaration paints every covered day.
    <div
      className="relative border-b border-border box-border"
      data-time-off-motif={timeOffMotif}
      style={{ height }}
    >
      {/* Grid background */}
      <ContextMenu>
        {/* Mobile: no long-press "create task" menu (double-tap creates a task
            instead). Disabling the trigger stops Radix opening it on long-press. */}
        <ContextMenuTrigger asChild disabled={isMobile}>
          <div
            className="absolute inset-0 flex"
            style={{ touchAction: 'manipulation' }}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onContextMenu={isMobile ? undefined : handleContextMenu}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {visibleDays.map((day, index) => {
              const dayKey = format(day, 'yyyy-MM-dd');
              const today = dayKey === todayKey;
              const weekend = isWeekend(day);
              const nextDay = visibleDays[index + 1];
              const adjacentWeekend = weekend && nextDay !== undefined && isWeekend(nextDay);
              const isHoliday = shouldApplyHolidayHatch(dayKey, weekend, holidayDates);
              // Time off shades WORKING days only: a weekend or a holiday inside
              // the period is already non-working, so graphically it says
              // nothing and would fight the existing hatch.
              const isTimeOff = shouldShadeTimeOffDay(
                timeOffDays?.has(dayKey) ?? false,
                weekend,
                isHoliday,
              );

              return (
                <div
                  key={index}
                  data-day-key={dayKey}
                  data-time-off-shaded={isTimeOff ? 'true' : undefined}
                  className={cn(
                    'h-full border-r border-timeline-grid transition-colors relative',
                    weekend && 'bg-timeline-weekend/50',
                    adjacentWeekend && 'border-r-foreground/20',
                    isHoliday && 'holiday-hatch',
                    today && 'today-hatch',
                    isTimeOff && 'time-off-band'
                  )}
                  style={{ width: dayWidth }}
                />
              );
            })}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            disabled={!(canCreateTask ?? canEdit) || !contextDate || !onCreateTask}
            onSelect={() => {
              if (!contextDate || !onCreateTask) return;
              onCreateTask(contextDate, rowId);
            }}
          >
            {t`Create task`}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      
      {/* Task bars container */}
      <div className="absolute inset-0 py-2 px-0.5 pointer-events-none">
        {children}
      </div>
    </div>
  );
};

const areTimelineRowPropsEqual = (prev: TimelineRowProps, next: TimelineRowProps) => (
  prev.rowId === next.rowId
  && prev.rowIndex === next.rowIndex
  && prev.visibleDays === next.visibleDays
  && prev.dayWidth === next.dayWidth
  && prev.viewMode === next.viewMode
  && prev.todayKey === next.todayKey
  && prev.holidayDates === next.holidayDates
  && prev.timeOffDays === next.timeOffDays
  && prev.timeOffMotif === next.timeOffMotif
  && prev.height === next.height
  && prev.children === next.children
  && prev.canEdit === next.canEdit
  && prev.canCreateTask === next.canCreateTask
  && prev.onCreateTask === next.onCreateTask
  && prev.onDateClick === next.onDateClick
);

export const TimelineRow = React.memo(TimelineRowBase, areTimelineRowPropsEqual);
TimelineRow.displayName = 'TimelineRow';
