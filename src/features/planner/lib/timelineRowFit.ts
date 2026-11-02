import type { TaskWithLane } from './taskLanes';

/**
 * Row heights that follow the days on screen.
 *
 * A row used to be as tall as the busiest day of the whole rendered range
 * (about four months), so one crowded day kept the row tall everywhere and
 * left most of it empty. The height is now taken from the days in view: the
 * bars keep the lanes calculateTaskLanes gave them, only the row fits the
 * highest lane in use on screen.
 */

/** Index of the first key ≥ `key` in ascending `keys`. */
const lowerBound = (keys: readonly string[], key: string) => {
  let low = 0;
  let high = keys.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (keys[middle] < key) low = middle + 1;
    else high = middle;
  }
  return low;
};

/** Index of the first key > `key` in ascending `keys`. */
const upperBound = (keys: readonly string[], key: string) => {
  let low = 0;
  let high = keys.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (keys[middle] <= key) low = middle + 1;
    else high = middle;
  }
  return low;
};

/**
 * Per rendered day, the lanes the row needs that day: the highest lane in use
 * plus one, never fewer than `minLanes`. `dayKeys` are the 'yyyy-MM-dd' keys
 * of the rendered days in order; tasks reaching past the range are clipped to it.
 */
export const buildRowLaneProfile = (
  rowTasks: readonly TaskWithLane[],
  dayKeys: readonly string[],
  minLanes = 1,
): Uint16Array => {
  const profile = new Uint16Array(dayKeys.length).fill(minLanes);
  rowTasks.forEach((task) => {
    const first = lowerBound(dayKeys, task.startDate);
    // An inverted range (end before start) is drawn one day wide at its start.
    const last = upperBound(dayKeys, task.endDate < task.startDate ? task.startDate : task.endDate) - 1;
    const lanes = task.lane + 1;
    for (let index = first; index <= last; index += 1) {
      if (profile[index] < lanes) profile[index] = lanes;
    }
  });
  return profile;
};

/** Days of the rendered range, as indexes, both ends included. */
export type DayWindow = { first: number; last: number };

/** The most lanes the row needs on any day of `window`; `fallback` for an empty one. */
export const maxLanesInDayWindow = (
  profile: Uint16Array,
  window: DayWindow,
  fallback = 1,
): number => {
  const first = Math.max(0, window.first);
  const last = Math.min(profile.length - 1, window.last);
  if (first > last) return fallback;
  let lanes = 0;
  for (let index = first; index <= last; index += 1) {
    if (profile[index] > lanes) lanes = profile[index];
  }
  return lanes;
};

/** Extra room past the grow margin before a row may shrink back (hysteresis). */
export const ROW_FIT_SETTLE_BAND_PX = 120;

/**
 * Days past each edge of the screen that count as on screen.
 * - `growDays`: while the timeline moves, a stack this close gets its room
 *   before it scrolls in (a fifth of the screen, 160–240 px; the scroll state
 *   lags up to a day behind, so a phone still gets two days).
 * - `settleDays`: at rest a row keeps room for stacks this close, a bit
 *   farther than it grows for, so a short scroll back and forth does not make
 *   it grow and shrink again.
 */
export const getRowFitMargins = (
  viewportWidth: number,
  dayWidth: number,
): { growDays: number; settleDays: number } => {
  if (viewportWidth <= 0 || dayWidth <= 0) return { growDays: 0, settleDays: 0 };
  const growPx = Math.min(240, Math.max(160, viewportWidth * 0.2));
  return {
    growDays: Math.ceil(growPx / dayWidth),
    settleDays: Math.ceil((growPx + ROW_FIT_SETTLE_BAND_PX) / dayWidth),
  };
};

/**
 * The days on screen, widened by `marginDays` on each side: a day counts once
 * any part of it is visible. Null until the viewport has been measured.
 */
export const getViewportDayWindow = ({
  scrollLeft,
  viewportWidth,
  dayWidth,
  dayCount,
  marginDays = 0,
}: {
  scrollLeft: number;
  viewportWidth: number;
  dayWidth: number;
  dayCount: number;
  marginDays?: number;
}): DayWindow | null => {
  if (viewportWidth <= 0 || dayWidth <= 0 || dayCount <= 0) return null;
  const first = Math.floor(scrollLeft / dayWidth) - marginDays;
  const last = Math.ceil((scrollLeft + viewportWidth) / dayWidth) - 1 + marginDays;
  return {
    first: Math.max(0, Math.min(dayCount - 1, first)),
    last: Math.max(0, Math.min(dayCount - 1, last)),
  };
};

export type RowHeightMetrics = {
  minRowHeight: number;
  taskHeight: number;
  taskGap: number;
};

/** Pixel height of a row holding `lanes` lanes of bars (8 px padding above and below). */
export const rowHeightForLanes = (lanes: number, metrics: RowHeightMetrics): number => (
  Math.max(metrics.minRowHeight, 16 + lanes * (metrics.taskHeight + metrics.taskGap))
);

/**
 * - `hold` — nothing changes (the day range is shifting and the scroll
 *   position is a render behind the new days);
 * - `reset` — every row takes its height at once (first fit, "Today", a deep
 *   link, another view, filters or grouping: nothing on screen to keep);
 * - `motion` — the timeline is in use: rows only grow;
 * - `rest` — the timeline is still: rows only shrink.
 */
export type RowFitMode = 'hold' | 'reset' | 'motion' | 'rest';

export const resolveRowFitMode = ({
  measured,
  hold,
  jumped,
  interacting,
}: {
  measured: boolean;
  hold: boolean;
  jumped: boolean;
  interacting: boolean;
}): RowFitMode => {
  if (hold) return 'hold';
  if (!measured || jumped) return 'reset';
  return interacting ? 'motion' : 'rest';
};

/** A visible row shrinks at rest only to give back at least this much (two lanes). */
export const ROW_SETTLE_MIN_SHRINK_PX = 88;

/**
 * Which rows are out of sight vertically: above the visible band (under the
 * sticky header or scrolled past) or more than half a screen below it. Rows
 * are stacked in `rowIds` order right under the header, each as tall as
 * `heights` says. The half screen under the band counts as visible, in case
 * the scroll moved since it was last read.
 *
 * A row cut by the top of the band counts as above while less than half of it
 * shows (it is then also in `cut`): resizing it from the bottom would move
 * everything on screen under it, so it is resized with the scroll corrected,
 * keeping its bottom in place, and never shrunk (see nextRowFit).
 */
export const classifyRowsByViewport = (
  rowIds: readonly string[],
  heights: Readonly<Record<string, number>>,
  viewport: { scrollTop: number; clientHeight: number; headerHeight: number },
): { above: Set<string>; below: Set<string>; cut: Set<string> } => {
  const above = new Set<string>();
  const below = new Set<string>();
  const cut = new Set<string>();
  const bandTop = viewport.scrollTop + viewport.headerHeight;
  const bandBottom = viewport.scrollTop + viewport.clientHeight * 1.5;
  let top = viewport.headerHeight;
  rowIds.forEach((rowId) => {
    const height = heights[rowId] ?? 0;
    const bottom = top + height;
    const showing = bottom - bandTop;
    if (showing < height / 2) {
      above.add(rowId);
      if (showing > 0) cut.add(rowId);
    } else if (top >= bandBottom) {
      below.add(rowId);
    }
    top = bottom;
  });
  return { above, below, cut };
};

/**
 * The next heights and the rows that take theirs at once rather than gliding.
 * `growTarget` fits the days on screen plus the grow margin, `settleTarget`
 * plus the wider settle margin (so `growTarget` ≤ `settleTarget`).
 * - `motion`: rows grow to `growTarget` and never shrink. Rows above the
 *   screen wait while `holdAbove` (the scroll is moving: correcting it would
 *   cut a finger's momentum); otherwise they grow at once, with the scroll
 *   corrected.
 * - `rest`: rows only shrink, to `settleTarget` but never under `growTarget`;
 *   a visible row only when it gives back `minVisibleShrinkPx` or more. A row
 *   cut by the top of the screen (`cut`) is not shrunk: with its bottom kept
 *   in place, the sliver of it in view would show other parts of it. It
 *   shrinks once wholly out of sight or at least half in view.
 * - Rows out of sight change at once; so does everything on `reset`, and a
 *   row seen for the first time.
 * Returns `shown` itself when nothing changes, so the rows are not re-rendered.
 */
export const nextRowFit = ({
  rowIds,
  shown,
  growTarget,
  settleTarget,
  mode,
  above,
  below,
  cut,
  holdAbove = true,
  minVisibleShrinkPx = ROW_SETTLE_MIN_SHRINK_PX,
}: {
  rowIds: readonly string[];
  shown: Readonly<Record<string, number>> | null;
  growTarget: Readonly<Record<string, number>>;
  settleTarget: Readonly<Record<string, number>>;
  mode: RowFitMode;
  above: ReadonlySet<string>;
  below: ReadonlySet<string>;
  cut?: ReadonlySet<string>;
  holdAbove?: boolean;
  minVisibleShrinkPx?: number;
}): { heights: Record<string, number>; instant: Set<string> } => {
  const heights: Record<string, number> = {};
  const instant = new Set<string>();
  let changed = !shown || Object.keys(shown).length !== rowIds.length;
  rowIds.forEach((rowId) => {
    const current = shown?.[rowId];
    const grow = growTarget[rowId];
    const settle = settleTarget[rowId];
    const outOfSight = above.has(rowId) || below.has(rowId);
    let height = current ?? settle;
    if (current === undefined || mode === 'reset') {
      height = settle;
      instant.add(rowId);
    } else if (mode === 'motion') {
      if (!above.has(rowId) || !holdAbove) height = Math.max(current, grow);
      if (outOfSight) instant.add(rowId);
    } else if (mode === 'rest') {
      const fitted = cut?.has(rowId)
        ? Math.max(current, grow)
        : Math.max(grow, Math.min(current, settle));
      const shrink = current - fitted;
      if (outOfSight || shrink <= 0 || shrink >= minVisibleShrinkPx) height = fitted;
      if (outOfSight) instant.add(rowId);
    }
    heights[rowId] = height;
    if (height !== current) changed = true;
  });
  return { heights: changed || !shown ? heights : (shown as Record<string, number>), instant };
};

/**
 * How far to move scrollTop so that what is on screen stays put: the sum of
 * the height changes of the rows above the screen. Zero when the rows
 * themselves came or went (filters, grouping): that is another board.
 */
export const scrollTopCompensation = (
  rowIds: readonly string[],
  before: Readonly<Record<string, number>>,
  after: Readonly<Record<string, number>>,
  above: ReadonlySet<string>,
): number => {
  if (Object.keys(before).length !== rowIds.length || rowIds.some((rowId) => before[rowId] === undefined)) return 0;
  let shift = 0;
  above.forEach((rowId) => {
    shift += (after[rowId] ?? 0) - (before[rowId] ?? 0);
  });
  return shift;
};

/**
 * One curve for every row changing in a commit, so the rows below several of
 * them move as one: growing is quick and decisive, settling slower and soft.
 */
export const rowFitTransition = (mode: RowFitMode): string => {
  if (mode === 'motion') return 'height 200ms cubic-bezier(0.2, 0, 0, 1)';
  if (mode === 'rest') return 'height 300ms cubic-bezier(0.4, 0, 0.2, 1)';
  return 'none';
};
