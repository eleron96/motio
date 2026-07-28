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
//   available      = activeHeadcount - people away on that day
//   taskShare      = (taskCount / available) / capacity
//   pinnedPeople   = min(milestoneKernelSum(day) * MILESTONE_CREW, available)
//   percent        = round((taskShare + pinnedPeople / available) * 100)  // may exceed 100
//
// The denominator is who is actually AVAILABLE that day, not the whole team: with
// two of six on vacation the same tasks land on four people and the day has to
// read hotter. The tasks of an absent person stay in the numerator — the work does
// not go away with them. A day where nobody is available is not a load at all and
// the caller renders it as a non-working day instead of dividing by (almost) zero.
//
// Milestones are measured in PEOPLE, not in a fixed percent: a delivery pins a
// small crew that cannot be shifted to other objects, so the same delivery reads
// ~35% for a team of 4 and ~14% for a team of 10. Simultaneous deliveries pin
// separate crews — no diminishing returns — which is what makes several same-day
// deliveries hit a small team hard. The pinned crew is capped at the whole team:
// milestones alone can show a full day, but only real tasks push past 100%.

import type { DashboardMilestone, DashboardTimeOff } from '@/features/dashboard/types/dashboard';

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

// Milestones that feed the heat math. A milestone with includeInWorkload=false
// is a marker the owner has opted out of the workload — it still renders as a
// chip on the board, it just adds no crew pressure to its day.
export const workloadMilestones = (
  milestones: DashboardMilestone[],
): DashboardMilestone[] => milestones.filter((milestone) => milestone.includeInWorkload);

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

// ---------------------------------------------------------------- absences ----

const nextIsoDay = (iso: string): string => {
  const date = parseIsoDate(iso);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

/**
 * How many people are away on each day of the window.
 *
 * Records arrive whole — the query selects everything that INTERSECTS the window,
 * so a vacation may start before it and end after it — hence the clip to the
 * window before walking the days. Both ends are inclusive, mirroring the time_off
 * table (migration 0131) and `timeOffCoversDay` on the timeline.
 *
 * Only records of currently active assignees count: a disabled person is not in
 * the headcount either, so counting their absence would shrink the denominator
 * twice. Days are keyed by ISO date; a person is counted once per day even if
 * two records somehow cover it.
 */
export const awayCountByDate = (
  records: DashboardTimeOff[],
  activeAssigneeIds: ReadonlySet<string>,
  window: { startIso: string; endIso: string },
): Map<string, number> => {
  const counts = new Map<string, number>();
  if (records.length === 0 || activeAssigneeIds.size === 0) return counts;

  const peopleByDay = new Map<string, Set<string>>();
  for (const record of records) {
    if (!activeAssigneeIds.has(record.assigneeId)) continue;
    const from = record.startDate > window.startIso ? record.startDate : window.startIso;
    const to = record.endDate < window.endIso ? record.endDate : window.endIso;
    if (from > to) continue;
    for (let iso = from; iso <= to; iso = nextIsoDay(iso)) {
      const people = peopleByDay.get(iso);
      if (people) people.add(record.assigneeId);
      else peopleByDay.set(iso, new Set([record.assigneeId]));
    }
  }

  peopleByDay.forEach((people, iso) => counts.set(iso, people.size));
  return counts;
};

/** People who can actually pick up work that day. Never negative. */
export const availableHeadcount = (headcount: number, awayCount: number): number => (
  Math.max(headcount - awayCount, 0)
);

/**
 * One sample for the capacity auto-calibration: the day's per-person load.
 * Returns null for a day with nobody available — such a day says nothing about
 * how much a person normally carries, and dividing by a floor of 1 would inflate
 * the team's "normal" load and make every other day read cooler than it is.
 */
export const historyLoadPerPerson = (
  taskCount: number,
  available: number,
): number | null => (available > 0 ? taskCount / available : null);

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
// `available` is the people who can work that day (headcount minus absences), so
// the milestone crew is capped at the people who are actually there — deadlines
// can't pin more than that — and overload past 100% always comes from real tasks.
// The floor of 1 is a divide-by-zero guard only: a day with nobody available is
// rendered as a non-working day and never reaches this function.
export const dayPercent = (
  taskCount: number,
  available: number,
  capacity: number,
  kernelSum: number,
): number => {
  const safeCapacity = capacity > 0 ? capacity : DEFAULT_CAPACITY_PER_PERSON;
  const safeAvailable = Math.max(available, 1);
  const taskShare = (taskCount / safeAvailable) / safeCapacity;
  const pinnedPeople = Math.min(kernelSum * MILESTONE_CREW, safeAvailable);
  return Math.round((taskShare + pinnedPeople / safeAvailable) * 100);
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
