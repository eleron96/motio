import React from 'react';
import { t } from '@lingui/macro';
import type { Locale as DateFnsLocale } from 'date-fns';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { DEFAULT_NEUTRAL_COLOR } from '@/shared/lib/colors';
import { hexToRgba } from '@/features/planner/lib/colorUtils';
import { formatDateRange } from '@/features/planner/lib/dateUtils';
import { resolveTimeOffColor } from '@/features/planner/lib/timeOffPalette';
import type { Assignee, Milestone, Project, TimeOff } from '@/features/planner/types/planner';

interface CalendarDayHoverContentProps {
  counts: { total: number; mine: number };
  milestones: Milestone[];
  showMilestones: boolean;
  /** Who is away that day; nothing when the time-off overlay is off. */
  timeOff: TimeOff[] | null;
  holidayNames: string[];
  showHolidays: boolean;
  projectById: Map<string, Project>;
  assigneeById: Map<string, Assignee>;
  timeOffColors: Map<string, string>;
  dateLocale: DateFnsLocale;
  onEditMilestone: (milestone: Milestone) => void;
}

/**
 * What hovering a calendar day shows: its milestones (each opens for editing),
 * the task counts, who is away and the holiday. Mounted only while the hover
 * card is open.
 */
export const CalendarDayHoverContent: React.FC<CalendarDayHoverContentProps> = ({
  counts,
  milestones,
  showMilestones,
  timeOff,
  holidayNames,
  showHolidays,
  projectById,
  assigneeById,
  timeOffColors,
  dateLocale,
  onEditMilestone,
}) => (
  <div className="space-y-2 p-3">
    {showMilestones && milestones.length > 0 && (
      <div className="space-y-1 border-b border-border/60 pb-2">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {t`Milestones`}
        </div>
        <div className="space-y-0.5">
          {milestones.map((milestone) => {
            const project = projectById.get(milestone.projectId);
            const color = project?.color ?? DEFAULT_NEUTRAL_COLOR;
            const dotColor = hexToRgba(color, 0.8) ?? color;
            return (
              <button
                type="button"
                key={milestone.id}
                onClick={() => onEditMilestone(milestone)}
                className="flex w-full items-start gap-2 rounded-md px-2 py-1 text-left hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                aria-label={t`Edit milestone`}
              >
                <span
                  className="mt-1 h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: dotColor }}
                />
                <span className="min-w-0">
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {project
                      ? formatProjectLabel(project.name, project.code)
                      : t`Project`}
                  </span>
                  <span className="block truncate text-sm">
                    {milestone.title}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    )}
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{t`Total`}</span>
      <span className="font-semibold">{counts.total}</span>
    </div>
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{t`Mine`}</span>
      <span className="font-semibold">{counts.mine}</span>
    </div>
    {timeOff && (
      <div className="space-y-1 border-t border-border/60 pt-1.5">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {t`Away`}
        </div>
        <div className="space-y-0.5">
          {timeOff.map((record) => {
            const person = assigneeById.get(record.assigneeId);
            return (
              <div key={record.id} className="flex items-start gap-2">
                <span
                  className="mt-1 h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: resolveTimeOffColor(timeOffColors, record.assigneeId) }}
                />
                <span className="min-w-0">
                  <span className="block truncate text-[11px] text-foreground">
                    {person?.name ?? t`Unknown user`}
                  </span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {formatDateRange(record.startDate, record.endDate, dateLocale)}
                    {record.note ? ` · ${record.note}` : ''}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    )}
    {showHolidays && holidayNames.length > 0 && (
      <div className="border-t border-border/60 pt-1 text-[11px] text-muted-foreground">
        <span className="text-foreground">{t`Holiday:`}</span>{' '}
        {holidayNames.join(', ')}
      </div>
    )}
  </div>
);
