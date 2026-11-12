import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { eachDayOfInterval, endOfMonth, format, getDay, startOfMonth } from 'date-fns';
import { Trans } from '@lingui/macro';
import {
  useWorkloadHeatmapModel,
  type DateFnsLocale,
  type HeatmapDayCell,
} from '@/features/dashboard/hooks/useWorkloadHeatmapModel';
import {
  HeatmapDayButton,
  HeatmapLegend,
  HeatmapOutlookLine,
} from '@/features/dashboard/components/HeatmapParts';
import { HeatmapDaySheet } from '@/features/dashboard/components/HeatmapDaySheet';

/**
 * Puts a month at the top of the list. Only the list moves: `scrollIntoView`
 * would also nudge every scrollable ancestor, and on a phone one of those is
 * the swipe deck's track, which must never scroll on its own.
 */
const scrollToMonth = (scroller: HTMLElement, target: HTMLElement, smooth: boolean) => {
  const top = target.getBoundingClientRect().top
    - scroller.getBoundingClientRect().top
    + scroller.scrollTop;
  const next = Math.max(0, top);
  if (typeof scroller.scrollTo === 'function') {
    scroller.scrollTo({ top: next, behavior: smooth ? 'smooth' : 'auto' });
  } else {
    scroller.scrollTop = next;
  }
};

/**
 * The workload board on a phone: the same window as the desktop strip, months
 * stacked top to bottom instead of side by side.
 *
 * Sideways is the wrong axis for a thumb — the strip fit one month per screen,
 * its cells were under the touch minimum, and a horizontal drag near the edge
 * fought the system's back gesture. Here each month is a full-width grid of
 * finger-sized cells, the month name and weekday row stay pinned while its
 * weeks scroll under them, and a tap opens the day as a sheet.
 */
export const WorkloadHeatmapMobile: React.FC = () => {
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

  const scrollerRef = useRef<HTMLDivElement>(null);
  const todayMonthRef = useRef<HTMLElement>(null);
  const didAutoScroll = useRef(false);
  const [todayVisible, setTodayVisible] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const ready = !heatmap.error && !(heatmap.loading && heatmap.days.length === 0);

  // Open on the current month. The three months of history stay above it — a
  // flick up is all it takes to see them — but they are not what you came for.
  useEffect(() => {
    if (!ready || didAutoScroll.current) return;
    const scroller = scrollerRef.current;
    const target = todayMonthRef.current;
    if (!scroller || !target) return;
    didAutoScroll.current = true;
    scrollToMonth(scroller, target, false);
  }, [ready]);

  // The "Today" pill only appears once the current month has left the screen.
  useEffect(() => {
    if (!ready) return;
    const target = todayMonthRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) setTodayVisible(entry.isIntersecting);
    }, { root: scrollerRef.current, threshold: 0 });
    observer.observe(target);
    return () => observer.disconnect();
  }, [ready]);

  const scrollToToday = useCallback(() => {
    const scroller = scrollerRef.current;
    const target = todayMonthRef.current;
    if (!scroller || !target) return;
    scrollToMonth(scroller, target, true);
  }, []);

  // Rebuilt from the model rather than cached from the tap, so the sheet
  // follows a refresh that lands while it is open.
  const selectedDay = useMemo(
    () => (selectedDate ? buildDay(selectedDate) : null),
    [selectedDate, buildDay],
  );

  if (heatmap.loading && heatmap.days.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Trans>Loading workload...</Trans>
      </div>
    );
  }

  if (heatmap.error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-sm text-muted-foreground">
        <span>{heatmap.error}</span>
        <button
          type="button"
          className="h-11 rounded-md border border-border px-4 text-foreground active:bg-muted"
          onClick={retry}
        >
          <Trans>Retry</Trans>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={scrollerRef}
      data-testid="heatmap-mobile-scroller"
      className="h-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom,0px)+2rem)]"
      style={{ touchAction: 'pan-y' }}
    >
      <div className="pt-2">
        <h2 className="text-base font-medium">
          <Trans>Team workload</Trans>
        </h2>
        {showHeat && <HeatmapOutlookLine outlook={outlook} dateLocale={dateLocale} className="text-xs" />}
        <HeatmapLegend className="mt-3 gap-x-4">
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

      {!showHeat && (
        <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Trans>Add active assignees to see the workload gradient. Milestones are still shown.</Trans>
        </div>
      )}

      {months.map((month) => {
        const monthKey = format(month, 'yyyy-MM');
        const monthStart = startOfMonth(month);
        const monthDays = eachDayOfInterval({ start: monthStart, end: endOfMonth(month) });
        const leadingBlanks = (getDay(monthStart) + 6) % 7;
        const isTodayMonth = monthKey === todayMonthKey;
        return (
          <section
            key={monthKey}
            ref={isTodayMonth ? todayMonthRef : undefined}
            data-testid="heatmap-month"
            data-month={monthKey}
            className="pt-3"
          >
            {/* Pinned while the month's weeks scroll under it. The negative
                margin lets it cover the gutters too, so no cell peeks out
                beside the header on its way up. */}
            <div className="sticky top-0 z-20 -mx-4 border-b border-border bg-background px-4 pb-1.5 pt-2">
              <h3 className="text-[15px] font-semibold capitalize">
                {format(month, 'LLLL', { locale: dateLocale })}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">{format(month, 'yyyy')}</span>
              </h3>
              <div className="mt-1.5 grid grid-cols-7 gap-1">
                {weekdayLabels.map((label, index) => (
                  <div
                    key={`${monthKey}-wd-${index}`}
                    className="text-center text-[11px] text-muted-foreground"
                  >
                    {label}
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 pt-1.5">
              {Array.from({ length: leadingBlanks }, (_, index) => (
                <div key={`${monthKey}-blank-${index}`} />
              ))}
              {monthDays.map((date) => (
                <MobileDayCell
                  key={format(date, 'yyyy-MM-dd')}
                  day={buildDay(date)}
                  showHeat={showHeat}
                  dateLocale={dateLocale}
                  onSelect={setSelectedDate}
                />
              ))}
            </div>
          </section>
        );
      })}

      {/* Rides the bottom edge of the list, not the screen: a fixed pill would
          also show over the dashboards page sitting next to this one in the
          swipe deck. */}
      <div className="pointer-events-none sticky bottom-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] z-20 mt-4 flex h-12 items-end justify-center">
        {!todayVisible && (
          <button
            type="button"
            onClick={scrollToToday}
            className="pointer-events-auto h-10 rounded-full border border-border bg-card px-5 text-sm font-medium text-foreground shadow-md active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Trans>Today</Trans>
          </button>
        )}
      </div>

      <HeatmapDaySheet
        day={selectedDay}
        showHeat={showHeat}
        dateLocale={dateLocale}
        projectNameById={projectNameById}
        onOpenChange={(open) => {
          if (!open) setSelectedDate(null);
        }}
        onOpenDay={openDay}
        onOpenMilestone={openMilestone}
      />
    </div>
  );
};

type MobileDayCellProps = {
  day: HeatmapDayCell;
  showHeat: boolean;
  dateLocale: DateFnsLocale;
  onSelect: (date: Date) => void;
};

const MobileDayCell: React.FC<MobileDayCellProps> = ({ day, showHeat, dateLocale, onSelect }) => {
  if (!day.inRange) {
    return (
      <div className="flex h-11 items-center justify-center rounded-md text-[15px] text-muted-foreground/40">
        {day.dayNumber}
      </div>
    );
  }

  return (
    <HeatmapDayButton
      day={day}
      showHeat={showHeat}
      dateLocale={dateLocale}
      onClick={() => onSelect(day.date)}
      // 44px tall: the touch minimum.
      className="h-11 rounded-lg text-[15px] [-webkit-tap-highlight-color:transparent] active:opacity-70"
    />
  );
};

export default WorkloadHeatmapMobile;
