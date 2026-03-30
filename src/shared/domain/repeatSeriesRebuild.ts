import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  format,
  parseISO,
} from 'date-fns';

export type RepeatSeriesFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';
export type RepeatSeriesEnds = 'never' | 'on' | 'after';

export type RepeatSeriesRebuildTask = {
  id: string;
  startDate: string;
  endDate: string;
};

type RepeatSeriesRebuildOptions = {
  frequency: RepeatSeriesFrequency;
  ends: RepeatSeriesEnds;
  untilDate?: string;
  count?: number;
};

type RepeatSeriesRebuildInput = {
  anchorTaskId: string;
  tasks: RepeatSeriesRebuildTask[];
  options: RepeatSeriesRebuildOptions;
};

export type RepeatSeriesRebuildPlan = {
  create: Array<{
    startDate: string;
    endDate: string;
  }>;
  deleteIds: string[];
  updates: Array<{
    id: string;
    startDate: string;
    endDate: string;
  }>;
};

const formatIsoDate = (date: Date) => format(date, 'yyyy-MM-dd');

const addInterval = (
  date: Date,
  step: number,
  frequency: RepeatSeriesFrequency,
) => {
  switch (frequency) {
    case 'daily':
      return addDays(date, step);
    case 'weekly':
      return addWeeks(date, step);
    case 'biweekly':
      return addWeeks(date, step * 2);
    case 'monthly':
      return addMonths(date, step);
    case 'yearly':
      return addYears(date, step);
    default:
      return addWeeks(date, step);
  }
};

const buildOccurrenceDates = (
  anchorDate: Date,
  options: RepeatSeriesRebuildOptions,
): string[] => {
  const dates = [formatIsoDate(anchorDate)];
  const untilDate = options.untilDate ? parseISO(options.untilDate) : null;
  const limitDate = addYears(anchorDate, 1);
  const targetOccurrences = options.count && options.count > 0
    ? options.count
    : 1;

  for (let index = 1; index <= 500; index += 1) {
    if (options.ends === 'after' && index >= targetOccurrences) break;

    const nextDate = addInterval(anchorDate, index, options.frequency);
    if (options.ends === 'on' && untilDate && nextDate > untilDate) break;
    if (options.ends === 'never' && nextDate > limitDate) break;

    dates.push(formatIsoDate(nextDate));
  }

  return dates;
};

/**
 * Rebuilds the affected slice of a repeat series from the selected anchor task.
 * Existing tasks keep their ids and per-task duration where possible.
 */
export const buildRepeatSeriesRebuildPlan = ({
  anchorTaskId,
  tasks,
  options,
}: RepeatSeriesRebuildInput): RepeatSeriesRebuildPlan => {
  if (tasks.length === 0) {
    return { updates: [], deleteIds: [], create: [] };
  }

  const sortedTasks = [...tasks].sort((left, right) => (
    left.startDate.localeCompare(right.startDate) || left.id.localeCompare(right.id)
  ));
  const anchorIndex = sortedTasks.findIndex((task) => task.id === anchorTaskId);
  const targetTasks = sortedTasks.slice(anchorIndex >= 0 ? anchorIndex : 0);
  if (targetTasks.length === 0) {
    return { updates: [], deleteIds: [], create: [] };
  }

  const anchorTask = targetTasks[0];
  const anchorStart = parseISO(anchorTask.startDate);
  const anchorDuration = Math.max(
    0,
    differenceInCalendarDays(parseISO(anchorTask.endDate), parseISO(anchorTask.startDate)),
  );
  const occurrenceDates = buildOccurrenceDates(anchorStart, options);

  const updates = occurrenceDates
    .slice(0, Math.min(targetTasks.length, occurrenceDates.length))
    .map((startDate, index) => {
      const task = targetTasks[index];
      const durationDays = Math.max(
        0,
        differenceInCalendarDays(parseISO(task.endDate), parseISO(task.startDate)),
      );
      const endDate = formatIsoDate(addDays(parseISO(startDate), durationDays));
      return {
        id: task.id,
        startDate,
        endDate,
      };
    })
    .filter((item, index) => {
      const currentTask = targetTasks[index];
      return currentTask.startDate !== item.startDate || currentTask.endDate !== item.endDate;
    });

  const deleteIds = targetTasks
    .slice(occurrenceDates.length)
    .map((task) => task.id);

  const create = occurrenceDates
    .slice(targetTasks.length)
    .map((startDate) => ({
      startDate,
      endDate: formatIsoDate(addDays(parseISO(startDate), anchorDuration)),
    }));

  return {
    updates,
    deleteIds,
    create,
  };
};
