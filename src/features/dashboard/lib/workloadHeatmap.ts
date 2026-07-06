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
//   pinnedPeople   = min(milestoneKernelSum(day) * MILESTONE_CREW, headcount)
//   percent        = round((taskShare + pinnedPeople / headcount) * 100)  // may exceed 100
//
// Milestones are measured in PEOPLE, not in a fixed percent: a delivery pins a
// small crew that cannot be shifted to other objects, so the same delivery reads
// ~35% for a team of 4 and ~14% for a team of 10. Simultaneous deliveries pin
// separate crews — no diminishing returns — which is what makes several same-day
// deliveries hit a small team hard. The pinned crew is capped at the whole team:
// milestones alone can show a full day, but only real tasks push past 100%.

import type { DashboardMilestone } from '@/features/dashboard/types/dashboard';

export type WorkloadDay = {
  date: string; // ISO 'YYYY-MM-DD'
  taskCount: number;
};

export type HeatmapLevel = 0 | 1 | 2 | 3 | 4 | 5;

// Milestone kernel: how strongly a day feels a delivery N days away. A half-cosine
// ramp — barely visible from afar, most of the climb over the last 2 days — that
// plateaus the day BEFORE the deadline (deadline eve and the day itself share the
// peak), with a short tail after.
//   -4:0.15  -3:0.50  -2:0.85  -1:1.00  0:1.00  +1:0.30  +2:0.10   else 0
const KERNEL_WEIGHTS: Record<number, number> = {
  [-4]: 0.15,
  [-3]: 0.5,
  [-2]: 0.85,
  [-1]: 1,
  [0]: 1,
  [1]: 0.3,
  [2]: 0.1,
};

// How many people one delivery pins at its peak. This is the single tuning knob
// for milestone pressure: the day's share is pinned people over headcount, so one
// delivery reads ~35% for a team of 4 and ~14% for a team of 10.
export const MILESTONE_CREW = 1.4;

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

// Kernel pressure this day feels from nearby milestones, in units of "deliveries
// at peak". Every delivery counts fully — each pins its own crew — so the sum is
// uncapped here; dayPercent caps the resulting crew at the team's headcount.
export const milestoneKernelSum = (
  iso: string,
  milestones: DashboardMilestone[],
): number => {
  if (milestones.length === 0) return 0;
  const day = parseIsoDate(iso);
  let total = 0;
  for (const milestone of milestones) {
    total += kernelFactor(dayDiff(day, parseIsoDate(milestone.date)));
  }
  return total;
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
// The milestone crew is capped at the whole team — deadlines can't pin more
// people than exist — so overload past 100% always comes from actual tasks.
export const dayPercent = (
  taskCount: number,
  headcount: number,
  capacity: number,
  kernelSum: number,
): number => {
  const safeCapacity = capacity > 0 ? capacity : DEFAULT_CAPACITY_PER_PERSON;
  const safeHeadcount = Math.max(headcount, 1);
  const taskShare = (taskCount / safeHeadcount) / safeCapacity;
  const pinnedPeople = Math.min(kernelSum * MILESTONE_CREW, safeHeadcount);
  return Math.round((taskShare + pinnedPeople / safeHeadcount) * 100);
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
