import type { CSSProperties } from 'react';
import { cn } from '@/shared/lib/classNames';

/**
 * Staged reveal for the brief's contents: each block fades up a beat after the
 * previous one. `fill-mode-both` keeps a block invisible until its delay
 * elapses; `motion-reduce:animate-none` drops the animation entirely, which
 * also drops the fill and leaves everything plainly visible.
 *
 * The animation is CSS-only and therefore runs on mount, so expanding a
 * collapsed list never replays the cascade for rows that are already on screen.
 */
const REVEAL_CLASS =
  'animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both duration-300 motion-reduce:animate-none';

/**
 * Spreadable props. Pass the element's own classes in — they get merged, not
 * overwritten, so `{...reveal(300, 'text-primary')}` keeps both.
 */
export const reveal = (
  delayMs: number,
  className?: string,
): { className: string; style: CSSProperties } => ({
  className: cn(REVEAL_CLASS, className),
  style: { animationDelay: `${delayMs}ms` },
});

/** Delay milestones for each block, mirroring the reference design's rhythm. */
export const REVEAL_DELAY = {
  title: 160,
  date: 220,
  stats: 300,
  statValue: 460,
  overdueHeading: 560,
  overdueList: 600,
  todayHeading: 760,
  todayList: 800,
  milestonesHeading: 960,
  milestonesList: 1000,
  footer: 1120,
} as const;

/** Per-row stagger inside a list, capped so long lists don't crawl in. */
export const rowDelay = (base: number, index: number, animated: boolean): number => (
  animated ? base + Math.min(index, 3) * 50 : 0
);
