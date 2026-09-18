import type React from 'react';
import { colorForLevel, type HeatmapLevel } from '@/features/dashboard/lib/workloadHeatmap';
import type { HeatmapDayCell } from '@/features/dashboard/hooks/useWorkloadHeatmapModel';

export const MILESTONE_COLOR = '#0E9F6E'; // teal marker — distinct from the warm load ramp
export const WEEKEND_BG = 'rgba(128, 128, 138, 0.20)'; // neutral, a shade darker than a free day
// Diagonal hatch for holidays — reads on light and dark surfaces.
export const HOLIDAY_HATCH: React.CSSProperties = {
  backgroundColor: 'rgba(128, 128, 138, 0.10)',
  backgroundImage:
    'repeating-linear-gradient(45deg, rgba(128,128,138,0.6) 0, rgba(128,128,138,0.6) 1.5px, transparent 1.5px, transparent 5px)',
};

export const LEGEND_LEVELS: HeatmapLevel[] = [1, 2, 3, 4, 5];

/**
 * How a day cell is painted — the same answer for the desktop strip and the
 * phone list, so a day can never be hot on one and plain on the other.
 */
export const resolveDayCellStyle = (
  day: HeatmapDayCell,
  showHeat: boolean,
): { style: React.CSSProperties | undefined; colored: boolean; isHoliday: boolean } => {
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

  return { style, colored, isHoliday };
};
