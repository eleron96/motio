import React from 'react';
import { Flame, Star } from 'lucide-react';
import { plural, t } from '@lingui/macro';
import { useCountUp } from '@/shared/hooks/useCountUp';
import type { ProfileSummaryData } from '@/features/auth/lib/profileSummary';
import { cn } from '@/shared/lib/classNames';

interface ProfileSummaryProps {
  summary: ProfileSummaryData;
  /** Drives the count-up / ring fill — pass the dialog's `open` flag. */
  animate: boolean;
}

const RING_RADIUS = 36;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export const ProfileSummary: React.FC<ProfileSummaryProps> = ({ summary, animate }) => {
  const rate = useCountUp(summary.completionRate, animate);
  const active = useCountUp(summary.active, animate);
  const overdue = useCountUp(summary.overdue, animate);
  const thisWeek = useCountUp(summary.completedThisWeek, animate);

  // Without tasks the block would be a row of zeros — hide it instead.
  if (!summary.hasData) return null;

  const ringOffset = RING_CIRCUMFERENCE * (1 - rate / 100);
  const topProject = summary.topProjectName ?? '';

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
          <div className="text-xl font-semibold leading-none text-foreground">{Math.round(active)}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">{t`in progress`}</div>
        </div>
        <div className="flex-1 border-x border-border">
          <div
            className={cn(
              'text-xl font-semibold leading-none',
              summary.overdue > 0 ? 'text-destructive' : 'text-foreground',
            )}
          >
            {Math.round(overdue)}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">{t`overdue`}</div>
        </div>
        <div className="flex-1">
          <div className="text-xl font-semibold leading-none text-foreground">{Math.round(thisWeek)}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">{t`this week`}</div>
        </div>
      </div>

      <div className="h-px bg-border" />

      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span>
          <span className="font-medium text-foreground/80">{summary.completed}</span> {t`closed`}
        </span>
        <span aria-hidden="true" className="opacity-50">·</span>
        <span>{plural(summary.projectCount, { one: '# project', other: '# projects' })}</span>
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

      {summary.topProjectName && (
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <Star className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{t`Most often: ${topProject}`}</span>
        </div>
      )}
    </div>
  );
};
