import { t } from '@lingui/macro';
import { Skeleton } from '@/shared/ui/skeleton';
import { cn } from '@/shared/lib/classNames';
import { reveal, REVEAL_DELAY } from '../lib/dailyBriefReveal';

type Props = {
  overdueCount: number;
  todayCount: number;
  loading: boolean;
};

type TileProps = {
  value: number;
  label: string;
  /** Muted when the bucket is empty — a zero shouldn't shout in red. */
  toneClassName: string;
  delay: number;
};

const Tile = ({ value, label, toneClassName, delay }: TileProps) => (
  <div {...reveal(delay, 'rounded-lg border border-border p-3')}>
    <div
      {...reveal(
        REVEAL_DELAY.statValue,
        cn(
          'text-[28px] font-semibold leading-none tracking-tight',
          value === 0 ? 'text-muted-foreground' : toneClassName,
        ),
      )}
    >
      {value}
    </div>
    <div className="mt-2 text-xs leading-snug text-muted-foreground">{label}</div>
  </div>
);

export const DailyBriefStats = ({ overdueCount, todayCount, loading }: Props) => {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-2.5">
        <Skeleton className="h-[74px] w-full" />
        <Skeleton className="h-[74px] w-full" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Tile
        value={overdueCount}
        label={t`overdue`}
        toneClassName="text-destructive"
        delay={REVEAL_DELAY.stats}
      />
      <Tile
        value={todayCount}
        label={t`due today`}
        toneClassName="text-warning"
        delay={REVEAL_DELAY.stats + 60}
      />
    </div>
  );
};
