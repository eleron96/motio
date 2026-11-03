import React from 'react';
import { addMonths, addWeeks, endOfDay, format, isWithinInterval, parseISO, startOfDay } from 'date-fns';
import { t } from '@lingui/macro';
import { cn } from '@/shared/lib/classNames';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/ui/tooltip';
import { useLocaleStore } from '@/shared/store/localeStore';
import { resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';
import { formatShortDateRange } from '@/features/dashboard/lib/dashboardUtils';
import type {
  DashboardMilestone,
  DashboardOption,
  DashboardPeriod,
  DashboardWidgetSize,
} from '@/features/dashboard/types/dashboard';

const MILESTONE_LIST_ROW_GAP_PX = 8;
const MILESTONE_MORE_ROW_RESERVE_PX = 24;

interface DashboardMilestoneListProps {
  milestones: DashboardMilestone[];
  projects: DashboardOption[];
  period: DashboardPeriod;
  size: DashboardWidgetSize;
  showPeriod: boolean;
  contentGapClass: string;
}

/**
 * Milestones from today to the end of the widget's period. As many rows as fit
 * the widget are shown — measured on a hidden copy of the whole list — and the
 * rest collapse into a "+N more" line with a tooltip.
 */
export const DashboardMilestoneList: React.FC<DashboardMilestoneListProps> = ({
  milestones,
  projects,
  period,
  size,
  showPeriod,
  contentGapClass,
}) => {
  const locale = useLocaleStore((state) => state.locale);
  const dateLocale = React.useMemo(() => resolveDateFnsLocale(locale), [locale]);
  const projectNameById = new Map(
    projects.map((project) => [project.id, formatProjectLabel(project.name, project.code)]),
  );
  const now = new Date();
  const milestoneRangeStart = startOfDay(now);
  const milestoneRangeEnd = endOfDay(
    period === 'day'
      ? now
      : period === 'week'
        ? addWeeks(now, 1)
        : addMonths(now, 1),
  );
  const periodLabel = formatShortDateRange(
    format(milestoneRangeStart, 'yyyy-MM-dd'),
    format(milestoneRangeEnd, 'yyyy-MM-dd'),
    dateLocale,
  );
  const milestonesInRange = milestones
    .filter((milestone) => isWithinInterval(parseISO(milestone.date), {
      start: milestoneRangeStart,
      end: milestoneRangeEnd,
    }))
    .sort((a, b) => {
      if (a.date === b.date) return a.title.localeCompare(b.title, locale);
      return a.date.localeCompare(b.date);
    });
  const milestoneListViewportRef = React.useRef<HTMLDivElement | null>(null);
  const milestoneMeasureRefs = React.useRef(new Map<string, HTMLDivElement>());
  const fallbackMilestoneLimit = size === 'small' ? 2 : size === 'medium' ? 4 : 6;
  const [dynamicMilestoneLimit, setDynamicMilestoneLimit] = React.useState(fallbackMilestoneLimit);
  const setMilestoneMeasureRef = React.useCallback((milestoneId: string) => (node: HTMLDivElement | null) => {
    if (!node) {
      milestoneMeasureRefs.current.delete(milestoneId);
      return;
    }
    milestoneMeasureRefs.current.set(milestoneId, node);
  }, []);

  React.useEffect(() => {
    const validIds = new Set(milestonesInRange.map((milestone) => milestone.id));
    Array.from(milestoneMeasureRefs.current.keys()).forEach((milestoneId) => {
      if (!validIds.has(milestoneId)) {
        milestoneMeasureRefs.current.delete(milestoneId);
      }
    });
  }, [milestonesInRange]);

  const recalculateMilestoneLimit = React.useCallback(() => {
    const viewport = milestoneListViewportRef.current;
    if (!viewport) return;
    const availableHeight = viewport.clientHeight;
    if (!availableHeight) return;

    const rowHeights = milestonesInRange
      .map((milestone) => milestoneMeasureRefs.current.get(milestone.id)?.offsetHeight ?? 0)
      .filter((height) => height > 0);

    if (rowHeights.length === 0) {
      setDynamicMilestoneLimit(Math.min(fallbackMilestoneLimit, milestonesInRange.length));
      return;
    }

    let usedHeight = 0;
    let visibleCount = 0;
    for (let index = 0; index < rowHeights.length; index += 1) {
      const rowHeight = rowHeights[index];
      const rowGap = index > 0 ? MILESTONE_LIST_ROW_GAP_PX : 0;
      const hasHiddenRowsAfter = index < rowHeights.length - 1;
      const moreIndicatorReserve = hasHiddenRowsAfter
        ? MILESTONE_MORE_ROW_RESERVE_PX + (visibleCount > 0 ? MILESTONE_LIST_ROW_GAP_PX : 0)
        : 0;
      const nextHeight = usedHeight + rowGap + rowHeight;
      if (nextHeight + moreIndicatorReserve > availableHeight) break;
      usedHeight = nextHeight;
      visibleCount += 1;
    }

    const normalizedLimit = Math.min(
      rowHeights.length,
      Math.max(visibleCount, rowHeights.length > 0 ? 1 : 0),
    );
    setDynamicMilestoneLimit(normalizedLimit);
  }, [milestonesInRange, fallbackMilestoneLimit]);

  React.useLayoutEffect(() => {
    recalculateMilestoneLimit();
    const viewport = milestoneListViewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(recalculateMilestoneLimit);
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [recalculateMilestoneLimit, locale]);

  const milestoneLimit = Math.min(
    milestonesInRange.length,
    Math.max(1, dynamicMilestoneLimit || fallbackMilestoneLimit),
  );
  const visibleMilestones = milestonesInRange.slice(0, milestoneLimit);
  const hiddenMilestones = milestonesInRange.slice(milestoneLimit);

  return (
    <div className={cn('flex h-full min-h-0 flex-col', contentGapClass)}>
      {milestonesInRange.length ? (
        <div ref={milestoneListViewportRef} className="relative flex-1 min-h-0 overflow-hidden">
          <div className="space-y-2 text-xs">
            {visibleMilestones.map((milestone) => {
              const projectName = projectNameById.get(milestone.projectId);
              return (
                <div key={milestone.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 break-words text-sm font-medium text-foreground">
                      {milestone.title}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {projectName ?? t`No project`}
                    </div>
                  </div>
                  <div className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                    {format(parseISO(milestone.date), 'MMM d', { locale: dateLocale })}
                  </div>
                </div>
              );
            })}
            {hiddenMilestones.length > 0 && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                    >
                      {t`+${hiddenMilestones.length} more milestones`}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs p-2 text-xs">
                    <div className="grid gap-1">
                      {hiddenMilestones.map((milestone) => (
                        <div key={milestone.id} className="flex items-center justify-between gap-3">
                          <span className="truncate">{milestone.title}</span>
                          <span className="text-muted-foreground">
                            {format(parseISO(milestone.date), 'MMM d', { locale: dateLocale })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 opacity-0">
            <div className="space-y-2 text-xs">
              {milestonesInRange.map((milestone) => {
                const projectName = projectNameById.get(milestone.projectId);
                return (
                  <div
                    key={`measure-${milestone.id}`}
                    ref={setMilestoneMeasureRef(milestone.id)}
                    className="flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 break-words text-sm font-medium text-foreground">
                        {milestone.title}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {projectName ?? t`No project`}
                      </div>
                    </div>
                    <div className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                      {format(parseISO(milestone.date), 'MMM d', { locale: dateLocale })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          {t`No milestones`}
        </div>
      )}
      {showPeriod && <div className="text-xs text-muted-foreground">{periodLabel}</div>}
    </div>
  );
};
