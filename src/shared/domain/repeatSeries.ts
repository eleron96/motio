import { differenceInCalendarDays, parseISO } from 'date-fns';

type RepeatComparableTask = {
  startDate: string;
};

export type RepeatCadence = 'generic' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export const inferRepeatCadence = (tasks: RepeatComparableTask[]): RepeatCadence => {
  if (tasks.length < 2) return 'generic';
  const sorted = [...tasks].sort((left, right) => left.startDate.localeCompare(right.startDate));
  const first = parseISO(sorted[0].startDate);
  const second = parseISO(sorted[1].startDate);
  const diffDays = Math.abs(differenceInCalendarDays(second, first));
  if (diffDays === 1) return 'daily';
  if (diffDays === 7) return 'weekly';
  if (diffDays >= 28 && diffDays <= 31) return 'monthly';
  if (diffDays >= 364 && diffDays <= 366) return 'yearly';
  return 'generic';
};
