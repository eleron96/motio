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
 */
export const calculateTaskLanes = (
  tasks: Task[],
  reservedLaneZero: ReservedPeriod[] = [],
): TaskWithLane[] => {
  if (tasks.length === 0) return [];

  // Sort tasks by start date, then by end date
  const sortedTasks = [...tasks].sort((a, b) => {
    const startCompare = a.startDate.localeCompare(b.startDate);
    if (startCompare !== 0) return startCompare;
    return a.endDate.localeCompare(b.endDate);
  });

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

/**
 * Get the maximum number of lanes for a set of tasks
 */
export const getMaxLanes = (tasksWithLanes: TaskWithLane[]): number => {
  if (tasksWithLanes.length === 0) return 1;
  return Math.max(...tasksWithLanes.map(t => t.lane)) + 1;
};
