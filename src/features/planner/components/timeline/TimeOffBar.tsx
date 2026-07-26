import React, { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '@lingui/macro';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/classNames';
import {
  calculateNewDates,
  calculateResizedDates,
  formatDateRange,
  ROW_TOP_PADDING,
  TASK_HEIGHT,
} from '@/features/planner/lib/dateUtils';
import { findTimeOffConflict } from '@/features/planner/lib/timeOff';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';
import { useLocaleStore } from '@/shared/store/localeStore';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import type { TimeOff } from '@/features/planner/types/planner';

export interface TimeOffBarProps {
  record: TimeOff;
  position: { left: number; width: number };
  dayWidth: number;
  /** The person's other records — the overlap guard checks against these. */
  siblings?: TimeOff[];
  /** True when the viewer may edit this record (own record, or workspace admin). */
  canEditOwn: boolean;
  onOpenDetail?: (id: string) => void;
}

type Gesture = {
  mode: 'move' | 'left' | 'right';
  startX: number;
  // The period is frozen at mousedown ON PURPOSE. `record` carries the live
  // drag preview (buildTimeOffIndex applies it), so deriving the pending period
  // from the prop would re-base it every render and the bar would run away.
  baseStart: string;
  baseEnd: string;
};

const periodFor = (gesture: Gesture, daysDelta: number) => (
  gesture.mode === 'move'
    ? calculateNewDates(gesture.baseStart, gesture.baseEnd, daysDelta)
    : calculateResizedDates(gesture.baseStart, gesture.baseEnd, gesture.mode, daysDelta)
);

/**
 * The "Отметить выходной" bar. Always sits on lane 0 — first in the row, above
 * every task bar — and never goes through calculateTaskLanes, so task packing is
 * unchanged and only the row height grows by one lane.
 *
 * Drag and resize mirror TaskBar: mouse only (touch devices edit through the
 * dialog), window listeners, commit inside mouse-up. While the gesture runs the
 * pending period lives in the store as `timeOffDragPreview`, so the grey cell
 * shading in TimelineRow moves together with the bar.
 */
const TimeOffBarBase: React.FC<TimeOffBarProps> = ({
  record,
  position,
  dayWidth,
  siblings,
  canEditOwn,
  onOpenDetail,
}) => {
  const locale = useLocaleStore((state) => state.locale);
  const isMobile = useIsMobile();
  const updateTimeOff = usePlannerStore((state) => state.updateTimeOff);
  const setTimeOffDragPreview = usePlannerStore((state) => state.setTimeOffDragPreview);

  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [daysDelta, setDaysDelta] = useState(0);
  // Refs, not state: mouse-up must read the values of the CURRENT gesture, and
  // the trailing click must still know whether the pointer actually moved.
  const daysDeltaRef = useRef(0);
  const movedRef = useRef(false);
  const siblingsRef = useRef(siblings);
  siblingsRef.current = siblings;

  const dateLocale = resolveDateFnsLocale(locale);
  const range = formatDateRange(record.startDate, record.endDate, dateLocale);
  const label = t`Mark time off`;
  const title = record.note ? `${label} · ${range} · ${record.note}` : `${label} · ${range}`;
  const canDrag = canEditOwn && !isMobile;

  const commit = useCallback(async (startDate: string, endDate: string) => {
    if (findTimeOffConflict({ id: record.id, startDate, endDate }, siblingsRef.current ?? [])) {
      toast.error(t`These days are already marked as time off.`);
      return;
    }
    const result = await updateTimeOff(record.id, { startDate, endDate });
    if (result.error) {
      toast.error(result.code === 'overlap'
        ? t`These days are already marked as time off.`
        : t`Failed to save the time off.`);
    }
  }, [record.id, updateTimeOff]);

  const handleMouseDown = useCallback((event: React.MouseEvent, mode: Gesture['mode']) => {
    if (!canDrag) return;
    if (event.button !== 0) return;
    event.preventDefault();
    // Without this the timeline surface starts a drag-scroll under the cursor.
    event.stopPropagation();
    movedRef.current = false;
    daysDeltaRef.current = 0;
    setDaysDelta(0);
    setGesture({
      mode,
      startX: event.clientX,
      baseStart: record.startDate,
      baseEnd: record.endDate,
    });
  }, [canDrag, record.endDate, record.startDate]);

  useEffect(() => {
    if (!gesture) return;

    const handleMouseMove = (event: MouseEvent) => {
      const deltaX = event.clientX - gesture.startX;
      if (Math.abs(deltaX) > 3) movedRef.current = true;
      // Whole days only: the store preview changes when the day changes, not on
      // every pixel, so the index is rebuilt a handful of times per gesture.
      const nextDelta = Math.round(deltaX / dayWidth);
      if (nextDelta === daysDeltaRef.current) return;
      daysDeltaRef.current = nextDelta;
      setDaysDelta(nextDelta);
    };

    // Commit here, where the gesture and its delta are still live — a follow-up
    // effect would run after setGesture(null) has already erased them.
    const handleMouseUp = () => {
      const delta = daysDeltaRef.current;
      const moved = movedRef.current;
      setGesture(null);
      setDaysDelta(0);
      daysDeltaRef.current = 0;
      setTimeOffDragPreview(null);
      if (!moved || delta === 0) return;
      const period = periodFor(gesture, delta);
      void commit(period.startDate, period.endDate);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [commit, dayWidth, gesture, setTimeOffDragPreview]);

  // Mirror the pending period into the store so the day shading follows the bar.
  useEffect(() => {
    if (!gesture) return;
    setTimeOffDragPreview(
      daysDelta === 0 ? null : { id: record.id, ...periodFor(gesture, daysDelta) },
    );
  }, [daysDelta, gesture, record.id, setTimeOffDragPreview]);

  // Unmounting mid-gesture (window switch, filter change) must not leave a
  // dangling preview that shades days forever.
  useEffect(() => () => setTimeOffDragPreview(null), [setTimeOffDragPreview]);

  const interactive = canEditOwn && Boolean(onOpenDetail);

  return (
    <div
      data-testid={`timeline-time-off-${record.id}`}
      data-time-off-id={record.id}
      title={title}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onMouseDown={canDrag ? (event) => handleMouseDown(event, 'move') : undefined}
      onClick={interactive
        ? (event) => {
          event.stopPropagation();
          // A drag that moved the bar must not also open the dialog.
          if (movedRef.current || gesture) return;
          onOpenDetail?.(record.id);
        }
        : undefined}
      onKeyDown={interactive
        ? (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          event.stopPropagation();
          onOpenDetail?.(record.id);
        }
        : undefined}
      className={cn(
        'time-off-bar absolute flex flex-col justify-center overflow-hidden rounded-md border border-border',
        'bg-muted/80 px-2 text-muted-foreground select-none pointer-events-auto',
        interactive && 'cursor-pointer hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        gesture && 'z-50 opacity-90',
      )}
      style={{
        left: position.left,
        width: position.width,
        top: ROW_TOP_PADDING,
        height: TASK_HEIGHT,
      }}
    >
      {canDrag && (
        <div
          className="resize-handle left-0 hover:bg-black/20"
          onMouseDown={(event) => handleMouseDown(event, 'left')}
        />
      )}

      <span className="truncate text-ui-sm font-medium leading-tight">{label}</span>
      <span className="truncate text-ui-xs leading-tight opacity-80">
        {record.note ? `${range} · ${record.note}` : range}
      </span>

      {canDrag && (
        <div
          className="resize-handle right-0 hover:bg-black/20"
          onMouseDown={(event) => handleMouseDown(event, 'right')}
        />
      )}
    </div>
  );
};

const arePropsEqual = (prev: TimeOffBarProps, next: TimeOffBarProps) => (
  prev.record === next.record
  && prev.position.left === next.position.left
  && prev.position.width === next.position.width
  && prev.dayWidth === next.dayWidth
  && prev.canEditOwn === next.canEditOwn
  && prev.onOpenDetail === next.onOpenDetail
  && prev.siblings === next.siblings
);

export const TimeOffBar = React.memo(TimeOffBarBase, arePropsEqual);
TimeOffBar.displayName = 'TimeOffBar';
