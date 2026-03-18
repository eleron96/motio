import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';

type TaskDateRange = {
  endDate: string;
  startDate: string;
};

type RepeatTaskMoveTarget = TaskDateRange & {
  id: string;
};

type ShiftedRepeatTask = RepeatTaskMoveTarget;

const formatIsoDate = (date: Date) => format(date, 'yyyy-MM-dd');

const clampShiftedRange = (
  nextStart: Date,
  nextEnd: Date,
  startDeltaDays: number,
  endDeltaDays: number,
) => {
  if (nextStart <= nextEnd) {
    return { nextStart, nextEnd };
  }

  if (startDeltaDays !== 0 && endDeltaDays === 0) {
    return { nextStart: nextEnd, nextEnd };
  }

  return { nextStart, nextEnd: nextStart };
};

export const buildShiftedRepeatTasks = (
  baseTask: TaskDateRange,
  nextBaseTask: TaskDateRange,
  tasks: RepeatTaskMoveTarget[],
): ShiftedRepeatTask[] => {
  const startDeltaDays = differenceInCalendarDays(
    parseISO(nextBaseTask.startDate),
    parseISO(baseTask.startDate),
  );
  const endDeltaDays = differenceInCalendarDays(
    parseISO(nextBaseTask.endDate),
    parseISO(baseTask.endDate),
  );

  return tasks.map((task) => {
    const originalStart = parseISO(task.startDate);
    const originalEnd = parseISO(task.endDate);
    const unclampedStart = addDays(originalStart, startDeltaDays);
    const unclampedEnd = addDays(originalEnd, endDeltaDays);
    const { nextStart, nextEnd } = clampShiftedRange(
      unclampedStart,
      unclampedEnd,
      startDeltaDays,
      endDeltaDays,
    );

    return {
      id: task.id,
      startDate: formatIsoDate(nextStart),
      endDate: formatIsoDate(nextEnd),
    };
  });
};
