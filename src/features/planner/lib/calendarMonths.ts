// Which months the calendar view renders.
//
// WHOLE calendar years — last year, this year, next year — rather than a sliding
// window of N months either side. A window anchored on the current date cuts both
// end years in half, so January of "last year" is on screen in July but gone in
// August; whole years mean the page always starts on a 1 January and ends on a
// 31 December, and the year headings each cover twelve cards.
//
// Still bounded, and that is the point: the original rule (earliest task -1 year
// … latest task +5 years) produced 84-108 month cards and ~3900 day cells, slow
// to render and dishonest besides — milestones and time off are loaded around the
// current date, so far-out months showed empty days that read as "nothing here"
// rather than "not loaded". Three years is 36 cards, roughly 1500 cells.

import { addMonths } from 'date-fns';

/** One year back and one forward, plus the current one — three on screen. */
export const CALENDAR_YEARS_BACK = 1;
export const CALENDAR_YEARS_FORWARD = 1;

const MONTHS_IN_YEAR = 12;

export const buildCalendarMonths = (
  currentDate: string,
  yearsBack: number = CALENDAR_YEARS_BACK,
  yearsForward: number = CALENDAR_YEARS_FORWARD,
): Date[] => {
  // The YEAR of the current date, not the date itself: the window has to snap to
  // January so it does not drift month by month as the user navigates.
  const year = Number(currentDate.slice(0, 4));
  const firstMonth = new Date(year - yearsBack, 0, 1);
  const total = (yearsBack + yearsForward + 1) * MONTHS_IN_YEAR;

  return Array.from({ length: total }, (_, index) => addMonths(firstMonth, index));
};
