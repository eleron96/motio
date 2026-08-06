import React from 'react';
import { CalendarDays, Plus } from 'lucide-react';
import { t } from '@lingui/macro';
import { format } from 'date-fns';
import type { Locale } from 'date-fns';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/shared/ui/sheet';
import { useSheetDragDismiss } from '@/shared/hooks/useSheetDragDismiss';
import { MobileListGroup, MobileListRow } from '@/shared/ui/mobile-list';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { formatDateRange } from '@/features/planner/lib/dateUtils';
import { hexToRgba } from '@/features/planner/lib/colorUtils';
import { DEFAULT_NEUTRAL_COLOR } from '@/shared/lib/colors';
import { resolveTimeOffColor } from '@/features/planner/lib/timeOffPalette';
import type { Assignee, Milestone, Project, TimeOff } from '@/features/planner/types/planner';

interface MobileDaySheetProps {
  day: Date | null;
  onOpenChange: (open: boolean) => void;
  /** Tasks landing on the day: everything, and the viewer's own. */
  counts: { total: number; mine: number };
  milestones: Milestone[];
  /** Omitted when the milestone layer is switched off in the legend. */
  showMilestones: boolean;
  timeOff: TimeOff[];
  holidayNames: string[];
  showHolidays: boolean;
  projectById: Map<string, Project>;
  assigneeById: Map<string, Assignee>;
  timeOffColors: Map<string, string>;
  dateLocale: Locale;
  canEdit: boolean;
  onOpenDay: (day: Date) => void;
  onEditMilestone: (milestone: Milestone) => void;
  onCreateMilestone: (day: Date) => void;
}

const Dot: React.FC<{ color: string }> = ({ color }) => (
  <span
    aria-hidden="true"
    className="flex h-6 w-6 items-center justify-center"
  >
    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
  </span>
);

/**
 * What is on a day, for a finger.
 *
 * The calendar tells this story in a hover card, which a touch device can never
 * open — Radix filters pointer enter/leave through `excludeTouch`, and the day
 * cell is not focusable, so the keyboard fallback is dead too. On a phone the
 * dots and circles on a day were a dead end: visible, unreadable. A tap now
 * opens the same content as a sheet, plus the two things that were hidden
 * behind a double-tap and a long-press.
 */
export const MobileDaySheet: React.FC<MobileDaySheetProps> = ({
  day,
  onOpenChange,
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
  canEdit,
  onOpenDay,
  onEditMilestone,
  onCreateMilestone,
}) => {
  const visibleMilestones = showMilestones ? milestones : [];
  const visibleHolidays = showHolidays ? holidayNames : [];
  const drag = useSheetDragDismiss(() => onOpenChange(false));

  return (
    <Sheet open={day !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        hideCloseButton
        className="max-h-[85svh] gap-0 overflow-y-auto overscroll-contain rounded-t-2xl p-0 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]"
        style={drag.style}
        {...drag.handlers}
      >
        {/* A grabber instead of a corner X: the sheet is dismissed by dragging
            it down or tapping outside, the way every other sheet here is. */}
        <div className="sticky top-0 z-10 bg-background pt-2">
          <div aria-hidden="true" className="mx-auto h-1 w-9 rounded-full bg-border" />
          <SheetHeader className="space-y-0.5 px-4 pb-3 pt-3 text-left">
            <SheetTitle className="text-base font-semibold">
              {day ? format(day, 'd MMMM yyyy', { locale: dateLocale }) : ''}
            </SheetTitle>
            <SheetDescription className="text-xs">
              {day ? format(day, 'EEEE', { locale: dateLocale }) : ''}
            </SheetDescription>
          </SheetHeader>
        </div>

        <div className="space-y-4 px-3.5 pb-2">
          {visibleHolidays.length > 0 && (
            <MobileListGroup title={t`Holiday`}>
              <MobileListRow
                title={visibleHolidays.join(', ')}
                subtitleLines={2}
                leading={<Dot color="hsl(350 80% 80%)" />}
              />
            </MobileListGroup>
          )}

          {visibleMilestones.length > 0 && (
            <MobileListGroup title={t`Milestones`}>
              {visibleMilestones.map((milestone) => {
                const project = projectById.get(milestone.projectId);
                const color = project?.color ?? DEFAULT_NEUTRAL_COLOR;
                return (
                  <MobileListRow
                    key={milestone.id}
                    title={milestone.title}
                    subtitle={project ? formatProjectLabel(project.name, project.code) : t`Project`}
                    leading={<Dot color={hexToRgba(color, 0.8) ?? color} />}
                    chevron
                    onClick={() => onEditMilestone(milestone)}
                  />
                );
              })}
            </MobileListGroup>
          )}

          {timeOff.length > 0 && (
            <MobileListGroup title={t`Away`}>
              {timeOff.map((record) => {
                const person = assigneeById.get(record.assigneeId);
                const range = formatDateRange(record.startDate, record.endDate, dateLocale);
                return (
                  <MobileListRow
                    key={record.id}
                    title={person?.name ?? t`Unknown user`}
                    subtitle={record.note ? `${range} · ${record.note}` : range}
                    subtitleLines={2}
                    leading={<Dot color={resolveTimeOffColor(timeOffColors, record.assigneeId)} />}
                  />
                );
              })}
            </MobileListGroup>
          )}

          <MobileListGroup title={t`Tasks`}>
            <MobileListRow title={t`Total`} value={String(counts.total)} />
            <MobileListRow title={t`Mine`} value={String(counts.mine)} />
          </MobileListGroup>

          <MobileListGroup>
            <MobileListRow
              title={t`Open this day`}
              icon={<CalendarDays className="h-4 w-4" />}
              chevron
              onClick={() => day && onOpenDay(day)}
            />
            {canEdit && (
              <MobileListRow
                title={t`Create milestone`}
                icon={<Plus className="h-4 w-4" />}
                onClick={() => day && onCreateMilestone(day)}
              />
            )}
          </MobileListGroup>
        </div>
      </SheetContent>
    </Sheet>
  );
};
