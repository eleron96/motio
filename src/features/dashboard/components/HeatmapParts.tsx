import React from 'react';
import { format } from 'date-fns';
import { t, Trans } from '@lingui/macro';
import { heatmapLevelLabel } from '@/features/dashboard/components/heatmapLevelLabel';
import { cn } from '@/shared/lib/classNames';
import { colorForLevel, type HeatmapLevel, type OverloadOutlook } from '@/features/dashboard/lib/workloadHeatmap';
import type { DateFnsLocale, HeatmapDayCell } from '@/features/dashboard/hooks/useWorkloadHeatmapModel';
import {
  HOLIDAY_HATCH,
  LEGEND_LOAD_LEVELS,
  LEGEND_OVERLOAD_LEVELS,
  MILESTONE_COLOR,
  resolveDayCellStyle,
} from '@/features/dashboard/components/heatmapCellStyle';

/** The level name on its own colour, as a small pill. */
export const HeatmapLevelPill: React.FC<{ level: HeatmapLevel }> = ({ level }) => {
  const { bg, fg } = colorForLevel(level);
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-4"
      style={level > 0 ? { backgroundColor: bg, color: fg } : undefined}
    >
      {heatmapLevelLabel(level)}
    </span>
  );
};

/** The one sentence under the title: overloaded now and until when, or next. */
export const HeatmapOutlookLine: React.FC<{
  outlook: OverloadOutlook;
  dateLocale: DateFnsLocale;
  className?: string;
}> = ({ outlook, dateLocale, className }) => {
  const day = (iso: string) => format(new Date(`${iso}T12:00:00`), 'd MMMM', { locale: dateLocale });
  let text: string;
  if (outlook.kind === 'now') text = t`Overloaded until ${day(outlook.until)}, calmer after that.`;
  else if (outlook.kind === 'ahead') text = t`No overload now. The next one starts ${day(outlook.from)}.`;
  else text = t`No overload in the coming months.`;
  return <p className={cn('text-sm text-muted-foreground', className)}>{text}</p>;
};

const Swatch: React.FC<{ level: HeatmapLevel }> = ({ level }) => (
  <span className="h-3 w-full rounded-[3px]" style={{ backgroundColor: colorForLevel(level).bg }} />
);

/**
 * The key: the calm ramp up to a full day, a gap, then the three overload
 * steps. The numbers sit under the swatches so a colour reads as a range.
 */
export const HeatmapLegend: React.FC<{ className?: string; children?: React.ReactNode }> = ({
  className,
  children,
}) => (
  <div className={cn('flex flex-wrap items-start gap-x-5 gap-y-2 text-xs text-muted-foreground', className)}>
    <span className="flex h-3 items-center"><Trans>Load, %</Trans></span>
    <div
      className="grid gap-x-0.5 gap-y-1 text-center text-[11px] tabular-nums"
      style={{ gridTemplateColumns: 'repeat(4, 32px) 8px repeat(3, 32px)' }}
    >
      {LEGEND_LOAD_LEVELS.map((level) => <Swatch key={level} level={level} />)}
      <span />
      {LEGEND_OVERLOAD_LEVELS.map((level) => <Swatch key={level} level={level} />)}
      <span>30</span>
      <span>60</span>
      <span>85</span>
      <span>100</span>
      <span />
      <span>100+</span>
      <span>125+</span>
      <span>150+</span>
    </div>
    <span className="flex h-3 items-center gap-1.5">
      <span className="h-2 w-2 rotate-45" style={{ backgroundColor: MILESTONE_COLOR }} />
      <Trans>Milestone</Trans>
    </span>
    <span className="flex h-3 items-center gap-1.5">
      <span className="h-3 w-3 rounded-[3px] border border-border" style={HOLIDAY_HATCH} />
      <Trans>Holiday</Trans>
    </span>
    {children}
  </div>
);

type HeatmapDayButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  day: HeatmapDayCell;
  showHeat: boolean;
  dateLocale: DateFnsLocale;
};

/**
 * One day of the month grid. The size comes from `className`; the paint, the
 * digits, the milestone mark and the today ring are the same on every screen.
 */
export const HeatmapDayButton = React.forwardRef<HTMLButtonElement, HeatmapDayButtonProps>(
  ({ day, showHeat, dateLocale, className, style, ...rest }, ref) => {
    const look = resolveDayCellStyle(day, showHeat);
    const hasMilestones = day.milestones.length > 0;
    const date = format(day.date, 'd MMMM yyyy', { locale: dateLocale });
    const label = look.colored ? `${date}, ${day.percent}%, ${heatmapLevelLabel(day.level)}` : date;
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        {...rest}
        className={cn(
          'relative flex items-center justify-center rounded-md tabular-nums transition-[filter]',
          'hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          look.outlined && 'border border-border',
          look.muted && 'text-muted-foreground',
          look.overload ? 'font-semibold' : 'font-medium',
          hasMilestones && 'pb-1.5',
          day.isToday && 'heatmap-today z-10',
          className,
        )}
        style={{ ...style, ...look.style }}
      >
        <span className="leading-none">{day.dayNumber}</span>
        {hasMilestones && (
          <span
            aria-hidden="true"
            className="absolute bottom-1 left-1/2 h-[5px] w-[5px] -translate-x-1/2 rotate-45"
            style={{ backgroundColor: MILESTONE_COLOR, boxShadow: '0 0 0 1.5px hsl(var(--card))' }}
          />
        )}
      </button>
    );
  },
);
HeatmapDayButton.displayName = 'HeatmapDayButton';

/**
 * What a day is made of, as plain lines: the load and its level, the tasks and
 * the deliveries that add up to it, and who is away. Shared by the desktop
 * popover and the phone sheet so the two never disagree.
 */
export const HeatmapDayFacts: React.FC<{ day: HeatmapDayCell; showHeat: boolean }> = ({ day, showHeat }) => {
  const isHoliday = Boolean(day.holidayNames && day.holidayNames.length > 0);
  const measured = showHeat && !day.isTeamAway && !day.isWeekend && !isHoliday;
  return (
    <div className="space-y-1 text-sm">
      {isHoliday ? (
        <p className="text-muted-foreground"><Trans>Holiday</Trans>{' — '}{day.holidayNames?.join(', ')}</p>
      ) : day.isWeekend ? (
        <p className="text-muted-foreground"><Trans>Day off</Trans></p>
      ) : day.isTeamAway ? (
        <p className="text-muted-foreground"><Trans>The whole team is away</Trans></p>
      ) : null}
      {measured && (
        <p className="flex items-center gap-2">
          <span className="sr-only"><Trans>Load</Trans>{': '}</span>
          <span className="text-xl font-semibold tabular-nums">{`${day.percent}%`}</span>
          {day.level > 0 && <HeatmapLevelPill level={day.level} />}
        </p>
      )}
      <p className="text-muted-foreground">
        <Trans>Tasks</Trans>
        {`: ${day.taskCount}`}
        {measured && day.milestonePercent > 0 && ` — ${day.taskPercent}%`}
      </p>
      {measured && day.milestonePercent > 0 && (
        <p className="text-muted-foreground">
          <Trans>Preparing deliveries</Trans>
          {` — ${day.milestonePercent}%`}
        </p>
      )}
      {/* Explains why a day reads hotter than its task count suggests. */}
      {showHeat && !day.isTeamAway && day.awayCount > 0 && (
        <p className="text-muted-foreground">
          <Trans>Away: {day.awayCount} of {day.headcount}</Trans>
        </p>
      )}
    </div>
  );
};
