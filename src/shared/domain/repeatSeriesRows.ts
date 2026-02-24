import { Task } from '@/features/planner/types/planner';
import { inferRepeatCadence, type RepeatCadence } from '@/shared/domain/repeatSeries';

export type RepeatSeriesMeta = {
  cadence: RepeatCadence;
  remaining: number;
  total: number;
};

export type RepeatSeriesRow = {
  key: string;
  task: Task;
  taskIds: string[];
  repeatMeta: RepeatSeriesMeta | null;
};

type BuildRepeatSeriesRowsOptions = {
  collapseRepeats?: boolean;
};

const sortTasksByTimeline = (left: Task, right: Task) => {
  const byStart = left.startDate.localeCompare(right.startDate);
  if (byStart !== 0) return byStart;
  const byEnd = left.endDate.localeCompare(right.endDate);
  if (byEnd !== 0) return byEnd;
  return left.title.localeCompare(right.title);
};

export const buildRepeatSeriesRows = (
  tasks: Task[],
  options: BuildRepeatSeriesRowsOptions = {},
): RepeatSeriesRow[] => {
  const { collapseRepeats = true } = options;
  if (!collapseRepeats) {
    return [...tasks]
      .sort(sortTasksByTimeline)
      .map((task) => ({
        key: task.id,
        task,
        taskIds: [task.id],
        repeatMeta: null,
      }));
  }

  const repeatBuckets = new Map<string, Task[]>();
  const rows: RepeatSeriesRow[] = [];

  tasks.forEach((task) => {
    if (!task.repeatId) {
      rows.push({
        key: task.id,
        task,
        taskIds: [task.id],
        repeatMeta: null,
      });
      return;
    }

    const bucket = repeatBuckets.get(task.repeatId) ?? [];
    bucket.push(task);
    repeatBuckets.set(task.repeatId, bucket);
  });

  repeatBuckets.forEach((bucket, repeatId) => {
    const sorted = [...bucket].sort(sortTasksByTimeline);
    rows.push({
      key: `repeat:${repeatId}`,
      task: sorted[0],
      taskIds: sorted.map((task) => task.id),
      repeatMeta: {
        cadence: inferRepeatCadence(sorted),
        remaining: Math.max(0, sorted.length - 1),
        total: sorted.length,
      },
    });
  });

  return rows.sort((left, right) => sortTasksByTimeline(left.task, right.task));
};
