import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { MILESTONE_COLOR } from '@/features/dashboard/components/heatmapCellStyle';
import {
  HeatmapDayButton,
  HeatmapDayFacts,
  HeatmapLegend,
  HeatmapOutlookLine,
} from '@/features/dashboard/components/HeatmapParts';

const MONTH_GAP = 16;
// The year sits in its own column on the left, the way the timeline's calendar
// shows it; on a narrow screen it goes above its months instead.
const YEAR_COLUMN = 80;
const YEAR_COLUMN_MIN_WIDTH = 760;
const CARD_SIDE_CHROME = 24 + 6 * 3;
const MIN_CARD_WIDTH = 230;
// On a touch screen (a tablet) fewer, wider months, so a day is a finger's width.
const MIN_TOUCH_CARD_WIDTH = 330;
const MAX_COLUMNS = 4;
const MIN_CELL = 30;
const MAX_CELL = 44;

type GridLayout = { columns: number; cell: number; yearColumn: boolean };

const layoutForWidth = (width: number, touch: boolean): GridLayout => {
  const yearColumn = width >= YEAR_COLUMN_MIN_WIDTH;
  const monthsWidth = width - (yearColumn ? YEAR_COLUMN + MONTH_GAP : 0);
  const minCard = touch ? MIN_TOUCH_CARD_WIDTH : MIN_CARD_WIDTH;
  const columns = Math.min(MAX_COLUMNS, Math.max(1, Math.floor((monthsWidth + MONTH_GAP) / (minCard + MONTH_GAP))));
  const cardWidth = (monthsWidth - (columns - 1) * MONTH_GAP) / columns;
  const cell = Math.round(Math.min(MAX_CELL, Math.max(MIN_CELL, (cardWidth - CARD_SIDE_CHROME) / 7)));
  return { columns, cell, yearColumn };
};

/** Room left below the board's top edge inside the window: the board's own height. */
const useAvailableHeight = () => {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState(800);
  const measure = useCallback(() => {
    if (!node) return;
    let top = node.getBoundingClientRect().top;
    // Measured as if the page were scrolled to the top, so scrolling never resizes the board.
    for (let parent = node.parentElement; parent; parent = parent.parentElement) top += parent.scrollTop;
    setHeight(Math.max(360, window.innerHeight - top - 16));
  }, [node]);
  useLayoutEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);
  return { height, ref: setNode };
};

/** The months grouped by year, like the timeline's calendar. */
const groupByYear = (months: Date[]): Array<[number, Date[]]> => {
  const groups = new Map<number, Date[]>();
  months.forEach((month) => {
    const list = groups.get(month.getFullYear()) ?? [];
    list.push(month);
    groups.set(month.getFullYear(), list);
  });
  return Array.from(groups.entries());
};

/**
 * The board on anything wider than a phone: whole months in rows, a year at a
 * time — last year, this one and the next, like the timeline's calendar — in
 * one scroll that runs smoothly up and down. The
 * title row and the legend stay put; only the months move. It opens on the row
 * holding the current month. Phones get `WorkloadHeatmapMobile` instead — same
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
  const { columns, cell, yearColumn } = layoutForWidth(width, touch);
  const setRefs = useCallback((node: HTMLDivElement | null) => {
    containerRef(node);
    heightRef(node);
  }, [containerRef, heightRef]);

  const years = useMemo(() => groupByYear(months), [months]);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const monthRefs = useRef(new Map<string, HTMLElement>());
  const setMonthRef = useCallback((key: string) => (node: HTMLElement | null) => {
    if (node) monthRefs.current.set(key, node);
    else monthRefs.current.delete(key);
  }, []);

  const scrollToToday = useCallback((smooth: boolean) => {
    const scroller = scrollerRef.current;
    const target = monthRefs.current.get(todayMonthKey);
    if (!scroller || !target) return;
    const top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    // 'instant', not 'auto': the scroller is scroll-smooth, and 'auto' would
    // animate the opening jump too, which the board's own re-layout cuts short.
    scroller.scrollTo({ top: Math.max(0, top - 4), behavior: smooth ? 'smooth' : 'instant' });
  }, [todayMonthKey]);

  // One row of months up or down, as the arrows do in the calendar.
  const scrollByRow = useCallback((direction: 1 | -1) => {
    const scroller = scrollerRef.current;
    const card = monthRefs.current.get(todayMonthKey) ?? monthRefs.current.values().next().value;
    if (!scroller || !card) return;
    scroller.scrollBy({ top: direction * (card.offsetHeight + MONTH_GAP), behavior: 'smooth' });
  }, [todayMonthKey]);

  // Open on the current month's row. Wait for data: the board shows a loading
  // state on the first fetch, and the months are not there to scroll to yet.
  const didOpenOnToday = useRef(false);
  const ready = !heatmap.error && !(heatmap.loading && heatmap.days.length === 0);
  // Re-done while the layout settles (the width and height arrive a frame
  // late), until the person scrolls on their own.
  useLayoutEffect(() => {
    if (!ready || didOpenOnToday.current) return;
    scrollToToday(false);
  }, [ready, scrollToToday, columns, cell, height]);
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const stop = () => { didOpenOnToday.current = true; };
    scroller.addEventListener('wheel', stop, { passive: true });
    scroller.addEventListener('touchstart', stop, { passive: true });
    scroller.addEventListener('keydown', stop);
    return () => {
      scroller.removeEventListener('wheel', stop);
      scroller.removeEventListener('touchstart', stop);
      scroller.removeEventListener('keydown', stop);
    };
  }, [ready]);

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

  const navSize = touch ? 'h-11 w-11' : 'h-9 w-9';
  return (
    <div ref={setRefs} className="flex flex-col gap-3 px-1" style={{ height }}>
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-medium">
            <Trans>Team workload</Trans>
          </h2>
          {showHeat && <HeatmapOutlookLine outlook={outlook} dateLocale={dateLocale} />}
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" className={navSize} aria-label={t`Earlier`} onClick={() => scrollByRow(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className={touch ? 'h-11' : undefined} onClick={() => scrollToToday(true)}>
            <Trans>Today</Trans>
          </Button>
          <Button variant="outline" size="icon" className={navSize} aria-label={t`Later`} onClick={() => scrollByRow(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!showHeat && (
        <div className="shrink-0 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Trans>Add active assignees to see the workload gradient. Milestones are still shown.</Trans>
        </div>
      )}

      <div
        ref={scrollerRef}
        data-testid="heatmap-scroller"
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain scroll-smooth scrollbar-hidden rounded-lg"
      >
        <div className="space-y-6 pb-4 pr-1">
          {years.map(([year, yearMonths]) => (
            <div
              key={year}
              className="grid gap-x-4 gap-y-2"
              style={{ gridTemplateColumns: yearColumn ? `${YEAR_COLUMN}px minmax(0, 1fr)` : 'minmax(0, 1fr)' }}
            >
              <div
                data-testid="heatmap-year"
                className={cn('text-lg font-semibold text-muted-foreground', yearColumn && 'pt-2')}
              >
                {year}
              </div>
              <div
                className="grid"
                style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: MONTH_GAP }}
              >
                {yearMonths.map((month) => {
                  const monthKey = format(month, 'yyyy-MM');
                  const monthStart = startOfMonth(month);
                  const monthDays = eachDayOfInterval({ start: monthStart, end: endOfMonth(month) });
                  const leadingBlanks = (getDay(monthStart) + 6) % 7;
                  return (
                    <section
                      key={monthKey}
                      ref={setMonthRef(monthKey)}
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
            </div>
          ))}
        </div>
      </div>

      <HeatmapLegend className="shrink-0 pb-1">
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
