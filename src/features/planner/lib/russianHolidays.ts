// Fallback non-working days for Russia when the production calendar is not out
// yet.
//
// isdayoff.ru only knows a year once the government has signed the transfer
// decree — usually in the autumn of the preceding year. Until then it answers
// with a string of zeros, which reads as "every day is a working day" rather
// than "no data" (verified for 2027: 365 zeros, while 2026 comes back correct).
// date.nager.at is no substitute: for RU it lists 1-7 January and misses the
// 8th, so the New Year break looks a day short.
//
// So for a year with no calendar we compute the statutory days from the Labour
// Code (art. 112) ourselves. The one thing we cannot know is which working days
// the government will move around ("мостики") — those are decided per year, so
// the result is the legal minimum, never a guess about transfers.

const pad = (value: number) => String(value).padStart(2, '0');

const iso = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;

/** Art. 112: fixed non-working public holidays, New Year break included. */
const STATUTORY_DAYS: Array<[month: number, day: number]> = [
  [1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [1, 7], [1, 8], // New Year + Christmas
  [2, 23], // Defender of the Fatherland
  [3, 8], // International Women's Day
  [5, 1], // Spring and Labour Day
  [5, 9], // Victory Day
  [6, 12], // Russia Day
  [11, 4], // Unity Day
];

const isWeekendDate = (date: Date) => date.getDay() === 0 || date.getDay() === 6;

/**
 * Non-working days of a Russian year, as ISO strings.
 *
 * A holiday that lands on a weekend moves the day off to the next working day
 * (art. 112 part 2). January is excluded from that rule on purpose: the New
 * Year transfers are set by decree each year and land anywhere from February to
 * November, so inventing them would be worse than leaving them out.
 */
export const russianStatutoryHolidays = (year: number): string[] => {
  const days = new Set<string>();
  const rolled: string[] = [];

  STATUTORY_DAYS.forEach(([month, day]) => {
    const key = iso(year, month, day);
    days.add(key);

    if (month === 1) return;

    const date = new Date(`${key}T12:00:00`);
    if (!isWeekendDate(date)) return;

    // Walk forward to the first day that is neither a weekend nor a holiday.
    const moved = new Date(date);
    do {
      moved.setDate(moved.getDate() + 1);
    } while (
      isWeekendDate(moved)
      || STATUTORY_DAYS.some(([m, d]) => (
        moved.getMonth() + 1 === m && moved.getDate() === d
      ))
    );
    rolled.push(iso(moved.getFullYear(), moved.getMonth() + 1, moved.getDate()));
  });

  rolled.forEach((key) => days.add(key));

  return [...days].sort();
};

/**
 * True when the production-calendar payload carries no information: isdayoff.ru
 * answers with all zeros for a year it does not know yet, which would otherwise
 * be read as "nothing is a day off".
 */
export const isEmptyProductionCalendar = (raw: string | null | undefined): boolean => {
  if (!raw) return true;
  return !raw.includes('1');
};
