import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { TaskWithLane } from '@/features/planner/lib/taskLanes';
import {
  buildRowLaneProfile,
  classifyRowsByViewport,
  getRowFitMargins,
  getViewportDayWindow,
  maxLanesInDayWindow,
  nextRowFit,
  resolveRowFitMode,
  rowFitTransition,
  rowHeightForLanes,
  scrollTopCompensation,
  type DayWindow,
  type RowHeightMetrics,
} from '@/features/planner/lib/timelineRowFit';

/**
 * How long the timeline must be left alone (no scroll on either axis, no
 * finger or button held) before rows shrink. Longer than the edge re-anchor
 * (450 ms) and its long task, so the shrink does not stutter on it.
 */
export const ROW_SETTLE_DELAY_MS = 700;

export type AdaptiveRow = {
  id: string;
  tasks: TaskWithLane[];
  /** Height under the lanes that is not part of the fit (the gap between people). */
  extra: number;
};

interface UseAdaptiveRowHeightsParams {
  /** The rows in display order. */
  rows: readonly AdaptiveRow[];
  /** 'yyyy-MM-dd' of the rendered days, in order. */
  dayKeys: string[];
  /** Lanes a row keeps even when no task is in them (a time-off bar). */
  minLanesByRow: Record<string, number>;
  metrics: RowHeightMetrics;
  scrollLeft: number;
  viewportWidth: number;
  dayWidth: number;
  /** What the lanes belong to (workspace, view, grouping, filters): a new one resets. */
  epoch: string;
  /**
   * The day range is shifting (re-anchor, Today, Day ↔ Week): for a render or
   * two the scroll position lags behind the new days, so the window read from
   * it points at the wrong dates. Heights stay as they are meanwhile.
   */
  hold: boolean;
  /**
   * Something on the timeline must not move under the person (a bar or time
   * off being dragged, a search lens, a deep-link highlight): rows may grow,
   * not shrink. Lifting it starts the countdown to rest.
   */
  suspended?: boolean;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  /** Height of the sticky header above the first row. */
  headerHeight: number;
}

interface UseAdaptiveRowHeightsResult {
  /** Full row heights by row id. */
  heights: Record<string, number>;
  /** Rows that take their new height at once (out of sight, or a reset). */
  instantRowIds: ReadonlySet<string>;
  /** CSS transition for the other rows changing in this commit. */
  transition: string;
}

const NO_ROWS: ReadonlySet<string> = new Set();

// The window by its dates (a re-anchor shifts the indexes, not the days on
// screen), the day width (Day ↔ Week shows other days at another scale) and
// the epoch.
const windowKey = (epoch: string, dayKeys: string[], window: DayWindow, dayWidth: number) => (
  `${epoch}\u0000${dayWidth}\u0000${dayKeys[window.first]}\u0000${dayKeys[window.last]}`
);

const sameBoard = (a: string, b: string) => {
  const [aEpoch, aWidth] = a.split('\u0000');
  const [bEpoch, bWidth] = b.split('\u0000');
  return aEpoch === bEpoch && aWidth === bWidth;
};

const windowsOverlap = (a: string, b: string) => {
  const [, , aFirst, aLast] = a.split('\u0000');
  const [, , bFirst, bLast] = b.split('\u0000');
  return sameBoard(a, b) && aFirst <= bLast && bFirst <= aLast;
};

const sameIds = (a: ReadonlySet<string>, b: ReadonlySet<string>) => (
  a.size === b.size && [...a].every((id) => b.has(id))
);

/**
 * Row heights that fit the days on screen (see timelineRowFit for the rules).
 *
 * The timeline is "in use" while it scrolls on either axis, while a finger or
 * a mouse button is down on it, while the mouse moves over it or rests on a
 * bar, and for ROW_SETTLE_DELAY_MS after; then it is at rest (and while
 * `suspended`, nothing shrinks either). Rows above the screen are resized only
 * while it is not in use, at once, with scrollTop corrected in the same frame,
 * so nothing on screen moves in any browser (the container has
 * overflow-anchor: none) and a finger's momentum is never cut on iOS.
 */
export function useAdaptiveRowHeights({
  rows,
  dayKeys,
  minLanesByRow,
  metrics,
  scrollLeft,
  viewportWidth,
  dayWidth,
  epoch,
  hold,
  suspended = false,
  scrollContainerRef,
  headerHeight,
}: UseAdaptiveRowHeightsParams): UseAdaptiveRowHeightsResult {
  // ─── In use or at rest, and the vertical viewport ─────────────────────────
  const scrollTopRef = useRef(0);
  const clientHeightRef = useRef(0);
  const expectedScrollTopRef = useRef<number | null>(null);
  const shownRef = useRef<Record<string, number> | null>(null);
  const markInUseRef = useRef<() => void>(() => {});
  const [inUse, setInUse] = useState(false);
  // Bumped when scrolling up brings a row that waited above the screen into
  // view, or the viewport is resized: the decision is redone.
  const [viewportTick, setViewportTick] = useState(0);
  // The latest decision's inputs, for the scroll listener.
  const watchRef = useRef<{ rowIds: readonly string[]; growTarget: Record<string, number>; above: ReadonlySet<string>; headerHeight: number }>({
    rowIds: [],
    growTarget: {},
    above: new Set(),
    headerHeight: 0,
  });

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return undefined;
    let inUseNow = false;
    let timer = 0;
    let lastActivityAt = 0;
    let pointerDown = false;
    let touches = 0;
    let onBar = false;
    const settle = () => {
      const quiet = Date.now() - lastActivityAt;
      if (pointerDown || touches > 0 || onBar || quiet < ROW_SETTLE_DELAY_MS) {
        timer = window.setTimeout(settle, Math.max(16, ROW_SETTLE_DELAY_MS - quiet));
        return;
      }
      timer = 0;
      inUseNow = false;
      setInUse(false);
    };
    const markInUse = () => {
      lastActivityAt = Date.now();
      if (!inUseNow) {
        inUseNow = true;
        setInUse(true);
      }
      if (!timer) timer = window.setTimeout(settle, ROW_SETTLE_DELAY_MS);
    };
    markInUseRef.current = markInUse;
    const readViewport = () => {
      scrollTopRef.current = container.scrollTop;
      clientHeightRef.current = container.clientHeight;
    };
    // A row that waited above the screen while the timeline moved, now in
    // view and short of room for its bars: redo the decision so it grows.
    const checkRowsComingIntoView = () => {
      const shown = shownRef.current;
      const watch = watchRef.current;
      if (!shown || watch.above.size === 0) return;
      const { above } = classifyRowsByViewport(watch.rowIds, shown, {
        scrollTop: scrollTopRef.current,
        clientHeight: clientHeightRef.current,
        headerHeight: watch.headerHeight,
      });
      const growing = [...watch.above].some((rowId) => !above.has(rowId) && (shown[rowId] ?? 0) < (watch.growTarget[rowId] ?? 0));
      if (growing) setViewportTick((tick) => tick + 1);
    };
    const handleScroll = () => {
      readViewport();
      // Our own scrollTop correction is not use.
      const expected = expectedScrollTopRef.current;
      expectedScrollTopRef.current = null;
      if (expected !== null && Math.abs(container.scrollTop - expected) < 1) return;
      markInUse();
      checkRowsComingIntoView();
    };
    // Rows settling must not slide away from under a pointer taking aim: a
    // moving mouse is use, and so is one resting on a bar.
    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      onBar = event.target instanceof Element && event.target.closest('[data-task-id]') !== null;
      markInUse();
    };
    const handlePointerLeave = () => {
      if (!onBar) return;
      onBar = false;
      markInUse();
    };
    const handlePointerDown = (event: PointerEvent) => {
      // A finger is followed by touch events: iOS cancels the pointer as soon
      // as the native pan starts, while the finger is still down.
      if (event.pointerType === 'touch') return;
      pointerDown = true;
      markInUse();
    };
    const handlePointerUp = () => {
      if (!pointerDown) return;
      pointerDown = false;
      markInUse();
    };
    const handleTouchStart = (event: TouchEvent) => {
      touches = event.touches.length;
      markInUse();
    };
    const handleTouchEnd = (event: TouchEvent) => {
      touches = event.touches.length;
      if (touches === 0) markInUse();
    };
    readViewport();
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
        const before = clientHeightRef.current;
        readViewport();
        if (clientHeightRef.current !== before) setViewportTick((tick) => tick + 1);
      });
    resizeObserver?.observe(container);
    container.addEventListener('scroll', handleScroll, { passive: true });
    container.addEventListener('pointerdown', handlePointerDown, { passive: true });
    container.addEventListener('pointermove', handlePointerMove, { passive: true });
    container.addEventListener('pointerleave', handlePointerLeave, { passive: true });
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('pointerup', handlePointerUp, { passive: true });
    window.addEventListener('pointercancel', handlePointerUp, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    return () => {
      resizeObserver?.disconnect();
      container.removeEventListener('scroll', handleScroll);
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerleave', handlePointerLeave);
      container.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
      window.clearTimeout(timer);
      markInUseRef.current = () => {};
    };
  }, [scrollContainerRef]);

  // Lifting a suspension counts as use, from the render that lifts it: rest
  // comes ROW_SETTLE_DELAY_MS later.
  const wasSuspendedRef = useRef(suspended);
  const suspensionLifted = wasSuspendedRef.current && !suspended;
  useEffect(() => {
    if (wasSuspendedRef.current && !suspended) markInUseRef.current();
    wasSuspendedRef.current = suspended;
  }, [suspended]);

  // ─── Targets for the days on screen ───────────────────────────────────────
  const profiles = useMemo(() => {
    const byRow = new Map<string, Uint16Array>();
    rows.forEach((row) => {
      byRow.set(row.id, buildRowLaneProfile(row.tasks, dayKeys, Math.max(1, minLanesByRow[row.id] ?? 0)));
    });
    return byRow;
  }, [dayKeys, minLanesByRow, rows]);

  const measured = viewportWidth > 0 && dayKeys.length > 0;
  const { growDays, settleDays } = getRowFitMargins(viewportWidth, dayWidth);
  const viewportDays = { scrollLeft, viewportWidth, dayWidth, dayCount: dayKeys.length };
  // Until the viewport is measured, the whole range (the old behaviour).
  const wholeRange: DayWindow = { first: 0, last: Math.max(0, dayKeys.length - 1) };
  const screen = getViewportDayWindow(viewportDays) ?? wholeRange;
  const growWindow = getViewportDayWindow({ ...viewportDays, marginDays: growDays }) ?? wholeRange;
  const settleWindow = getViewportDayWindow({ ...viewportDays, marginDays: settleDays }) ?? wholeRange;

  const fitTo = (window: DayWindow) => {
    const heights: Record<string, number> = {};
    rows.forEach((row) => {
      const profile = profiles.get(row.id);
      const lanes = profile ? maxLanesInDayWindow(profile, window) : 1;
      heights[row.id] = rowHeightForLanes(lanes, metrics) + row.extra;
    });
    return heights;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the window bounds, not the object
  const growTarget = useMemo(() => fitTo(growWindow), [metrics, profiles, rows, growWindow.first, growWindow.last]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the window bounds, not the object
  const settleTarget = useMemo(() => fitTo(settleWindow), [metrics, profiles, rows, settleWindow.first, settleWindow.last]);

  // ─── Mode ─────────────────────────────────────────────────────────────────
  const currentKey = measured ? windowKey(epoch, dayKeys, screen, dayWidth) : '';
  // The last screen laid out outside a hold, and whether the day range has
  // shifted since (a navigation: "Today", the arrows, a deep link).
  const lastKeyRef = useRef<string | null>(null);
  const shiftedSinceRef = useRef(false);
  const lastKey = lastKeyRef.current;
  const interacting = inUse || suspended || suspensionLifted;
  // A jump: the first fit, another board (epoch, view), or new dates that
  // share nothing with the last ones after a navigation or out of use. A fast
  // fling can also land a screen away between two renders: it is not a jump,
  // the rows only grow until rest.
  const jumped = measured && !hold && (
    lastKey === null
    || !sameBoard(lastKey, currentKey)
    || (!windowsOverlap(lastKey, currentKey) && (shiftedSinceRef.current || !interacting))
  );
  const mode = resolveRowFitMode({ measured, hold, jumped, interacting });

  useLayoutEffect(() => {
    if (hold) {
      shiftedSinceRef.current = true;
      return;
    }
    if (!measured) return;
    lastKeyRef.current = currentKey;
    shiftedSinceRef.current = false;
  }, [currentKey, hold, measured]);

  // ─── Heights ──────────────────────────────────────────────────────────────
  const lastInstantRef = useRef<ReadonlySet<string>>(NO_ROWS);
  // What this render decided against, for the scroll correction after it is
  // committed: scrollTop may have been clamped by then (rows above shrank at
  // the bottom of the list), and adding to it would correct twice.
  const decisionRef = useRef<{
    heights: Record<string, number>;
    before: Record<string, number> | null;
    above: ReadonlySet<string>;
    scrollTop: number;
  } | null>(null);
  const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);

  // The shown heights and the scroll are read from refs, not tracked: the
  // decision is redone when a target, the mode or the rows change.
  const fit = useMemo(() => {
    const shown = shownRef.current;
    const scrollTop = scrollTopRef.current;
    const { above, below, cut } = shown
      ? classifyRowsByViewport(rowIds, shown, { scrollTop, clientHeight: clientHeightRef.current, headerHeight })
      : { above: NO_ROWS, below: NO_ROWS, cut: undefined };
    // Rows above wait only while the timeline is in use: with nothing moving
    // (a search lens open, say) correcting the scroll cuts no momentum.
    const next = nextRowFit({ rowIds, shown, growTarget, settleTarget, mode, above, below, cut, holdAbove: inUse });
    const instant = next.heights === shown ? lastInstantRef.current : next.instant;
    decisionRef.current = { heights: next.heights, before: shown, above, scrollTop };
    return {
      heights: next.heights,
      instantRowIds: sameIds(instant, lastInstantRef.current) ? lastInstantRef.current : instant,
      // Rows still waiting above the screen, for the scroll listener.
      waiting: mode === 'motion' && inUse ? above : NO_ROWS,
    };
    // viewportTick: the scroll brought a waiting row into view, or the viewport was resized.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [growTarget, headerHeight, inUse, mode, rowIds, settleTarget, viewportTick]);

  useLayoutEffect(() => {
    const decision = decisionRef.current;
    shownRef.current = fit.heights;
    lastInstantRef.current = fit.instantRowIds;
    watchRef.current = { rowIds, growTarget, above: fit.waiting, headerHeight };
    if (!decision || decision.heights !== fit.heights || !decision.before || decision.before === fit.heights) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    const shift = scrollTopCompensation(rowIds, decision.before, fit.heights, decision.above);
    if (shift === 0) return;
    const next = Math.max(0, decision.scrollTop + shift);
    expectedScrollTopRef.current = next;
    container.scrollTop = next;
    scrollTopRef.current = container.scrollTop;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on each new set of heights
  }, [fit]);

  return {
    heights: fit.heights,
    instantRowIds: fit.instantRowIds,
    transition: rowFitTransition(mode),
  };
}
