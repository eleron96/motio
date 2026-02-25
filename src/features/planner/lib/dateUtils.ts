import { 
  startOfWeek, 
  endOfWeek, 
  startOfDay, 
  endOfDay,
  addDays, 
  addWeeks, 
  addMonths,
  subDays, 
  subMonths,
  subWeeks,
  differenceInDays,
  format,
  parseISO,
  isSameDay,
  isWeekend,
  eachDayOfInterval,
} from 'date-fns';
import type { Locale as DateFnsLocale } from 'date-fns';
import { ViewMode } from '@/features/planner/types/planner';
import type { Locale as UiLocale } from '@/shared/lib/locale';
import { formatWeekdayLabel } from '@/shared/lib/dateFnsLocale';

export const DAY_WIDTH = 120; // pixels per day in day view
export const WEEK_DAY_WIDTH = 48; // pixels per day in week view
export const MIN_ROW_HEIGHT = 56; // minimum pixels per row
export const TASK_HEIGHT = 40; // height of task bar
export const TASK_GAP = 4; // gap between stacked tasks
export const HEADER_HEIGHT = 96; // pixels for timeline header
export const SIDEBAR_WIDTH = 200; // pixels for left sidebar
const TIMELINE_VISIBLE_MONTHS = 2;

export const getVisibleDays = (
  currentDate: string,
  viewMode: ViewMode,
): Date[] => {
  const date = parseISO(currentDate);
  let rangeStart = subMonths(date, TIMELINE_VISIBLE_MONTHS);
  let rangeEnd = addMonths(date, TIMELINE_VISIBLE_MONTHS);

  if (viewMode === 'week') {
    rangeStart = startOfWeek(rangeStart, { weekStartsOn: 1 });
    rangeEnd = endOfWeek(rangeEnd, { weekStartsOn: 1 });
  }

  return eachDayOfInterval({ start: rangeStart, end: rangeEnd });
};

export const getDayWidth = (viewMode: ViewMode): number => {
  if (viewMode === 'day') return DAY_WIDTH;
  return WEEK_DAY_WIDTH;
};

export const getTaskPosition = (
  startDate: string,
  endDate: string,
  visibleDays: Date[],
  dayWidth: number
): { left: number; width: number } | null => {
  if (visibleDays.length === 0) return null;
  
  const taskStart = parseISO(startDate);
  const taskEnd = parseISO(endDate);
  const firstVisibleDay = visibleDays[0];
  const lastVisibleDay = visibleDays[visibleDays.length - 1];
  
  // Check if task is visible at all
  if (taskEnd < firstVisibleDay || taskStart > lastVisibleDay) {
    return null;
  }
  
  const startOffset = differenceInDays(taskStart, firstVisibleDay);
  const duration = differenceInDays(taskEnd, taskStart) + 1;
  
  const left = startOffset * dayWidth;
  const width = duration * dayWidth - 4; // 4px gap
  
  return { left, width };
};

export const formatDateRange = (
  startDate: string,
  endDate: string,
  dateLocale?: DateFnsLocale,
): string => {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const formatOptions = dateLocale ? { locale: dateLocale } : undefined;
  
  if (isSameDay(start, end)) {
    return format(start, 'MMM d, yyyy', formatOptions);
  }
  
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${format(start, 'MMM d', formatOptions)} - ${format(end, 'd, yyyy', formatOptions)}`;
  }
  
  return `${format(start, 'MMM d', formatOptions)} - ${format(end, 'MMM d, yyyy', formatOptions)}`;
};

export const formatDayHeader = (
  date: Date,
  viewMode: ViewMode,
  dateLocale?: DateFnsLocale,
  uiLocale: UiLocale = 'en',
): { day: string; date: string } => {
  const day = viewMode === 'day'
    ? formatWeekdayLabel(date, uiLocale, { style: 'abbreviated', dateLocale })
    : formatWeekdayLabel(date, uiLocale, { style: 'narrow', dateLocale });

  if (viewMode === 'day') {
    return {
      day,
      date: format(date, 'd'),
    };
  }
  return {
    day,
    date: format(date, 'd'),
  };
};

export const isToday = (date: Date): boolean => {
  return isSameDay(date, new Date());
};

export const shouldApplyHolidayHatch = (
  dayKey: string,
  weekend: boolean,
  holidayDates?: Set<string>,
): boolean => {
  if (weekend) return false;
  return Boolean(holidayDates?.has(dayKey));
};

export const calculateNewDates = (
  originalStart: string,
  originalEnd: string,
  daysDelta: number
): { startDate: string; endDate: string } => {
  const start = parseISO(originalStart);
  const end = parseISO(originalEnd);
  
  return {
    startDate: format(addDays(start, daysDelta), 'yyyy-MM-dd'),
    endDate: format(addDays(end, daysDelta), 'yyyy-MM-dd'),
  };
};

export const calculateResizedDates = (
  originalStart: string,
  originalEnd: string,
  edge: 'left' | 'right',
  daysDelta: number
): { startDate: string; endDate: string } => {
  const start = parseISO(originalStart);
  const end = parseISO(originalEnd);
  
  if (edge === 'left') {
    const newStart = addDays(start, daysDelta);
    // Ensure start doesn't go past end
    if (newStart > end) {
      return { startDate: format(end, 'yyyy-MM-dd'), endDate: format(end, 'yyyy-MM-dd') };
    }
    return { startDate: format(newStart, 'yyyy-MM-dd'), endDate: format(end, 'yyyy-MM-dd') };
  } else {
    const newEnd = addDays(end, daysDelta);
    // Ensure end doesn't go before start
    if (newEnd < start) {
      return { startDate: format(start, 'yyyy-MM-dd'), endDate: format(start, 'yyyy-MM-dd') };
    }
    return { startDate: format(start, 'yyyy-MM-dd'), endDate: format(newEnd, 'yyyy-MM-dd') };
  }
};

export const checkOverlap = (
  task1Start: string,
  task1End: string,
  task2Start: string,
  task2End: string
): boolean => {
  const s1 = parseISO(task1Start);
  const e1 = parseISO(task1End);
  const s2 = parseISO(task2Start);
  const e2 = parseISO(task2End);
  
  return s1 <= e2 && e1 >= s2;
};

export { isWeekend, format, parseISO, addDays, subDays, addWeeks, subWeeks, differenceInDays };
