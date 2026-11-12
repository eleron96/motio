import type React from 'react';
import { colorForLevel, isOverloadLevel, type HeatmapLevel } from '@/features/dashboard/lib/workloadHeatmap';
import type { HeatmapDayCell } from '@/features/dashboard/hooks/useWorkloadHeatmapModel';

export const MILESTONE_COLOR = '#0E9F6E'; // teal marker — distinct from the warm load ramp
export const WEEKEND_BG = 'rgba(128, 128, 138, 0.16)'; // Saturday and Sunday: plain grey, no load
// Diagonal hatch for holidays. Light enough that the date on top still reads.
export const HOLIDAY_HATCH: React.CSSProperties = {
  backgroundColor: 'rgba(128, 128, 138, 0.08)',
  backgroundImage:
    'repeating-linear-gradient(45deg, rgba(128,128,138,0.30) 0, rgba(128,128,138,0.30) 1.5px, transparent 1.5px, transparent 5px)',
};

/** The calm ramp up to a full day, then the three overload steps. */
export const LEGEND_LOAD_LEVELS: HeatmapLevel[] = [1, 2, 3, 4];
export const LEGEND_OVERLOAD_LEVELS: HeatmapLevel[] = [5, 6, 7];

export type DayCellLook = {
  style: React.CSSProperties | undefined;
  /** Painted by its load (as opposed to a plain, weekend or holiday day). */
  colored: boolean;
  isHoliday: boolean;
  /** No fill at all: a working day with nothing on it gets a thin outline. */
  outlined: boolean;
  /** Muted digits: weekends, and every day while there is no team to measure. */
  muted: boolean;
  overload: boolean;
};

/**
 * How a day cell is painted — the same answer for the desktop grid and the
 * phone list, so a day can never be hot on one and plain on the other.
 */
export const resolveDayCellStyle = (day: HeatmapDayCell, showHeat: boolean): DayCellLook => {
  const isHoliday = Boolean(day.holidayNames && day.holidayNames.length > 0);
  const colored = showHeat && !day.isWeekend && !isHoliday && day.level > 0;

  let style: React.CSSProperties | undefined;
  if (colored) {
    const { bg, fg } = colorForLevel(day.level);
    style = { backgroundColor: bg, color: fg };
  } else if (isHoliday) {
    style = HOLIDAY_HATCH;
  } else if (day.isWeekend) {
    style = { backgroundColor: WEEKEND_BG };
  } else if (day.isTeamAway) {
    // Reuses the holiday hatch on purpose: to the board this day is the same kind
    // of thing — nobody works it. The day reading says which of the two it is.
    style = HOLIDAY_HATCH;
  }

  return {
    style,
    colored,
    isHoliday,
    outlined: !style,
    muted: !colored && !isHoliday && !day.isTeamAway && (day.isWeekend || !showHeat),
    overload: colored && isOverloadLevel(day.level),
  };
};
