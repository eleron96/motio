// Presentation math for the workload heatmap board. Kept free of React and of the
// data layer so the tuning knobs live in one place and can be changed without a
// migration.
//
// The percentage is measured against the team's own CAPACITY, not the busiest day
// on screen, so 100% means "a full day for THIS team". Capacity (tasks per person
// per day at 100%) is either set by the owner in workspace settings or auto-derived
// from a high percentile of the team's recent history — so a team that normally
// runs 6 tasks/person reads differently from one that runs 2.
//
//   taskShare      = (taskCount / activeHeadcount) / capacity
//   milestoneShare = milestoneKernelSum(day) * MILESTONE_FRACTION
//   percent        = round((taskShare + milestoneShare) * 100)   // may exceed 100
//
// A single milestone in its crunch window is deliberately heavy (≈70% of a full
// day), so two or three milestones together push a day into overload (>100%).

import type { DashboardMilestone } from '@/features/dashboard/types/dashboard';

export type WorkloadDay = {
  date: string; // ISO 'YYYY-MM-DD'
  taskCount: number;
};

export type HeatmapLevel = 0 | 1 | 2 | 3 | 4 | 5;

// Milestone kernel (tasks-per-person-independent factors). A deadline pushes hard
// for the 3-4 days before it and lightly for 1-2 days after; the day itself weighs
// the same as the day before (they share the peak).
//   -4:0.25  -3:0.50  -2:0.75  -1:1.00  0:1.00  +1:0.35  +2:0.15   else 0
const KERNEL_WEIGHTS: Record<number, number> = {
  [-4]: 0.25,
  [-3]: 0.5,
  [-2]: 0.75,
  [-1]: 1,
  [0]: 1,
  [1]: 0.35,
  [2]: 0.15,
};

// One milestone at peak counts as this share of a full day (moderate — a single
// delivery is notable but not a runaway red).
export const MILESTONE_FRACTION = 0.45;
// Several deliveries on the SAME day make it heavier, but with diminishing returns
// (4 deliveries ≈ 1.75×, not 4×). The whole stacked kernel is then capped so a
// cluster of deadlines can't inflate a day without bound.
const SAME_DAY_STEP = 0.25;
const SAME_DAY_MAX = 2;
const MILESTONE_STACK_CAP = 1.8;

// Fallbacks for capacity when there is no override and not enough history.
export const DEFAULT_CAPACITY_PER_PERSON = 5;
const HISTORY_PERCENTILE = 0.85; // "a busy-but-normal day" = 100%
const MIN_HISTORY_SAMPLES = 12;

// Parse an ISO date at UTC noon so timezone/DST never shifts the day.
export const parseIsoDate = (iso: string): Date => new Date(`${iso}T12:00:00Z`);

const dayDiff = (a: Date, b: Date): number => Math.round(
  (a.getTime() - b.getTime()) / 86_400_000,
);

const kernelFactor = (offset: number): number => KERNEL_WEIGHTS[offset] ?? 0;

// Kernel pressure this day feels from nearby milestones. Milestones that fall on
// the SAME date count once (four sub-deliveries on one day are one crunch, not
// four), and the total is capped so a cluster of deadlines can't run away.
export const milestoneKernelSum = (
  iso: string,
  milestones: DashboardMilestone[],
): number => {
  if (milestones.length === 0) return 0;
  const day = parseIsoDate(iso);
  const countByDate = new Map<string, number>();
  for (const milestone of milestones) {
    countByDate.set(milestone.date, (countByDate.get(milestone.date) ?? 0) + 1);
  }
  let total = 0;
  for (const [date, count] of countByDate) {
    const weight = kernelFactor(dayDiff(day, parseIsoDate(date)));
    if (weight === 0) continue;
    const sameDayFactor = Math.min(1 + SAME_DAY_STEP * (count - 1), SAME_DAY_MAX);
    total += weight * sameDayFactor;
  }
  return Math.min(total, MILESTONE_STACK_CAP);
};

const percentile = (sortedAsc: number[], p: number): number => {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
};

// Auto capacity from history: the HISTORY_PERCENTILE of the team's own daily
// per-person load. Returns null when there isn't enough non-trivial history.
export const autoCapacityPerPerson = (perPersonLoads: number[]): number | null => {
  const nonZero = perPersonLoads.filter((load) => load > 0).sort((a, b) => a - b);
  if (nonZero.length < MIN_HISTORY_SAMPLES) return null;
  const value = percentile(nonZero, HISTORY_PERCENTILE);
  return value > 0 ? value : null;
};

export const resolveCapacity = (
  override: number | null,
  auto: number | null,
): number => {
  if (override && override > 0) return override;
  if (auto && auto > 0) return auto;
  return DEFAULT_CAPACITY_PER_PERSON;
};

// Percent of a full day. Not clamped: >100 is overload and is shown as such.
export const dayPercent = (
  taskCount: number,
  headcount: number,
  capacity: number,
  kernelSum: number,
): number => {
  const safeCapacity = capacity > 0 ? capacity : DEFAULT_CAPACITY_PER_PERSON;
  const taskShare = (taskCount / Math.max(headcount, 1)) / safeCapacity;
  const milestoneShare = kernelSum * MILESTONE_FRACTION;
  return Math.round((taskShare + milestoneShare) * 100);
};

export const levelForPercent = (percent: number): HeatmapLevel => {
  if (percent <= 0) return 0;
  if (percent <= 30) return 1;
  if (percent <= 60) return 2;
  if (percent <= 85) return 3;
  if (percent <= 100) return 4;
  return 5; // overload
};

// Temperature ramp: soft yellow → amber for the lower load, the reddening held
// back until near a full day, and a deep bordeaux for anything over 100%. Opaque
// fills read on both light and dark surfaces; `fg` is a readable tone on each.
const LEVEL_COLORS: Record<HeatmapLevel, { bg: string; fg: string }> = {
  0: { bg: 'transparent', fg: 'inherit' },
  1: { bg: '#FEF7E6', fg: '#8A6A28' }, // ≤30% — very pale cream (light, barely there)
  2: { bg: '#FBE8C2', fg: '#846017' }, // ≤60% — light pale amber
  3: { bg: '#EEB878', fg: '#6F3F14' }, // ≤85% — warm amber/orange (not red yet)
  4: { bg: '#D9694A', fg: '#FCEEE9' }, // ≤100% — red, near a full day
  5: { bg: '#8C2A22', fg: '#F8E3DF' }, // >100% — bordeaux, overload
};

export const colorForLevel = (level: HeatmapLevel): { bg: string; fg: string } => (
  LEVEL_COLORS[level]
);
