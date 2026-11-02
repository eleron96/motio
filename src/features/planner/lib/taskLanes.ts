import { Task } from '@/features/planner/types/planner';
import { checkOverlap } from './dateUtils';

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

/**
 * Calculate lanes for tasks to avoid visual overlapping.
 * Tasks that overlap in time are placed in different lanes.
 *
 * `reservedLaneZero` lists periods that own lane 0 (the time-off bar, which is
 * rendered outside this packer). A task is kept out of lane 0 only while it
 * overlaps one of them: on every other day lane 0 stays available, so a row with
 * a two-week vacation does not push its whole year of tasks down a lane.
 *
 * `previousLanes` (task id → lane and days in this row's last layout) keeps
 * bars where they are. Packing from scratch is greedy from the earliest task,
 * so a task that came or went on the left reshuffled every lane after it:
 * scrolling the timeline far, each window load made the bars on screen hop
 * between lanes. With it, a task keeps its lane while that lane is free over
 * its days; new tasks, tasks whose lane became taken, and tasks whose days
 * changed (dragged, resized, moved by a teammate) are placed in the first free
 * lane — a moved bar kept its old lane and hung low under free lanes of its
 * new days.
 *
 * The place a task leaves by a change on screen — dragged or resized off its
 * days, deleted, moved to another row — is filled: the bars under it on those
 * days rise, and each one that rises frees its own place for the bars under
 * it. Without that a moved bar left a hole in the stack. A task that only
 * scrolled out of `layoutRange` frees nothing, so scrolling still moves no bar.
 */
export const calculateTaskLanes = (
  tasks: Task[],
  reservedLaneZero: ReservedPeriod[] = [],
  previousLanes?: ReadonlyMap<string, RememberedLane>,
  layoutRange?: LayoutRange,
): TaskWithLane[] => {
  if (tasks.length === 0) return [];

  // Sort tasks by start date, then by end date
  const sortedTasks = [...tasks].sort((a, b) => {
    const startCompare = a.startDate.localeCompare(b.startDate);
    if (startCompare !== 0) return startCompare;
    return a.endDate.localeCompare(b.endDate);
  });

  if (previousLanes && previousLanes.size > 0) {
    return packKeepingLanes(sortedTasks, reservedLaneZero, previousLanes, layoutRange);
  }

  const result: TaskWithLane[] = [];
  const lanes: { endDate: string }[] = [];

  for (const task of sortedTasks) {
    const laneZeroTaken = reservedLaneZero.length > 0 && overlapsReserved(task, reservedLaneZero);

    // Find the first available lane
    let assignedLane = -1;

    for (let i = 0; i < lanes.length; i++) {
      if (i === 0 && laneZeroTaken) continue;
      // Check if this lane is free (task starts after lane's last task ends)
      if (!checkOverlap(task.startDate, task.endDate, lanes[i].endDate, lanes[i].endDate)) {
        // Check if task starts after lane ends
        if (task.startDate > lanes[i].endDate) {
          assignedLane = i;
          lanes[i].endDate = task.endDate;
          break;
        }
      }
    }

    // If no lane available, create a new one
    if (assignedLane === -1) {
      // Lane 0 belongs to the bar for these days, and no lane exists yet: open it
      // as an empty placeholder so later tasks that clear the period can still
      // land there. '' sorts before every ISO date, so the lane reads as free.
      if (lanes.length === 0 && laneZeroTaken) {
        lanes.push({ endDate: '' });
      }
      assignedLane = lanes.length;
      lanes.push({ endDate: task.endDate });
    }

    result.push(wrapWithLane(task, assignedLane));
  }

  return result;
};

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
 * Packing that honours `previousLanes` (see calculateTaskLanes). Each lane keeps
 * its spans sorted by start and never overlapping, so whether a task fits is
 * decided by its two neighbours. Days are inclusive: a task ending on a day and
 * another starting that day share it.
 */
const packKeepingLanes = (
  sortedTasks: Task[],
  reservedLaneZero: ReservedPeriod[],
  previousLanes: ReadonlyMap<string, RememberedLane>,
  layoutRange: LayoutRange | undefined,
): TaskWithLane[] => {
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

  // Places freed by a change on screen (see calculateTaskLanes).
  const current = new Map(sortedTasks.map((task) => [task.id, task]));
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
  for (const task of sortedTasks) {
    const previous = previousLanes.get(task.id);
    if (!previous || previous.lane < 0) continue;
    if (previous.startDate !== task.startDate || previous.endDate !== task.endDate) continue;
    if (fits(previous.lane, task)) place(previous.lane, task);
  }
  // Everything else takes the first free lane.
  for (const task of sortedTasks) {
    if (assigned.has(task)) continue;
    let lane = 0;
    while (!fits(lane, task)) lane += 1;
    place(lane, task);
  }

  // Bars under a freed place rise into it. Top lanes first: a bar that rises
  // frees its own place for the bars under it, which come later.
  if (vacated.length > 0) {
    const byLane = [...sortedTasks].sort((left, right) => (
      (assigned.get(left) as number) - (assigned.get(right) as number)
      || left.startDate.localeCompare(right.startDate)
    ));
    for (const task of byLane) {
      const lane = assigned.get(task) as number;
      if (!vacated.some((place) => place.lane < lane && sharesDays(place, task))) continue;
      unplace(lane, task);
      let target = 0;
      while (target < lane && !fits(target, task)) target += 1;
      place(target, task);
      if (target < lane) vacated.push({ lane, startDate: task.startDate, endDate: task.endDate });
    }
  }

  return sortedTasks.map((task) => wrapWithLane(task, assigned.get(task) as number));
};

/**
 * Get the maximum number of lanes for a set of tasks
 */
export const getMaxLanes = (tasksWithLanes: TaskWithLane[]): number => {
  if (tasksWithLanes.length === 0) return 1;
  return Math.max(...tasksWithLanes.map(t => t.lane)) + 1;
};
