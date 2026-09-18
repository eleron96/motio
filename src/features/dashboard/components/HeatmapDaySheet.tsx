import React from 'react';
import { format } from 'date-fns';
import { Trans } from '@lingui/macro';
import { ExternalLink } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet';
import { useSheetDragDismiss } from '@/shared/hooks/useSheetDragDismiss';
import { MobileListGroup, MobileListRow } from '@/shared/ui/mobile-list';
import type { DateFnsLocale, HeatmapDayCell } from '@/features/dashboard/hooks/useWorkloadHeatmapModel';
import { MILESTONE_COLOR } from '@/features/dashboard/components/heatmapCellStyle';

interface HeatmapDaySheetProps {
  /** The day being read, or null while the sheet is closed. */
  day: HeatmapDayCell | null;
  showHeat: boolean;
  dateLocale: DateFnsLocale;
  projectNameById: Map<string, string>;
  onOpenChange: (open: boolean) => void;
  onOpenDay: (iso: string) => void;
  onOpenMilestone: (milestoneId: string) => void;
}

const Diamond: React.FC = () => (
  <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center">
    <span className="h-2 w-2 rotate-45" style={{ backgroundColor: MILESTONE_COLOR }} />
  </span>
);

/**
 * The day reading, for a finger.
 *
 * On a desktop the same facts live in a popover anchored to the cell. A phone
 * has no room beside a 44px cell for a card, and a popover there is a fixed
 * box that never scrolls with the finger — so the reading comes up from the
 * bottom as a sheet, the way every other detail does on a phone here.
 */
export const HeatmapDaySheet: React.FC<HeatmapDaySheetProps> = ({
  day,
  showHeat,
  dateLocale,
  projectNameById,
  onOpenChange,
  onOpenDay,
  onOpenMilestone,
}) => {
  const drag = useSheetDragDismiss(() => onOpenChange(false));
  const isHoliday = Boolean(day?.holidayNames && day.holidayNames.length > 0);

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
            <SheetTitle className="text-base font-semibold capitalize">
              {day ? format(day.date, 'd MMMM yyyy', { locale: dateLocale }) : ''}
            </SheetTitle>
            <SheetDescription className="text-xs capitalize">
              {day ? format(day.date, 'EEEE', { locale: dateLocale }) : ''}
            </SheetDescription>
          </SheetHeader>
        </div>

        {day && (
          <div className="space-y-4 px-3.5 pb-2">
            {(isHoliday || day.isWeekend || day.isTeamAway) && (
              <p className="px-1.5 text-sm text-muted-foreground">
                {isHoliday ? (
                  <>
                    <Trans>Holiday</Trans>
                    {' — '}
                    {day.holidayNames?.join(', ')}
                  </>
                ) : day.isWeekend ? (
                  <Trans>Day off</Trans>
                ) : (
                  <Trans>The whole team is away</Trans>
                )}
              </p>
            )}

            <MobileListGroup>
              <MobileListRow title={<Trans>Tasks</Trans>} value={String(day.taskCount)} />
              {showHeat && !day.isTeamAway && (
                <MobileListRow
                  title={<Trans>Load</Trans>}
                  value={(
                    <span>
                      {`${day.percent}%`}
                      {day.percent > 100 && (
                        <span className="text-destructive">
                          {' · '}
                          <Trans>overloaded</Trans>
                        </span>
                      )}
                    </span>
                  )}
                />
              )}
              {/* Explains why a day reads hotter than its task count suggests. */}
              {showHeat && !day.isTeamAway && day.awayCount > 0 && (
                <MobileListRow title={<Trans>Away: {day.awayCount} of {day.headcount}</Trans>} />
              )}
            </MobileListGroup>

            <MobileListGroup title={<Trans>Milestones</Trans>}>
              {day.milestones.length > 0 ? (
                day.milestones.map((milestone) => (
                  <MobileListRow
                    key={milestone.id}
                    leading={<Diamond />}
                    title={milestone.title}
                    subtitle={projectNameById.get(milestone.projectId)}
                    chevron
                    onClick={() => onOpenMilestone(milestone.id)}
                  />
                ))
              ) : (
                <MobileListRow
                  title={(
                    <span className="text-sm font-normal text-muted-foreground">
                      <Trans>No milestones on this day</Trans>
                    </span>
                  )}
                />
              )}
            </MobileListGroup>

            <button
              type="button"
              onClick={() => onOpenDay(day.iso)}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card text-sm font-medium text-foreground active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ExternalLink className="h-4 w-4" />
              <Trans>Open on timeline</Trans>
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
