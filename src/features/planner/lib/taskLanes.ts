import { Task, TaskPriority } from '@/features/planner/types/planner';

export interface TaskWithLane extends Task {
  lane: number;
}

/**
 * Preserve the referential identity of the {task, lane} wrapper across recomputes.
 *
 * calculateTaskLanes runs on every change to the tasks array — a drag, a live-sync
 * upsert from a teammate, an optimistic update. Spreading `{ ...task, lane }` fresh
 * each time handed every bar a brand-new object, so TaskBar's React.memo comparator
 * (`prev.task === next.task`) failed for ALL bars even when only one task moved —
 * defeating the whole point of memoizing TaskBar. Caching the wrapper by
 * (task reference, lane) keeps the reference stable for tasks that did not change,
 * so memo can skip them and only the moved bar re-renders.
 *
 * The store replaces a task's object only when its contents change, so a stable
 * reference implies unchanged contents — the cached shallow copy stays consistent.
 * A WeakMap lets a task object that the store has replaced (and its wrappers) be
 * garbage-collected. The inner Map keys by lane so a task that appears in several
 * rows at different lanes (e.g. multi-assignee grouping) keeps a stable wrapper per
 * lane instead of thrashing.
 */
const laneWrapperCache = new WeakMap<Task, Map<number, TaskWithLane>>();

const wrapWithLane = (task: Task, lane: number): TaskWithLane => {
  let byLane = laneWrapperCache.get(task);
  if (!byLane) {
    byLane = new Map<number, TaskWithLane>();
    laneWrapperCache.set(task, byLane);
  }
  let wrapped = byLane.get(lane);
  if (!wrapped) {
    wrapped = { ...task, lane };
    byLane.set(lane, wrapped);
  }
  return wrapped;
};

/** A period that owns lane 0 for its own days only — a time-off bar. */
export type ReservedPeriod = { startDate: string; endDate: string };

/** Where a task sat in a row's last layout, and over which days. A TaskWithLane is one. */
export type RememberedLane = { lane: number; startDate: string; endDate: string };

/**
 * The days a layout covers (the rendered days). A task gone from the row while
 * its days are still inside was deleted or moved to another row; one gone from
 * outside merely scrolled away.
 */
export type LayoutRange = { startDate: string; endDate: string };

const overlapsReserved = (
  task: Task,
  reserved: ReservedPeriod[],
): boolean => reserved.some(
  (period) => task.startDate <= period.endDate && task.endDate >= period.startDate,
);

/** ISO dates compare as plain strings. */
const compareDates = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);

const DAY_MS = 86_400_000;
const spanCache = new WeakMap<Task, number>();
/**
 * How many days a bar covers beyond its first (0 for a one-day task). Cached
 * by task object: the store replaces the object when a task changes.
 */
const spanOf = (task: Task): number => {
  let span = spanCache.get(task);
  if (span === undefined) {
    const days = Math.round((Date.parse(task.endDate) - Date.parse(task.startDate)) / DAY_MS);
    span = Number.isFinite(days) && days > 0 ? days : 0;
    spanCache.set(task, span);
  }
  return span;
};

const PRIORITY_RANK: Record<TaskPriority, number> = { low: 1, medium: 2, high: 3 };
const priorityRank = (task: Task) => (task.priority ? PRIORITY_RANK[task.priority] : 0);

/** The order bars are returned and drawn in: by start, then by end. */
const byStart = (left: Task, right: Task) => (
  compareDates(left.startDate, right.startDate) || compareDates(left.endDate, right.endDate)
);

/**
 * The order bars take their lanes in, like pieces in Tetris: the longest first,
 * so long bars lie on top and short ones fill the room under them. Packed by
 * start with the shorter task first, a long task that began on a busy day
 * landed under the whole stack and hung there for days after the stack was
 * gone, with empty lanes above it. Of two tasks of one length the one with the
 * higher priority goes first, then the earlier one.
 */
const longestFirst = (left: Task, right: Task) => (
  spanOf(right) - spanOf(left)
  || priorityRank(right) - priorityRank(left)
  || compareDates(left.startDate, right.startDate)
);

/**
 * By start, and within one start still the longest and the more important
 * first. Packing by start never needs more lanes than the busiest day has
 * tasks, and in a row of a few long bars following one another it leaves fewer
 * empty places than the longest-first order.
 */
const byStartLongestFirst = (left: Task, right: Task) => (
  compareDates(left.startDate, right.startDate)
  || spanOf(right) - spanOf(left)
  || priorityRank(right) - priorityRank(left)
);

/**
 * The orders a row is packed in from scratch; the packing that is the lowest
 * and then has the fewest holes is kept, the earlier order winning a tie. The
 * last is the order used before the longest-first one (by start, the shorter
 * first): with it among them no row is laid out worse than it used to be.
 */
const PACKING_ORDERS = [longestFirst, byStartLongestFirst, byStart];

type LaneSpan = { startDate: string; endDate: string };

const sharesDays = (left: LaneSpan, right: LaneSpan) => (
  left.startDate <= right.endDate && right.startDate <= left.endDate
);

/** Index of the first span in `spans` (sorted by start) starting after `startDate`. */
const upperBound = (spans: LaneSpan[], startDate: string) => {
  let low = 0;
  let high = spans.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (spans[middle].startDate <= startDate) low = middle + 1;
    else high = middle;
  }
  return low;
};

/**
 * The lanes of one row while it is being packed. Each lane keeps its spans
 * sorted by start and never overlapping, so whether a task fits is decided by
 * its two neighbours. Days are inclusive: a task ending on a day and another
 * starting that day share it.
 */
const createLaneBoard = (reservedLaneZero: ReservedPeriod[]) => {
  const lanes: Array<Array<LaneSpan & { task: Task }>> = [];
  const assigned = new Map<Task, number>();

  const fits = (lane: number, task: Task) => {
    if (lane === 0 && reservedLaneZero.length > 0 && overlapsReserved(task, reservedLaneZero)) return false;
    const spans = lanes[lane];
    if (!spans || spans.length === 0) return true;
    const index = upperBound(spans, task.startDate);
    const before = spans[index - 1];
    const after = spans[index];
    if (before && before.endDate >= task.startDate) return false;
    if (after && after.startDate <= task.endDate) return false;
    return true;
  };
  const place = (lane: number, task: Task) => {
    while (lanes.length <= lane) lanes.push([]);
    const spans = lanes[lane];
    spans.splice(upperBound(spans, task.startDate), 0, { startDate: task.startDate, endDate: task.endDate, task });
    assigned.set(task, lane);
  };
  const unplace = (lane: number, task: Task) => {
    const spans = lanes[lane];
    spans.splice(spans.findIndex((span) => span.task === task), 1);
    assigned.delete(task);
  };
  /** The top lane free over all of the task's days, no lower than `limit` allows. */
  const firstFreeLane = (task: Task, limit = Number.POSITIVE_INFINITY) => {
    let lane = 0;
    while (lane < limit && !fits(lane, task)) lane += 1;
    return lane;
  };
  const laneOf = (task: Task) => assigned.get(task) as number;

  return { fits, place, unplace, firstFreeLane, laneOf, isPlaced: (task: Task) => assigned.has(task), height: () => lanes.length };
};

type LaneBoard = ReturnType<typeof createLaneBoard>;

const packInOrder = (ordered: Task[], reservedLaneZero: ReservedPeriod[]): LaneBoard => {
  const board = createLaneBoard(reservedLaneZero);
  for (const task of ordered) board.place(board.firstFreeLane(task), task);
  return board;
};

/**
 * Empty places with a bar under them, counted in days: what reads as a hole in
 * the stack. Per day, the lanes down to the deepest bar minus the bars there.
 */
const countHoles = (tasks: Task[], board: LaneBoard): number => {
  const bars: number[] = [];
  const deepest: number[] = [];
  let origin = Number.POSITIVE_INFINITY;
  for (const task of tasks) {
    const start = Date.parse(task.startDate);
    if (start < origin) origin = start;
  }
  for (const task of tasks) {
    const first = Math.round((Date.parse(task.startDate) - origin) / DAY_MS);
    if (!Number.isFinite(first)) continue;
    const lane = board.laneOf(task);
    const last = first + spanOf(task);
    for (let day = first; day <= last; day += 1) {
      bars[day] = (bars[day] ?? 0) + 1;
      if (deepest[day] === undefined || lane > deepest[day]) deepest[day] = lane;
    }
  }
  let holes = 0;
  deepest.forEach((lane, day) => { holes += lane + 1 - bars[day]; });
  return holes;
};

/** The best of the packings from scratch (see PACKING_ORDERS). */
const packFromScratch = (tasks: Task[], placeOrder: Task[], reservedLaneZero: ReservedPeriod[]): LaneBoard => {
  let best = packInOrder(placeOrder, reservedLaneZero);
  if (best.height() <= 1) return best;
  let bestHoles = countHoles(tasks, best);
  for (const order of PACKING_ORDERS.slice(1)) {
    if (bestHoles === 0) break;
    const board = packInOrder([...tasks].sort(order), reservedLaneZero);
    if (board.height() > best.height()) continue;
    const holes = countHoles(tasks, board);
    if (board.height() < best.height() || holes < bestHoles) {
      best = board;
      bestHoles = holes;
    }
  }
  return best;
};

/**
 * Calculate lanes for tasks to avoid visual overlapping.
 * Tasks that overlap in time are placed in different lanes.
 *
 * Bars take their lanes longest first (see `longestFirst`), each in the top
 * lane free over all of its days — so no bar can be lifted any higher. Empty
 * places above a bar remain only where one of its days is taken in every lane
 * above: a bar keeps one lane over all its days. No row is laid out worse for
 * it: when packing by start makes the row lower or leaves fewer holes, the row
 * is packed by start (see `PACKING_ORDERS`).
 *
 * `reservedLaneZero` lists periods that own lane 0 (the time-off bar, which is
 * rendered outside this packer). A task is kept out of lane 0 only while it
 * overlaps one of them: on every other day lane 0 stays available, so a row with
 * a two-week vacation does not push its whole year of tasks down a lane.
 *
 * `previousLanes` (task id → lane and days in this row's last layout) keeps
 * bars where they are. Packing from scratch depends on every task of the row,
 * so a task that came or went on the left reshuffled the lanes after it:
 * scrolling the timeline far, each window load made the bars on screen hop
 * between lanes. With it, a task keeps its lane while that lane is free over
 * its days; new tasks, tasks whose lane became taken, and tasks whose days
 * changed (dragged, resized, moved by a teammate) are placed in the first free
 * lane, the longest first — a moved bar kept its old lane and hung low under
 * free lanes of its new days. A change of priority alone moves no bar.
 *
 * The place a task leaves by a change on screen — dragged or resized off its
 * days, deleted, moved to another row — is filled: the bars under it on those
 * days rise, and each one that rises frees its own place for the bars under
 * it. Without that a moved bar left a hole in the stack. A task that only
 * scrolled out of `layoutRange` frees nothing, so scrolling still moves no bar.
 *
 * The result is ordered by start, then by end, whatever order the lanes were
 * taken in.
 */
export const calculateTaskLanes = (
  tasks: Task[],
  reservedLaneZero: ReservedPeriod[] = [],
  previousLanes?: ReadonlyMap<string, RememberedLane>,
  layoutRange?: LayoutRange,
): TaskWithLane[] => {
  if (tasks.length === 0) return [];

  const drawOrder = [...tasks].sort(byStart);
  const placeOrder = [...tasks].sort(longestFirst);

  if (previousLanes && previousLanes.size > 0) {
    return packKeepingLanes(drawOrder, placeOrder, reservedLaneZero, previousLanes, layoutRange);
  }

  const board = packFromScratch(tasks, placeOrder, reservedLaneZero);

  return drawOrder.map((task) => wrapWithLane(task, board.laneOf(task)));
};

/** Packing that honours `previousLanes` (see calculateTaskLanes). */
const packKeepingLanes = (
  drawOrder: Task[],
  placeOrder: Task[],
  reservedLaneZero: ReservedPeriod[],
  previousLanes: ReadonlyMap<string, RememberedLane>,
  layoutRange: LayoutRange | undefined,
): TaskWithLane[] => {
  const board = createLaneBoard(reservedLaneZero);

  // Places freed by a change on screen (see calculateTaskLanes).
  const current = new Map(drawOrder.map((task) => [task.id, task]));
  const vacated: Array<LaneSpan & { lane: number }> = [];
  previousLanes.forEach((previous, id) => {
    if (previous.lane < 0) return;
    const now = current.get(id);
    const moved = Boolean(now) && (now!.startDate !== previous.startDate || now!.endDate !== previous.endDate);
    const removed = !now && Boolean(layoutRange) && sharesDays(previous, layoutRange!);
    if (moved || removed) {
      vacated.push({ lane: previous.lane, startDate: previous.startDate, endDate: previous.endDate });
    }
  });

  // Tasks that were laid out before on the same days keep their lane while it is free.
  for (const task of drawOrder) {
    const previous = previousLanes.get(task.id);
    if (!previous || previous.lane < 0) continue;
    if (previous.startDate !== task.startDate || previous.endDate !== task.endDate) continue;
    if (board.fits(previous.lane, task)) board.place(previous.lane, task);
  }
  // Everything else takes the first free lane, the longest first.
  for (const task of placeOrder) {
    if (board.isPlaced(task)) continue;
    board.place(board.firstFreeLane(task), task);
  }

  // Bars under a freed place rise into it. Top lanes first: a bar that rises
  // frees its own place for the bars under it, which come later.
  if (vacated.length > 0) {
    const byLane = [...drawOrder].sort((left, right) => (
      board.laneOf(left) - board.laneOf(right)
      || compareDates(left.startDate, right.startDate)
    ));
    for (const task of byLane) {
      const lane = board.laneOf(task);
      if (!vacated.some((place) => place.lane < lane && sharesDays(place, task))) continue;
      board.unplace(lane, task);
      const target = board.firstFreeLane(task, lane);
      board.place(target, task);
      if (target < lane) vacated.push({ lane, startDate: task.startDate, endDate: task.endDate });
    }
  }

  return drawOrder.map((task) => wrapWithLane(task, board.laneOf(task)));
};

/**
 * Get the maximum number of lanes for a set of tasks
 */
export const getMaxLanes = (tasksWithLanes: TaskWithLane[]): number => {
  if (tasksWithLanes.length === 0) return 1;
  return Math.max(...tasksWithLanes.map(t => t.lane)) + 1;
};
