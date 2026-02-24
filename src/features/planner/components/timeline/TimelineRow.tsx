import React, { useCallback, useState } from 'react';
import { format } from 'date-fns';
import { isWeekend } from '@/features/planner/lib/dateUtils';
import { ViewMode } from '@/features/planner/types/planner';
import { cn } from '@/shared/lib/classNames';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/shared/ui/context-menu';
import { t } from '@lingui/macro';

interface TimelineRowProps {
  rowId: string;
  rowIndex: number;
  visibleDays: Date[];
  dayWidth: number;
  viewMode: ViewMode;
  todayKey: string;
  height: number;
  children: React.ReactNode;
  canEdit?: boolean;
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
  height,
  children,
  canEdit = false,
  onCreateTask,
  onDateClick,
}) => {
  const [contextDate, setContextDate] = useState<string | null>(null);

  const getDateFromEvent = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const index = Math.floor(offsetX / dayWidth);
    if (index < 0 || index >= visibleDays.length) return null;
    return format(visibleDays[index], 'yyyy-MM-dd');
  }, [dayWidth, visibleDays]);

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

  return (
    <div 
      className="relative border-b border-border box-border"
      style={{ height }}
    >
      {/* Grid background */}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className="absolute inset-0 flex"
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onContextMenu={handleContextMenu}
          >
            {visibleDays.map((day, index) => {
              const dayKey = format(day, 'yyyy-MM-dd');
              const today = dayKey === todayKey;
              const weekend = isWeekend(day);
              
              return (
                <div
                  key={index}
                  className={cn(
                    'h-full border-r border-timeline-grid transition-colors relative',
                    weekend && 'bg-timeline-weekend/50',
                    today && 'today-hatch'
                  )}
                  style={{ width: dayWidth }}
                />
              );
            })}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            disabled={!canEdit || !contextDate || !onCreateTask}
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
  && prev.height === next.height
  && prev.children === next.children
  && prev.canEdit === next.canEdit
  && prev.onCreateTask === next.onCreateTask
  && prev.onDateClick === next.onDateClick
);

export const TimelineRow = React.memo(TimelineRowBase, areTimelineRowPropsEqual);
TimelineRow.displayName = 'TimelineRow';
