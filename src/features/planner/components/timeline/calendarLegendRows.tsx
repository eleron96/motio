import React from 'react';
import { t } from '@lingui/macro';
import type { CalendarOverlayCategory } from '@/features/planner/lib/calendarDayMarkers';

export interface CalendarLegendRow {
  category: CalendarOverlayCategory;
  label: string;
  hint: string;
  swatch: React.ReactNode;
}

/**
 * What the calendar draws, in words and in colour — the single source for both
 * the desktop legend panel and the phone's legend screen, so the two can never
 * explain the same mark differently.
 *
 * A function, not a constant: the labels go through the lingui macro and must be
 * evaluated on each render for a language switch to reach them.
 */
export const buildCalendarLegendRows = (showTimeOffRow: boolean): CalendarLegendRow[] => {
  const rows: CalendarLegendRow[] = [
    {
      category: 'holidays',
      label: t`Holidays`,
      hint: t`Non-working days of the country set for the workspace.`,
      swatch: <span className="h-3.5 w-3.5 rounded-full bg-rose-200/70 ring-1 ring-border" />,
    },
    {
      category: 'milestones',
      label: t`Milestones`,
      hint: t`Deliveries, coloured by project.`,
      swatch: (
        <span className="flex h-3.5 w-3.5 items-center justify-center gap-px">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        </span>
      ),
    },
  ];

  if (showTimeOffRow) {
    rows.push({
      category: 'timeOff',
      label: t`Team time off`,
      hint: t`A circle on the day; split when several people are away.`,
      swatch: (
        <span
          className="h-3.5 w-3.5 rounded-full ring-1 ring-border"
          style={{
            background: 'conic-gradient(from 0deg, hsl(210, 72%, 80%) 0deg 180deg, hsl(150, 55%, 76%) 181deg 360deg)',
          }}
        />
      ),
    });
  }

  return rows;
};
