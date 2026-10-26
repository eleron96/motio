import React from 'react';
import { Flame } from 'lucide-react';
import { plural, t } from '@lingui/macro';
import { useCountUp } from '@/shared/hooks/useCountUp';
import { useLocaleStore } from '@/shared/store/localeStore';
import { formatCompactCount, type ProfileSummaryData } from '@/features/auth/lib/profileSummary';
import { cn } from '@/shared/lib/classNames';

interface ProfileSummaryProps {
  summary: ProfileSummaryData;
  /** Drives the count-up / ring fill — pass the dialog's `open` flag. */
  animate: boolean;
}

const RING_RADIUS = 36;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export const ProfileSummary: React.FC<ProfileSummaryProps> = ({ summary, animate }) => {
  const locale = useLocaleStore((state) => state.locale);
  const rate = useCountUp(summary.completionRate, animate);
  const active = useCountUp(summary.active, animate);
  const overdue = useCountUp(summary.overdue, animate);
  const thisWeek = useCountUp(summary.completedThisWeek, animate);

  // Without tasks the block would be a row of zeros — hide it instead.
  if (!summary.hasData) return null;

  const ringOffset = RING_CIRCUMFERENCE * (1 - rate / 100);
  const weekDeltaLabel = summary.weekDelta > 0 ? `+${summary.weekDelta}` : `−${Math.abs(summary.weekDelta)}`;
  const bestWeek = formatCompactCount(summary.bestWeek, locale);
  const moreProjects = summary.projectCount - summary.topProjects.length;

  return (
    <div className="w-full max-w-xs space-y-3 pt-1">
      <div className="relative mx-auto h-[88px] w-[88px]">
        <svg viewBox="0 0 88 88" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle
            cx="44"
            cy="44"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="7"
            style={{ stroke: 'hsl(var(--border))' }}
          />
          <circle
            cx="44"
            cy="44"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="7"
            strokeLinecap="round"
            style={{
              stroke: 'hsl(var(--primary))',
              strokeDasharray: RING_CIRCUMFERENCE,
              strokeDashoffset: ringOffset,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-base font-semibold leading-none text-foreground">{Math.round(rate)}%</span>
          <span className="mt-0.5 text-[9px] text-muted-foreground">{t`done`}</span>
        </div>
      </div>

      <div className="flex items-center justify-around text-center">
        <div className="flex-1">
          <div className="text-xl font-semibold leading-none text-foreground">{formatCompactCount(active, locale)}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">{t`in progress`}</div>
        </div>
        <div className="flex-1 border-x border-border">
          <div
            className={cn(
              'text-xl font-semibold leading-none',
              summary.overdue > 0 ? 'text-destructive' : 'text-foreground',
            )}
          >
            {formatCompactCount(overdue, locale)}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">{t`overdue`}</div>
        </div>
        <div className="flex-1">
          <div className="text-xl font-semibold leading-none text-foreground">{formatCompactCount(thisWeek, locale)}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">{t`this week`}</div>
        </div>
      </div>

      <div className="h-px bg-border" />

      {summary.bestWeek > 0 && (
        <div className="space-y-1.5 text-left">
          <div className="flex items-baseline justify-between gap-2 text-[11px]">
            <span className="font-medium text-foreground">{t`Closed by week`}</span>
            {summary.weekDelta !== 0 && (
              <span className="text-muted-foreground">
                <span className={cn('font-medium', summary.weekDelta > 0 ? 'text-primary' : 'text-foreground/80')}>
                  {weekDeltaLabel}
                </span>{' '}
                {t`vs last week`}
              </span>
            )}
          </div>
          {/* Bars are scaled to the best week; an empty week keeps a 2px stub so
              the row still reads as a timeline rather than a gap. */}
          <div className="flex h-14 items-end gap-1.5">
            {summary.weeklyCompleted.map((count, index) => {
              const weeksAgo = summary.weeklyCompleted.length - 1 - index;
              const when = weeksAgo === 0
                ? t`current week`
                : plural(weeksAgo, { one: '# week ago', other: '# weeks ago' });
              return (
                <div
                  key={weeksAgo}
                  title={`${when}: ${count}`}
                  aria-label={`${when}: ${count}`}
                  className={cn(
                    'min-h-[2px] flex-1 rounded-t-[3px] transition-colors',
                    weeksAgo === 0 ? 'bg-primary' : 'bg-muted-foreground/25 hover:bg-muted-foreground/45',
                  )}
                  style={{ height: `${Math.round((count / summary.bestWeek) * 100)}%` }}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{plural(summary.weeklyCompleted.length - 1, { one: '# week ago', other: '# weeks ago' })}</span>
            <span>{t`current week`}</span>
          </div>
        </div>
      )}

      {summary.topProjects.length > 0 && (
        <div className="space-y-1.5 text-left">
          <div className="text-[11px] font-medium text-foreground">{t`Where your tasks are`}</div>
          {summary.topProjects.map((project) => (
            <div
              key={project.id}
              className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_2rem] items-center gap-2 text-[11px]"
            >
              <span className="truncate text-foreground/80" title={project.name}>{project.name}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-primary/70" style={{ width: `${project.share}%` }} />
              </span>
              <span className="text-right tabular-nums text-muted-foreground">{project.share}%</span>
            </div>
          ))}
          {moreProjects > 0 && (
            <div className="text-[10px] text-muted-foreground">
              {plural(moreProjects, { one: 'and # more project', other: 'and # more projects' })}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span>
          <span className="font-medium text-foreground/80">{formatCompactCount(summary.completed, locale)}</span> {t`closed`}
        </span>
        {summary.bestWeek > 0 && (
          <>
            <span aria-hidden="true" className="opacity-50">·</span>
            <span>{t`best week: ${bestWeek}`}</span>
          </>
        )}
        {summary.streakDays > 0 && (
          <>
            <span aria-hidden="true" className="opacity-50">·</span>
            <span className="inline-flex items-center gap-1">
              <Flame className="h-3 w-3 text-primary" aria-hidden="true" />
              {plural(summary.streakDays, { one: '# day streak', other: '# day streak' })}
            </span>
          </>
        )}
      </div>
    </div>
  );
};
