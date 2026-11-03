import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { calculateNewDates, calculateResizedDates } from '@/features/planner/lib/dateUtils';
import { computeDragDeltaDays, getEdgeScrollVelocity } from '@/features/planner/lib/dragAutoScroll';
import type { Task } from '@/features/planner/types/planner';
import { useTimelineDragScroll } from '../TimelineDragScrollContext';

interface UseTaskBarDragOptions {
  task: Task;
  position: { left: number; width: number };
  dayWidth: number;
  canEdit: boolean;
  isHighlighted: boolean;
  setSelectedTaskId: (taskId: string | null) => void;
  setHighlightedTaskId: (taskId: string | null) => void;
  requestMoveTask: (startDate: string, endDate: string) => void;
}

/**
 * Dragging a task bar to other days, or one of its ends to stretch it. The
 * timeline scrolls by itself while the cursor sits at its edge. A press that
 * never moved is a click and opens the task.
 */
export const useTaskBarDrag = ({
  task,
  position,
  dayWidth,
  canEdit,
  isHighlighted,
  setSelectedTaskId,
  setHighlightedTaskId,
  requestMoveTask,
}: UseTaskBarDragOptions) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<'left' | 'right' | null>(null);
  // Visual offset of the bar (px) while dragging/resizing: mouse travel plus
  // whatever the timeline scrolled underneath since the press.
  const [dragOffsetX, setDragOffsetX] = useState(0);
  // Live drag bookkeeping kept out of React state so the document listeners
  // and the auto-scroll frame loop are registered once per drag, not per move.
  const dragStateRef = useRef({
    startX: 0,
    startScrollLeft: 0,
    lastClientX: 0,
    x: 0,
    moved: false,
  });
  const autoScrollFrameRef = useRef<number | null>(null);
  const dragScroll = useTimelineDragScroll();

  const handleMouseDown = useCallback((e: React.MouseEvent, resize?: 'left' | 'right') => {
    if (!canEdit) return;
    if (e.button !== 0) return;
    // Mid rapid pan the bar slid under the cursor: let the press bubble to the
    // grid and keep scrolling. Resize handles are too narrow to hit by accident.
    if (!resize && dragScroll.isPanGraceActive()) return;
    e.preventDefault();
    e.stopPropagation();

    if (resize) {
      setIsResizing(resize);
    } else {
      setIsDragging(true);
    }

    dragStateRef.current = {
      startX: e.clientX,
      startScrollLeft: dragScroll.getScrollContainer()?.scrollLeft ?? 0,
      lastClientX: e.clientX,
      x: 0,
      moved: false,
    };
    setDragOffsetX(0);
  }, [canEdit, dragScroll]);

  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const container = dragScroll.getScrollContainer();

    // Recompute the bar offset from the latest mouse position and scroll.
    const syncOffset = () => {
      const state = dragStateRef.current;
      const scrollDelta = container ? container.scrollLeft - state.startScrollLeft : 0;
      state.x = (state.lastClientX - state.startX) + scrollDelta;
      setDragOffsetX(state.x);
    };

    const stopAutoScroll = () => {
      if (autoScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(autoScrollFrameRef.current);
        autoScrollFrameRef.current = null;
      }
    };

    // Edge auto-scroll: while the cursor sits in a strip at either side of the
    // date area, push the container a little every frame. Stops by itself when
    // the cursor leaves the strip or the container runs out of range.
    const autoScrollTick = () => {
      autoScrollFrameRef.current = null;
      const state = dragStateRef.current;
      const bounds = dragScroll.getViewportBounds();
      if (!container || !bounds || !state.moved) return;
      const velocity = getEdgeScrollVelocity(state.lastClientX, bounds);
      dragScroll.setTaskDragState({
        active: true,
        edge: velocity < 0 ? 'left' : velocity > 0 ? 'right' : null,
      });
      if (velocity === 0) return;
      const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
      const next = Math.min(maxScroll, Math.max(0, container.scrollLeft + velocity));
      if (next === container.scrollLeft) return;
      container.scrollLeft = next;
      syncOffset();
      autoScrollFrameRef.current = window.requestAnimationFrame(autoScrollTick);
    };

    const scheduleAutoScroll = () => {
      if (!container || autoScrollFrameRef.current !== null) return;
      autoScrollFrameRef.current = window.requestAnimationFrame(autoScrollTick);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const state = dragStateRef.current;
      state.lastClientX = e.clientX;
      if (!state.moved && Math.abs(e.clientX - state.startX) > 3) {
        state.moved = true;
        dragScroll.setTaskDragState({ active: true, edge: null });
      }
      syncOffset();
      if (state.moved) scheduleAutoScroll();
    };

    const handleMouseUp = () => {
      stopAutoScroll();
      const { x, moved } = dragStateRef.current;
      const daysDelta = computeDragDeltaDays(x, 0, dayWidth);

      if (daysDelta !== 0) {
        if (isResizing) {
          const { startDate, endDate } = calculateResizedDates(
            task.startDate,
            task.endDate,
            isResizing,
            daysDelta
          );
          requestMoveTask(startDate, endDate);
        } else {
          const { startDate, endDate } = calculateNewDates(
            task.startDate,
            task.endDate,
            daysDelta
          );
          requestMoveTask(startDate, endDate);
        }
      }

      // Only open panel on clean click (no movement)
      if (!moved && !isResizing) {
        setSelectedTaskId(task.id);
        if (isHighlighted) {
          setHighlightedTaskId(null);
        }
      }

      dragScroll.setTaskDragState({ active: false, edge: null });
      setIsDragging(false);
      setIsResizing(null);
      setDragOffsetX(0);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    // Wheel or trackpad scrolling mid-drag moves the grid under the bar too.
    container?.addEventListener('scroll', syncOffset);

    return () => {
      stopAutoScroll();
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      container?.removeEventListener('scroll', syncOffset);
    };
  }, [
    isDragging,
    isResizing,
    dayWidth,
    dragScroll,
    requestMoveTask,
    task,
    isHighlighted,
    setHighlightedTaskId,
    setSelectedTaskId,
  ]);

  // A bar unmounted mid-drag (task deleted, row re-grouped) must not leave the
  // grid believing a drag is still on.
  useEffect(() => () => {
    if (dragStateRef.current.moved) {
      dragScroll.setTaskDragState({ active: false, edge: null });
    }
  }, [dragScroll]);

  // Calculate visual position during drag
  const visualLeft = useMemo(() => (
    isDragging || isResizing === 'left'
      ? position.left + dragOffsetX
      : position.left
  ), [isDragging, isResizing, position.left, dragOffsetX]);

  const visualWidth = useMemo(() => {
    if (isResizing === 'left') return position.width - dragOffsetX;
    if (isResizing === 'right') return position.width + dragOffsetX;
    return position.width;
  }, [isResizing, position.width, dragOffsetX]);

  return { isDragging, isResizing, handleMouseDown, visualLeft, visualWidth };
};
