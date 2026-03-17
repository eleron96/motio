import React, { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { differenceInDays, format, isSameDay, parseISO } from 'date-fns';
import { ViewMode } from '@/features/planner/types/planner';

/** Number of full days shown to the left of the focused date. */
export const LEFT_CONTEXT_DAYS = 2;

const EDGE_REANCHOR_COOLDOWN_MS = 450;

interface UseTimelineScrollOptions {
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  sidebarViewportWidth: number;
  viewportWidth: number;
  currentDate: string;
  currentDateObj: Date;
  viewMode: ViewMode;
  dayWidth: number;
  visibleDays: Date[];
  highlightedTaskId: string | null;
  highlightedTaskRowAssigneeId: string | null;
  /** Pass `tasks.length` so the hook retries scrolling when tasks load. */
  tasksLength: number;
  scrollTargetDate: string | null;
  scrollRequestId: number;
  scrollReanchorMinShiftDays: number;
  scrollReanchorEdgeTriggerDays: number;
  setCurrentDate: (date: string) => void;
  markTimelineInteraction: (ms: number) => void;
}

interface UseTimelineScrollResult {
  scrollLeft: number;
  handleScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  scrollToIndex: (index: number) => void;
}

export function useTimelineScroll({
  scrollContainerRef,
  sidebarViewportWidth,
  viewportWidth,
  currentDate,
  currentDateObj,
  viewMode,
  dayWidth,
  visibleDays,
  highlightedTaskId,
  highlightedTaskRowAssigneeId,
  tasksLength,
  scrollTargetDate,
  scrollRequestId,
  scrollReanchorMinShiftDays,
  scrollReanchorEdgeTriggerDays,
  setCurrentDate,
  markTimelineInteraction,
}: UseTimelineScrollOptions): UseTimelineScrollResult {
  const [scrollLeft, setScrollLeft] = useState(0);

  const lastRenderedFocusIndexRef = useRef(-1);
  const scrollSyncFrameRef = useRef<number | null>(null);
  const pendingScrollLeftRef = useRef<number | null>(null);

  const scrollEndTimerRef = useRef<number | null>(null);
  const highlightedTaskScrollTimerRef = useRef<number | null>(null);
  const pendingScrollDateRef = useRef<string | null>(null);
  const lastEdgeReanchorAtRef = useRef(0);
  const visibleDaysRef = useRef<Date[]>([]);
  const ignoreScrollDateUpdateRef = useRef(false);
  const skipAutoCenterRef = useRef(false);
  const prevRangeRef = useRef<{ start: Date | null; viewMode: string } | null>(null);
  const lastCenteredRef = useRef<{ date: string; viewMode: string } | null>(null);

  // Cleanup on unmount
  useEffect(() => () => {
    if (scrollEndTimerRef.current) {
      window.clearTimeout(scrollEndTimerRef.current);
    }
    if (highlightedTaskScrollTimerRef.current) {
      window.clearTimeout(highlightedTaskScrollTimerRef.current);
    }
    if (scrollSyncFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollSyncFrameRef.current);
    }
  }, []);

  const scrollToIndex = useCallback((index: number) => {
    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
    const targetScroll = Math.min(
      maxScroll,
      Math.max(0, (index - LEFT_CONTEXT_DAYS) * dayWidth),
    );
    container.scrollLeft = targetScroll;
    pendingScrollLeftRef.current = targetScroll;
    lastRenderedFocusIndexRef.current = index;
    setScrollLeft(targetScroll);
  }, [dayWidth, scrollContainerRef]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    markTimelineInteraction(700);
    const newScrollLeft = e.currentTarget.scrollLeft;
    pendingScrollLeftRef.current = newScrollLeft;
    let nextFocusIndex = -1;
    if (visibleDays.length > 0 && dayWidth > 0) {
      const focusPx = newScrollLeft + LEFT_CONTEXT_DAYS * dayWidth + dayWidth / 2;
      nextFocusIndex = Math.min(
        visibleDays.length - 1,
        Math.max(0, Math.floor(focusPx / dayWidth)),
      );
    }
    const shouldUpdateScrollState = nextFocusIndex < 0 || nextFocusIndex !== lastRenderedFocusIndexRef.current;
    if (nextFocusIndex >= 0) {
      lastRenderedFocusIndexRef.current = nextFocusIndex;
    }
    if (shouldUpdateScrollState && scrollSyncFrameRef.current === null) {
      scrollSyncFrameRef.current = window.requestAnimationFrame(() => {
        scrollSyncFrameRef.current = null;
        const pending = pendingScrollLeftRef.current;
        if (pending !== null) {
          setScrollLeft((prev) => (prev === pending ? prev : pending));
        }
      });
    }

    if (ignoreScrollDateUpdateRef.current) {
      return;
    }

    if (nextFocusIndex >= 0) {
      const date = format(visibleDays[nextFocusIndex], 'yyyy-MM-dd');
      pendingScrollDateRef.current = date;
      if (scrollEndTimerRef.current) {
        window.clearTimeout(scrollEndTimerRef.current);
      }
      scrollEndTimerRef.current = window.setTimeout(() => {
        const latestScrollLeft = pendingScrollLeftRef.current;
        if (typeof latestScrollLeft === 'number') {
          setScrollLeft((prev) => (prev === latestScrollLeft ? prev : latestScrollLeft));
        }
        const nextDate = pendingScrollDateRef.current;
        const container = scrollContainerRef.current;
        if (nextDate && nextDate !== currentDate && container) {
          const now = Date.now();
          if (now - lastEdgeReanchorAtRef.current < EDGE_REANCHOR_COOLDOWN_MS) {
            return;
          }
          const resolvedScrollLeft = typeof latestScrollLeft === 'number'
            ? latestScrollLeft
            : container.scrollLeft;
          const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
          const edgeThresholdPx = Math.max(
            dayWidth * scrollReanchorEdgeTriggerDays,
            dayWidth * LEFT_CONTEXT_DAYS,
          );
          const nearLeftEdge = resolvedScrollLeft <= edgeThresholdPx;
          const nearRightEdge = (maxScroll - resolvedScrollLeft) <= edgeThresholdPx;
          if (nearLeftEdge || nearRightEdge) {
            const daysDelta = Math.abs(differenceInDays(parseISO(nextDate), parseISO(currentDate)));
            if (daysDelta >= scrollReanchorMinShiftDays) {
              lastEdgeReanchorAtRef.current = now;
              skipAutoCenterRef.current = true;
              startTransition(() => {
                setCurrentDate(nextDate);
              });
            }
          }
        }
      }, 450);
    }
  }, [currentDate, dayWidth, markTimelineInteraction, scrollContainerRef, scrollReanchorEdgeTriggerDays, scrollReanchorMinShiftDays, setCurrentDate, visibleDays]);

  // Keep visibleDaysRef in sync for effects that read it
  useEffect(() => {
    visibleDaysRef.current = visibleDays;
  }, [visibleDays]);

  // When the visible range shifts (e.g. re-anchor), adjust scrollLeft to keep the same visual position
  useEffect(() => {
    if (visibleDays.length === 0 || dayWidth === 0) {
      prevRangeRef.current = { start: visibleDays[0] ?? null, viewMode };
      return;
    }

    const previous = prevRangeRef.current;
    const nextStart = visibleDays[0];

    if (previous?.start && previous.viewMode === viewMode) {
      const deltaDays = differenceInDays(nextStart, previous.start);
      if (deltaDays !== 0) {
        const shiftPx = deltaDays * dayWidth;
        const container = scrollContainerRef.current;
        if (container) {
          const nextScrollLeft = Math.max(0, container.scrollLeft - shiftPx);
          ignoreScrollDateUpdateRef.current = true;
          container.scrollLeft = nextScrollLeft;
          setScrollLeft(nextScrollLeft);
          requestAnimationFrame(() => {
            ignoreScrollDateUpdateRef.current = false;
          });
        }
      }
    }

    prevRangeRef.current = { start: nextStart, viewMode };
  }, [dayWidth, scrollContainerRef, viewMode, visibleDays]);

  // Center scroll when the active date or view changes
  useEffect(() => {
    if (
      lastCenteredRef.current?.date === currentDate
      && lastCenteredRef.current?.viewMode === viewMode
    ) {
      return;
    }
    if (skipAutoCenterRef.current) {
      skipAutoCenterRef.current = false;
      lastCenteredRef.current = { date: currentDate, viewMode };
      return;
    }
    const days = visibleDaysRef.current;
    if (days.length === 0) return;
    const targetIndex = days.findIndex((day) => isSameDay(day, currentDateObj));
    if (targetIndex >= 0) {
      scrollToIndex(targetIndex);
      lastCenteredRef.current = { date: currentDate, viewMode };
    }
  }, [currentDate, currentDateObj, scrollToIndex, viewMode]);

  // Scroll to an explicitly requested date
  useEffect(() => {
    if (!scrollTargetDate) return;
    const targetDate = parseISO(scrollTargetDate);
    const days = visibleDaysRef.current;
    if (days.length === 0) return;
    const targetIndex = days.findIndex((day) => isSameDay(day, targetDate));
    if (targetIndex >= 0) {
      scrollToIndex(targetIndex);
    }
  }, [scrollRequestId, scrollTargetDate, scrollToIndex]);

  // Scroll to a highlighted task, retrying until the element is mounted
  useEffect(() => {
    if (!highlightedTaskId || viewMode === 'calendar') return;
    const container = scrollContainerRef.current;
    if (!container) return;

    let cancelled = false;
    let attempts = 0;

    const scrollToHighlightedTask = () => {
      if (cancelled) return;
      const taskSelector = highlightedTaskRowAssigneeId
        ? `[data-task-id="${highlightedTaskId}"][data-row-assignee-id="${highlightedTaskRowAssigneeId}"]`
        : `[data-task-id="${highlightedTaskId}"]`;
      const taskElement = container.querySelector<HTMLElement>(taskSelector)
        ?? container.querySelector<HTMLElement>(`[data-task-id="${highlightedTaskId}"]`);
      if (taskElement) {
        const containerRect = container.getBoundingClientRect();
        const taskRect = taskElement.getBoundingClientRect();
        const taskCenter = taskRect.left - containerRect.left + container.scrollLeft + taskRect.width / 2;
        const effectiveViewportWidth = viewportWidth || Math.max(0, container.clientWidth - sidebarViewportWidth);
        const viewportCenter = sidebarViewportWidth + effectiveViewportWidth / 2;
        const targetLeft = Math.max(0, taskCenter - viewportCenter);
        const taskCenterY = taskRect.top - containerRect.top + container.scrollTop + taskRect.height / 2;
        const targetTop = Math.max(0, taskCenterY - container.clientHeight / 2);
        container.scrollTo({ left: targetLeft, top: targetTop, behavior: 'smooth' });
        return;
      }
      if (attempts >= 30) return;
      attempts += 1;
      highlightedTaskScrollTimerRef.current = window.setTimeout(scrollToHighlightedTask, 100);
    };

    scrollToHighlightedTask();

    return () => {
      cancelled = true;
      if (highlightedTaskScrollTimerRef.current) {
        window.clearTimeout(highlightedTaskScrollTimerRef.current);
        highlightedTaskScrollTimerRef.current = null;
      }
    };
  // tasksLength intentionally included so scroll retries when tasks load
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightedTaskId, highlightedTaskRowAssigneeId, sidebarViewportWidth, tasksLength, viewMode, viewportWidth]);

  return { scrollLeft, handleScroll, scrollToIndex };
}
