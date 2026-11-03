import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';

// Mobile gesture thresholds.
const TAP_MOVE_THRESHOLD = 10; // px of movement that turns a tap into a scroll
const DOUBLE_TAP_MS = 280; // window to detect a double tap (and to debounce a single)

interface UseTaskBarTooltipOptions {
  isMobile: boolean;
  taskId: string;
  barRef: React.RefObject<HTMLDivElement>;
  setSelectedTaskId: (taskId: string | null) => void;
  setPeekedTaskId: (taskId: string | null) => void;
}

/**
 * The info card of a task bar. On a desktop it follows the cursor while the
 * bar is hovered; on a phone a single tap opens it under the bar, a double tap
 * opens the task instead, and a long-press leaves it to the context menu.
 */
export const useTaskBarTooltip = ({
  isMobile,
  taskId,
  barRef,
  setSelectedTaskId,
  setPeekedTaskId,
}: UseTaskBarTooltipOptions) => {
  const [isHovering, setIsHovering] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  // Mobile: the info tooltip is driven by an explicit single tap, not hover.
  const [mobileTooltipOpen, setMobileTooltipOpen] = useState(false);
  const tapStartRef = useRef<{ x: number; y: number } | null>(null);
  const tapMovedRef = useRef(false);
  const lastTapRef = useRef(0);
  const singleTapTimerRef = useRef<number | null>(null);
  // Set when a long-press opens the context menu, so the trailing touchend is
  // not mistaken for a tap.
  const menuJustOpenedRef = useRef(false);
  const tooltipElRef = useRef<HTMLDivElement>(null);

  const tooltipRafRef = useRef<number | null>(null);
  const tooltipPendingRef = useRef<{ clientX: number; clientY: number } | null>(null);

  useEffect(() => () => {
    if (tooltipRafRef.current !== null) {
      cancelAnimationFrame(tooltipRafRef.current);
      tooltipRafRef.current = null;
    }
    if (singleTapTimerRef.current !== null) {
      window.clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = null;
    }
  }, []);

  // Mobile: the tap preview is how a phone looks at a task, so publish it —
  // the inbox reads the task's notifications as seen while it is open.
  useEffect(() => {
    if (!isMobile || !mobileTooltipOpen) return undefined;
    setPeekedTaskId(taskId);
    return () => {
      if (usePlannerStore.getState().peekedTaskId === taskId) setPeekedTaskId(null);
    };
  }, [isMobile, mobileTooltipOpen, setPeekedTaskId, taskId]);

  // Mobile: dismiss the tap-tooltip on the next touch outside it. Passive so the
  // same gesture still scrolls the timeline (no blocking full-screen backdrop).
  useEffect(() => {
    if (!isMobile || !mobileTooltipOpen) return undefined;
    const onDocTouch = (ev: TouchEvent) => {
      const target = ev.target as Node | null;
      if (tooltipElRef.current && target && tooltipElRef.current.contains(target)) return;
      setMobileTooltipOpen(false);
    };
    document.addEventListener('touchstart', onDocTouch, { passive: true });
    return () => document.removeEventListener('touchstart', onDocTouch);
  }, [isMobile, mobileTooltipOpen]);

  const updateTooltipPosition = useCallback((event: React.MouseEvent) => {
    tooltipPendingRef.current = { clientX: event.clientX, clientY: event.clientY };
    if (tooltipRafRef.current !== null) return;
    tooltipRafRef.current = requestAnimationFrame(() => {
      tooltipRafRef.current = null;
      const pending = tooltipPendingRef.current;
      if (!pending) return;
      const offset = 14;
      const tooltipWidth = 260;
      const tooltipHeight = 180;
      const { innerWidth, innerHeight } = window;
      let x = pending.clientX + offset;
      let y = pending.clientY + offset;
      if (x + tooltipWidth > innerWidth) {
        x = Math.max(8, pending.clientX - tooltipWidth - offset);
      }
      if (y + tooltipHeight > innerHeight) {
        y = Math.max(8, pending.clientY - tooltipHeight - offset);
      }
      setTooltipPos({ x, y });
    });
  }, []);

  // Mobile: anchor the tooltip to the bar (touch has no cursor), clamped to the
  // viewport — below the bar, or above it when there isn't room.
  const positionMobileTooltip = useCallback(() => {
    const bar = barRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const tooltipWidth = 256;
    const tooltipHeight = 180;
    const offset = 8;
    let x = rect.left;
    if (x + tooltipWidth > window.innerWidth) {
      x = window.innerWidth - tooltipWidth - offset;
    }
    x = Math.max(8, x);
    let y = rect.bottom + offset;
    if (y + tooltipHeight > window.innerHeight) {
      y = Math.max(8, rect.top - tooltipHeight - offset);
    }
    setTooltipPos({ x, y });
  }, [barRef]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    // Drain the long-press latch at the start of every gesture so a previous
    // long-press that ended in a touchcancel can't swallow this tap.
    menuJustOpenedRef.current = false;
    tapStartRef.current = { x: touch.clientX, y: touch.clientY };
    tapMovedRef.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const start = tapStartRef.current;
    const touch = e.touches[0];
    if (!start || !touch) return;
    if (
      Math.abs(touch.clientX - start.x) > TAP_MOVE_THRESHOLD
      || Math.abs(touch.clientY - start.y) > TAP_MOVE_THRESHOLD
    ) {
      tapMovedRef.current = true;
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    // A long-press already opened the context menu — swallow this touchend.
    if (menuJustOpenedRef.current) {
      menuJustOpenedRef.current = false;
      tapStartRef.current = null;
      return;
    }
    const start = tapStartRef.current;
    tapStartRef.current = null;
    if (!start || tapMovedRef.current) return; // a scroll/drag, not a tap
    // Suppress the synthetic mouse click that would otherwise follow the tap.
    e.preventDefault();
    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      // Double tap → open the task detail.
      if (singleTapTimerRef.current !== null) {
        window.clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      lastTapRef.current = 0;
      setMobileTooltipOpen(false);
      setSelectedTaskId(taskId);
      return;
    }
    // First tap → wait for a possible second tap; otherwise show the tooltip.
    lastTapRef.current = now;
    if (singleTapTimerRef.current !== null) {
      window.clearTimeout(singleTapTimerRef.current);
    }
    singleTapTimerRef.current = window.setTimeout(() => {
      singleTapTimerRef.current = null;
      lastTapRef.current = 0;
      positionMobileTooltip();
      setMobileTooltipOpen(true);
    }, DOUBLE_TAP_MS);
  }, [taskId, setSelectedTaskId, positionMobileTooltip]);

  // Mobile: the context menu opened by a long-press.
  const handleMenuOpenChange = useCallback((open: boolean) => {
    if (open) {
      menuJustOpenedRef.current = true;
      // Long-press won the gesture: cancel any pending single-tap tooltip so
      // it can't flash during the hold, and drop the info tooltip.
      if (singleTapTimerRef.current !== null) {
        window.clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      lastTapRef.current = 0;
      setMobileTooltipOpen(false);
    } else {
      // Menu closed: clear the latch so it can't swallow a later tap.
      menuJustOpenedRef.current = false;
    }
  }, []);

  return {
    isHovering,
    setIsHovering,
    tooltipPos,
    mobileTooltipOpen,
    tooltipElRef,
    updateTooltipPosition,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleMenuOpenChange,
  };
};
