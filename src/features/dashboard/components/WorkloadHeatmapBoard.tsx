import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { eachDayOfInterval, endOfMonth, format, getDay, startOfMonth } from 'date-fns';
import { t, Trans } from '@lingui/macro';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { cn } from '@/shared/lib/classNames';
import {
  useWorkloadHeatmapModel,
  type DateFnsLocale,
  type HeatmapDayCell as DayCellData,
} from '@/features/dashboard/hooks/useWorkloadHeatmapModel';
import { useRemountSafeCanvasWidth } from '@/features/dashboard/hooks/useRemountSafeCanvasWidth';
import { useMonthScrollPaging } from '@/features/dashboard/hooks/useMonthScrollPaging';
import { MILESTONE_COLOR } from '@/features/dashboard/components/heatmapCellStyle';
import {
  HeatmapDayButton,
  HeatmapDayFacts,
  HeatmapLegend,
  HeatmapOutlookLine,
} from '@/features/dashboard/components/HeatmapParts';

const MONTH_GAP = 14;
// The board's own chrome around the grid: title row, legend, gaps.
const BOARD_CHROME = 130;
// One month card around its six weeks: padding, name, weekday row, row gaps.
const CARD_CHROME = 24 + 32 + 20 + 5 * 3;
const CARD_SIDE_CHROME = 24 + 6 * 3;
const MIN_CELL = 28;
const MAX_CELL = 44;
const MIN_CARD_WIDTH = 230;
// On a touch screen (a tablet) fewer, wider months, so a day is a finger's width.
const MIN_TOUCH_CARD_WIDTH = 330;
const MAX_COLUMNS = 6;

type GridLayout = { columns: number; rows: number; cell: number };

/**
 * As many months as fit the screen without scrolling: two rows when both fit
 * with readable cells, otherwise one row of more, slimmer months. The cell
 * size follows whichever runs out first, width or height.
 */
const layoutForSpace = (width: number, height: number, touch: boolean): GridLayout => {
  const minCard = touch ? MIN_TOUCH_CARD_WIDTH : MIN_CARD_WIDTH;
  const fit = (rows: number): GridLayout => {
    const columns = Math.min(MAX_COLUMNS, Math.max(2, Math.floor((width + MONTH_GAP) / (minCard + MONTH_GAP))));
    const cardWidth = (width - (columns - 1) * MONTH_GAP) / columns;
    const byWidth = (cardWidth - CARD_SIDE_CHROME) / 7;
    const cardHeight = (height - BOARD_CHROME - (rows - 1) * MONTH_GAP) / rows;
    const byHeight = (cardHeight - CARD_CHROME) / 6;
    const cell = Math.floor(Math.min(MAX_CELL, byWidth, byHeight));
    return { columns, rows, cell };
  };
  const two = fit(2);
  if (two.cell >= 32) return two;
  const one = fit(1);
  return { ...one, cell: Math.max(MIN_CELL, one.cell) };
};

/** Room left below the board's top edge inside the window. */
const useAvailableHeight = () => {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState(800);
  const measure = useCallback(() => {
    if (!node) return;
    let top = node.getBoundingClientRect().top;
    // Measured as if the page were scrolled to the top, so scrolling never resizes the grid.
    for (let parent = node.parentElement; parent; parent = parent.parentElement) top += parent.scrollTop;
    setHeight(Math.max(320, window.innerHeight - top - 16));
  }, [node]);
  useLayoutEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);
  return { height, ref: setNode };
};

/**
 * The board on anything wider than a phone: whole months in a grid sized to
 * the screen, opening with last month and then the current one. No sideways
 * scrolling and no scrolling down — the arrows page through the months. Phones get `WorkloadHeatmapMobile` instead — same
 * model, months stacked for a thumb.
 */
export const WorkloadHeatmapBoard: React.FC = () => {
  const {
    heatmap,
    outlook,
    retry,
    showHeat,
    capacityDisplay,
    capacityOverride,
    autoCapacity,
    months,
    weekdayLabels,
    todayMonthKey,
    dateLocale,
    projectNameById,
    buildDay,
    openDay,
    openMilestone,
  } = useWorkloadHeatmapModel();
  const { width, containerRef } = useRemountSafeCanvasWidth();
  const { height, ref: heightRef } = useAvailableHeight();
  const touch = useMemo(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(pointer: coarse)').matches,
    [],
  );
  const { columns, rows, cell } = layoutForSpace(width, height, touch);
  const visibleCount = columns * rows;
  // A tablet: controls big enough for a finger.
  const roomy = touch;
  const setRefs = useCallback((node: HTMLDivElement | null) => {
    containerRef(node);
    heightRef(node);
  }, [containerRef, heightRef]);

  const todayIndex = useMemo(
    () => Math.max(0, months.findIndex((month) => format(month, 'yyyy-MM') === todayMonthKey)),
    [months, todayMonthKey],
  );
  // Index of the first month on screen; null = last month, then today's.
  const [offset, setOffset] = useState<number | null>(null);
  const lastFirst = Math.max(0, months.length - visibleCount);
  const first = Math.min(Math.max(0, offset ?? todayIndex - 1), lastFirst);
  const visible = months.slice(first, first + visibleCount);
  const shift = useCallback((by: number) => {
    setOffset(Math.min(Math.max(0, first + by), lastFirst));
  }, [first, lastFirst]);
  // Wheel and trackpad move a month at a time, a swipe a screenful — like a calendar.
  const gridRef = useMonthScrollPaging({ onStep: shift, swipeMonths: visibleCount });

  if (heatmap.loading && heatmap.days.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Trans>Loading workload...</Trans>
      </div>
    );
  }

  if (heatmap.error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <span>{heatmap.error}</span>
        <button
          type="button"
          className="rounded-md border border-border px-3 py-1.5 text-foreground hover:bg-muted"
          onClick={retry}
        >
          <Trans>Retry</Trans>
        </button>
      </div>
    );
  }

  return (
    <div ref={setRefs} className="flex flex-col gap-4 px-1 pb-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-medium">
            <Trans>Team workload</Trans>
          </h2>
          {showHeat && <HeatmapOutlookLine outlook={outlook} dateLocale={dateLocale} />}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon"
            className={roomy ? 'h-11 w-11' : 'h-9 w-9'}
            aria-label={t`Earlier`}
            disabled={first === 0}
            onClick={() => shift(-columns)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={roomy ? 'h-11' : undefined}
            onClick={() => setOffset(null)}
          >
            <Trans>Today</Trans>
          </Button>
          <Button
            variant="outline"
            size="icon"
            className={roomy ? 'h-11 w-11' : 'h-9 w-9'}
            aria-label={t`Later`}
            disabled={first + visibleCount >= months.length}
            onClick={() => shift(columns)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!showHeat && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Trans>Add active assignees to see the workload gradient. Milestones are still shown.</Trans>
        </div>
      )}

      <div
        ref={gridRef}
        data-testid="heatmap-months"
        className="grid touch-pan-y"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: MONTH_GAP }}
      >
        {visible.map((month) => {
          const monthKey = format(month, 'yyyy-MM');
          const monthStart = startOfMonth(month);
          const monthDays = eachDayOfInterval({ start: monthStart, end: endOfMonth(month) });
          const leadingBlanks = (getDay(monthStart) + 6) % 7;
          return (
            <section
              key={monthKey}
              data-testid="heatmap-month"
              data-month={monthKey}
              className={cn(
                'rounded-lg border bg-card p-3',
                monthKey === todayMonthKey ? 'border-foreground/25' : 'border-border',
              )}
            >
              <h3 className="mb-2.5 truncate text-[15px] font-semibold capitalize">
                {format(month, 'LLLL', { locale: dateLocale })}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  {format(month, 'yyyy')}
                </span>
              </h3>
              <div className="grid grid-cols-7 gap-[3px]">
                {weekdayLabels.map((label, index) => (
                  <div key={`${monthKey}-wd-${index}`} className="pb-1 text-center text-[11px] text-muted-foreground">
                    {label}
                  </div>
                ))}
                {Array.from({ length: leadingBlanks }, (_, index) => (
                  <div key={`${monthKey}-blank-${index}`} />
                ))}
                {monthDays.map((date) => (
                  <HeatmapDayCell
                    key={format(date, 'yyyy-MM-dd')}
                    day={buildDay(date)}
                    cell={cell}
                    showHeat={showHeat}
                    dateLocale={dateLocale}
                    projectNameById={projectNameById}
                    onOpenDay={openDay}
                    onOpenMilestone={openMilestone}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <HeatmapLegend>
        {showHeat && (
          <span className="flex h-3 items-center">
            <Trans>Full day ≈ {capacityDisplay} tasks/person</Trans>
            {' · '}
            {capacityOverride
              ? <Trans>set manually</Trans>
              : autoCapacity
                ? <Trans>auto from history</Trans>
                : <Trans>default</Trans>}
          </span>
        )}
      </HeatmapLegend>
    </div>
  );
};

type HeatmapDayCellProps = {
  day: DayCellData;
  cell: number;
  showHeat: boolean;
  dateLocale: DateFnsLocale;
  projectNameById: Map<string, string>;
  onOpenDay: (iso: string) => void;
  onOpenMilestone: (milestoneId: string) => void;
};

const HeatmapDayCell: React.FC<HeatmapDayCellProps> = ({
  day,
  cell,
  showHeat,
  dateLocale,
  projectNameById,
  onOpenDay,
  onOpenMilestone,
}) => {
  const size = { height: cell, fontSize: cell >= 40 ? 15 : cell >= 32 ? 14 : 13 };
  if (!day.inRange) {
    return (
      <div className="flex items-center justify-center rounded-md text-muted-foreground/40" style={size}>
        {day.dayNumber}
      </div>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <HeatmapDayButton
          day={day}
          showHeat={showHeat}
          dateLocale={dateLocale}
          style={size}
          className={cn('data-[state=open]:z-20 data-[state=open]:outline data-[state=open]:outline-2 data-[state=open]:outline-offset-2 data-[state=open]:outline-foreground')}
        />
      </PopoverTrigger>
      <PopoverContent side="right" align="start" sideOffset={10} collisionPadding={12} className="w-64">
        <p className="mb-2 text-sm font-medium capitalize">
          {format(day.date, 'EEEE, d MMMM', { locale: dateLocale })}
        </p>
        <HeatmapDayFacts day={day} showHeat={showHeat} />
        {day.milestones.length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-border pt-2">
            {day.milestones.map((milestone) => {
              const projectName = projectNameById.get(milestone.projectId);
              return (
                <li key={milestone.id}>
                  <button
                    type="button"
                    onClick={() => onOpenMilestone(milestone.id)}
                    className="-mx-1.5 flex w-[calc(100%+0.75rem)] items-start gap-2 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-muted"
                  >
                    <span className="mt-1 h-2 w-2 shrink-0 rotate-45" style={{ backgroundColor: MILESTONE_COLOR }} />
                    <span className="min-w-0">
                      <span className="block text-foreground">{milestone.title}</span>
                      {projectName && <span className="block text-muted-foreground">{projectName}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <button
          type="button"
          onClick={() => onOpenDay(day.iso)}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <Trans>Open on timeline</Trans>
        </button>
      </PopoverContent>
    </Popover>
  );
};

export default WorkloadHeatmapBoard;
