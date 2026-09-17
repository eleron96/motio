import React, { useCallback, useEffect, useRef, useState } from 'react';
import { eachDayOfInterval, endOfMonth, format, getDay, startOfMonth } from 'date-fns';
import { Trans } from '@lingui/macro';
import { ExternalLink } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { cn } from '@/shared/lib/classNames';
import { colorForLevel } from '@/features/dashboard/lib/workloadHeatmap';
import {
  useWorkloadHeatmapModel,
  type DateFnsLocale,
  type HeatmapDayCell as DayCellData,
} from '@/features/dashboard/hooks/useWorkloadHeatmapModel';
import {
  HOLIDAY_HATCH,
  LEGEND_LEVELS,
  MILESTONE_COLOR,
  resolveDayCellStyle,
} from '@/features/dashboard/components/heatmapCellStyle';

/**
 * The desktop board: months side by side in a strip that opens with the current
 * month flush to the left and scrolls horizontally. Phones get
 * `WorkloadHeatmapMobile` instead — same model, months stacked for a thumb.
 */
export const WorkloadHeatmapBoard: React.FC = () => {
  const {
    heatmap,
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

  const stripRef = useRef<HTMLDivElement>(null);
  const todayMonthRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const dragRef = useRef<{ startX: number; startLeft: number } | null>(null);
  // Click-and-drag panning of the strip itself (mouse only). Tracks a pending
  // press until it crosses the threshold, then takes over as a pan.
  const panRef = useRef<{ pointerId: number; startX: number; startLeft: number; active: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const didAutoScroll = useRef(false);
  const [nav, setNav] = useState({ todayVisible: true });
  const [isPanning, setIsPanning] = useState(false);

  const syncScrollUi = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const { scrollLeft, scrollWidth, clientWidth } = strip;
    const maxScroll = Math.max(1, scrollWidth - clientWidth);
    const posFrac = Math.min(1, Math.max(0, scrollLeft / maxScroll));
    if (thumbRef.current && trackRef.current) {
      const usable = Math.max(0, trackRef.current.clientWidth - thumbRef.current.offsetWidth);
      thumbRef.current.style.left = `${posFrac * usable}px`;
    }
    let todayVisible = true;
    const target = todayMonthRef.current;
    if (target) {
      const s = strip.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      todayVisible = rect.right > s.left + 8 && rect.left < s.right - 8;
    }
    setNav((prev) => (prev.todayVisible === todayVisible ? prev : { todayVisible }));
  }, []);

  const onScroll = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = 0;
      syncScrollUi();
    });
  }, [syncScrollUi]);

  const alignTodayLeft = useCallback((smooth: boolean) => {
    const strip = stripRef.current;
    const target = todayMonthRef.current;
    if (!strip || !target) return;
    const s = strip.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    const contentLeft = (rect.left - s.left) + strip.scrollLeft;
    strip.scrollTo({ left: Math.max(0, contentLeft - 4), behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  const onThumbPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const strip = stripRef.current;
    if (!strip) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { startX: event.clientX, startLeft: strip.scrollLeft };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onThumbPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const strip = stripRef.current;
    const track = trackRef.current;
    if (!drag || !strip || !track) return;
    const maxScroll = strip.scrollWidth - strip.clientWidth;
    const usable = track.clientWidth - (thumbRef.current?.offsetWidth ?? 0);
    const deltaScroll = usable > 0 ? ((event.clientX - drag.startX) / usable) * maxScroll : 0;
    strip.scrollLeft = drag.startLeft + deltaScroll;
  }, []);

  const onThumbPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // pointer capture may already be released
    }
  }, []);

  const onTrackPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (thumbRef.current?.contains(event.target as Node)) return;
    const strip = stripRef.current;
    const track = trackRef.current;
    if (!strip || !track) return;
    const rect = track.getBoundingClientRect();
    const capWidth = thumbRef.current?.offsetWidth ?? 0;
    const usable = Math.max(1, rect.width - capWidth);
    const frac = Math.min(1, Math.max(0, (event.clientX - rect.left - capWidth / 2) / usable));
    strip.scrollTo({ left: frac * (strip.scrollWidth - strip.clientWidth), behavior: 'smooth' });
  }, []);

  // Drag-to-scroll the whole strip by holding the left mouse button. Touch/pen
  // keep their native scroll; a press only becomes a pan after it moves past a
  // small threshold, so a plain click still opens the day popover.
  const PAN_THRESHOLD = 4;

  const onStripPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    const strip = stripRef.current;
    if (!strip) return;
    suppressClickRef.current = false;
    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startLeft: strip.scrollLeft,
      active: false,
    };
  }, []);

  const onStripPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    const strip = stripRef.current;
    if (!pan || !strip) return;
    const dx = event.clientX - pan.startX;
    if (!pan.active) {
      if (Math.abs(dx) < PAN_THRESHOLD) return;
      pan.active = true;
      suppressClickRef.current = true;
      setIsPanning(true);
      try {
        strip.setPointerCapture(pan.pointerId);
      } catch {
        // pointer capture may be unavailable; the pan still works without it
      }
    }
    strip.scrollLeft = pan.startLeft - dx;
  }, []);

  const onStripPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    panRef.current = null;
    if (!pan) return;
    if (pan.active) {
      setIsPanning(false);
      try {
        stripRef.current?.releasePointerCapture(pan.pointerId);
      } catch {
        // pointer capture may already be released
      }
    }
  }, []);

  // Swallow the click that trails a drag so panning never opens a day popover.
  const onStripClickCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  // Open on the current month, flush left. Wait for data so the strip is mounted
  // and laid out (it briefly unmounts behind the loading state on first fetch).
  useEffect(() => {
    if (didAutoScroll.current) return;
    if (heatmap.days.length === 0) return;
    if (!stripRef.current || !todayMonthRef.current) return;
    didAutoScroll.current = true;
    alignTodayLeft(false);
    syncScrollUi();
  }, [heatmap.days.length, months, alignTodayLeft, syncScrollUi]);

  useEffect(() => {
    const handler = () => syncScrollUi();
    window.addEventListener('resize', handler);
    syncScrollUi();
    return () => {
      window.removeEventListener('resize', handler);
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    };
  }, [syncScrollUi]);

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
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-3 px-1">
        <div>
          <h2 className="text-base font-medium">
            <Trans>Team workload</Trans>
          </h2>
          <p className="text-xs text-muted-foreground">
            <Trans>Task density and milestones across the coming months</Trans>
          </p>
          {showHeat && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              <Trans>Full day ≈ {capacityDisplay} tasks/person</Trans>
              {' · '}
              {capacityOverride
                ? <Trans>set manually</Trans>
                : autoCapacity
                  ? <Trans>auto from history</Trans>
                  : <Trans>default</Trans>}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            {LEGEND_LEVELS.map((level) => (
              <span
                key={level}
                className="h-3 w-3 rounded-[3px]"
                style={{ backgroundColor: colorForLevel(level).bg }}
              />
            ))}
            <span className="ml-1"><Trans>Load</Trans></span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rotate-45" style={{ backgroundColor: MILESTONE_COLOR }} />
            <Trans>Milestone</Trans>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[3px] border border-border" style={HOLIDAY_HATCH} />
            <Trans>Holiday</Trans>
          </span>
        </div>
      </div>

      {!showHeat && (
        <div className="mx-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Trans>Add active assignees to see the workload gradient. Milestones are still shown.</Trans>
        </div>
      )}

      <div
        ref={stripRef}
        onScroll={onScroll}
        onPointerDown={onStripPointerDown}
        onPointerMove={onStripPointerMove}
        onPointerUp={onStripPointerUp}
        onPointerCancel={onStripPointerUp}
        onClickCapture={onStripClickCapture}
        className={`overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden cursor-grab ${
          isPanning ? 'cursor-grabbing select-none [&_*]:!cursor-grabbing' : ''
        }`}
      >
        <div className="flex gap-6 px-1 pb-1">
            {months.map((month) => {
              const monthKey = format(month, 'yyyy-MM');
              const monthStart = startOfMonth(month);
              const monthDays = eachDayOfInterval({ start: monthStart, end: endOfMonth(month) });
              const leadingBlanks = (getDay(monthStart) + 6) % 7;
              const isTodayMonth = monthKey === todayMonthKey;
              return (
                <div key={monthKey} ref={isTodayMonth ? todayMonthRef : undefined} className="shrink-0">
                  <p className="mb-1.5 text-sm font-medium capitalize">
                    {format(month, 'LLLL yyyy', { locale: dateLocale })}
                  </p>
                  <div className="grid grid-cols-7 gap-1" style={{ width: 7 * 34 }}>
                    {weekdayLabels.map((label, index) => (
                      <div
                        key={`${monthKey}-wd-${index}`}
                        className="pb-0.5 text-center text-[10px] text-muted-foreground"
                      >
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
                        showHeat={showHeat}
                        dateLocale={dateLocale}
                        projectNameById={projectNameById}
                        onOpenDay={openDay}
                        onOpenMilestone={openMilestone}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      <div className="flex items-center gap-2 px-1">
        <div
          ref={trackRef}
          onPointerDown={onTrackPointerDown}
          className="relative h-6 flex-1 cursor-pointer"
        >
          <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-muted-foreground/40" />
          <div
            ref={thumbRef}
            onPointerDown={onThumbPointerDown}
            onPointerMove={onThumbPointerMove}
            onPointerUp={onThumbPointerUp}
            onPointerCancel={onThumbPointerUp}
            className="absolute top-1/2 h-4 w-12 -translate-y-1/2 cursor-grab select-none rounded-full border border-border bg-card transition-colors hover:border-muted-foreground/60 active:cursor-grabbing"
          />
        </div>
        {!nav.todayVisible && (
          <button
            type="button"
            onClick={() => alignTodayLeft(true)}
            className="ml-1 shrink-0 rounded-full border border-border px-3 py-1 text-xs text-foreground hover:bg-muted"
          >
            <Trans>Today</Trans>
          </button>
        )}
      </div>
    </div>
  );
};

type HeatmapDayCellProps = {
  day: DayCellData;
  showHeat: boolean;
  dateLocale: DateFnsLocale;
  projectNameById: Map<string, string>;
  onOpenDay: (iso: string) => void;
  onOpenMilestone: (milestoneId: string) => void;
};

const HeatmapDayCell: React.FC<HeatmapDayCellProps> = ({
  day,
  showHeat,
  dateLocale,
  projectNameById,
  onOpenDay,
  onOpenMilestone,
}) => {
  if (!day.inRange) {
    return (
      <div className="flex h-8 items-center justify-center rounded-[4px] text-[11px] text-muted-foreground/40">
        {day.dayNumber}
      </div>
    );
  }

  const { style: cellStyle, colored, isHoliday } = resolveDayCellStyle(day, showHeat);
  const hasMilestones = day.milestones.length > 0;
  const neutralText = !colored;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'relative flex h-8 items-center justify-center rounded-[4px] text-[11px]',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            !cellStyle && 'border border-border',
            neutralText && 'text-muted-foreground',
            day.isToday && 'heatmap-today relative z-10 font-semibold',
          )}
          style={cellStyle}
          aria-label={format(day.date, 'd MMMM yyyy', { locale: dateLocale })}
        >
          <span className="leading-none">{day.dayNumber}</span>
          {hasMilestones && (
            <span
              className="absolute bottom-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rotate-45"
              style={{ backgroundColor: MILESTONE_COLOR }}
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-64">
        <p className="text-sm font-medium capitalize">
          {format(day.date, 'd MMMM yyyy', { locale: dateLocale })}
        </p>
        {isHoliday ? (
          <p className="mt-1 text-xs text-muted-foreground">
            <Trans>Holiday</Trans>
            {' — '}
            {day.holidayNames?.join(', ')}
          </p>
        ) : day.isWeekend ? (
          <p className="mt-1 text-xs text-muted-foreground">
            <Trans>Day off</Trans>
          </p>
        ) : day.isTeamAway ? (
          <p className="mt-1 text-xs text-muted-foreground">
            <Trans>The whole team is away</Trans>
          </p>
        ) : null}
        <p className="mt-1 text-xs text-muted-foreground">
          <Trans>Tasks</Trans>
          {`: ${day.taskCount}`}
          {showHeat && !day.isTeamAway && (
            <>
              {' · '}
              <Trans>Load</Trans>
              {`: ${day.percent}%`}
              {day.percent > 100 && (
                <span className="text-destructive">
                  {' · '}
                  <Trans>overloaded</Trans>
                </span>
              )}
            </>
          )}
        </p>
        {/* Explains why a day reads hotter than its task count suggests. */}
        {showHeat && !day.isTeamAway && day.awayCount > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            <Trans>Away: {day.awayCount} of {day.headcount}</Trans>
          </p>
        )}
        <div className="mt-3 border-t border-border pt-2">
          <p className="mb-1 text-xs font-medium">
            <Trans>Milestones</Trans>
          </p>
          {hasMilestones ? (
            <ul className="space-y-1.5">
              {day.milestones.map((milestone) => {
                const projectName = projectNameById.get(milestone.projectId);
                return (
                  <li key={milestone.id}>
                    <button
                      type="button"
                      onClick={() => onOpenMilestone(milestone.id)}
                      className="flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-muted"
                    >
                      <span
                        className="mt-1 h-2 w-2 shrink-0 rotate-45"
                        style={{ backgroundColor: MILESTONE_COLOR }}
                      />
                      <span className="min-w-0">
                        <span className="text-foreground">{milestone.title}</span>
                        {projectName && (
                          <span className="text-muted-foreground"> · {projectName}</span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              <Trans>No milestones on this day</Trans>
            </p>
          )}
        </div>
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
