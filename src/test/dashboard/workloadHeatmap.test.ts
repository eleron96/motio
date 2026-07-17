import { describe, it, expect } from 'vitest';
import {
  autoCapacityPerPerson,
  colorForLevel,
  dayPercent,
  DEFAULT_CAPACITY_PER_PERSON,
  levelForPercent,
  milestoneKernelSum,
  MILESTONE_CREW,
  resolveCapacity,
  workloadMilestones,
} from '@/features/dashboard/lib/workloadHeatmap';
import type { DashboardMilestone } from '@/features/dashboard/types/dashboard';

const milestone = (
  date: string,
  overrides: Partial<DashboardMilestone> = {},
): DashboardMilestone => ({
  id: `m-${date}`,
  title: 'Deadline',
  projectId: 'p1',
  date,
  includeInWorkload: true,
  ...overrides,
});

describe('milestone kernel', () => {
  const target = '2026-07-10';
  const ms = [milestone(target)];

  it('plateaus the day before the deadline: eve and the day itself share the peak (1.0)', () => {
    expect(milestoneKernelSum(target, ms)).toBeCloseTo(1, 5);
    expect(milestoneKernelSum('2026-07-09', ms)).toBeCloseTo(1, 5);
  });

  it('ramps up as a half-cosine (slow from afar, steep near) and is light after', () => {
    const before2 = milestoneKernelSum('2026-07-08', ms); // -2 → 0.85
    const before3 = milestoneKernelSum('2026-07-07', ms); // -3 → 0.5
    const before4 = milestoneKernelSum('2026-07-06', ms); // -4 → 0.15
    const after1 = milestoneKernelSum('2026-07-11', ms); // +1 → 0.3
    expect(before2).toBeCloseTo(0.85, 5);
    expect(before4).toBeCloseTo(0.15, 5);
    // S-shape: gentle entry (0→0.15) and gentle landing on the plateau (0.85→1.0),
    // with the steep middle of the climb between them
    expect(before4 - 0).toBeLessThan(before3 - before4);
    expect(1 - before2).toBeLessThan(before2 - before3);
    expect(after1).toBeCloseTo(0.3, 5);
  });

  it('counts every same-day delivery fully — each pins its own crew, no discount', () => {
    const sameDay = milestoneKernelSum(target, [
      milestone(target), milestone(target), milestone(target), milestone(target),
    ]);
    expect(sameDay).toBeCloseTo(4, 5);
    // clusters on adjacent peak days add up linearly too; the cap lives in
    // dayPercent (crew vs headcount), not in the kernel
    const cluster = milestoneKernelSum(target, [
      milestone(target), milestone(target),
      milestone('2026-07-11'), milestone('2026-07-11'),
    ]);
    expect(cluster).toBeCloseTo(2 + 2 * 1, 5); // 2×peak + 2×eve-of-next-day (both 1.0)
  });

  it('is zero outside the kernel window', () => {
    expect(milestoneKernelSum('2026-07-05', ms)).toBe(0); // -5
    expect(milestoneKernelSum('2026-07-13', ms)).toBe(0); // +3
  });
});

describe('workloadMilestones', () => {
  const target = '2026-07-10';

  it('keeps only milestones flagged to count toward the workload', () => {
    const all = [
      milestone(target, { id: 'load-bearing' }),
      milestone(target, { id: 'marker', includeInWorkload: false }),
    ];
    const kept = workloadMilestones(all);
    expect(kept.map((m) => m.id)).toEqual(['load-bearing']);
  });

  it('drops an opted-out milestone from the day pressure entirely', () => {
    const loadBearing = milestone(target, { id: 'load-bearing' });
    const marker = milestone(target, { id: 'marker', includeInWorkload: false });
    // The opted-out marker sits on the same day but must not add to the sum:
    // one delivery counts, two would read 2.0.
    expect(milestoneKernelSum(target, workloadMilestones([loadBearing, marker])))
      .toBeCloseTo(1, 5);
  });

  it('is empty when every milestone opts out', () => {
    const markers = [
      milestone(target, { id: 'a', includeInWorkload: false }),
      milestone('2026-07-09', { id: 'b', includeInWorkload: false }),
    ];
    expect(workloadMilestones(markers)).toHaveLength(0);
    expect(milestoneKernelSum(target, workloadMilestones(markers))).toBe(0);
  });
});

describe('dayPercent', () => {
  it('is task load over capacity', () => {
    // (20 / 8) / 5 = 0.5 → 50%
    expect(dayPercent(20, 8, 5, 0)).toBe(50);
  });

  it('scales milestone pressure by headcount: a crew of MILESTONE_CREW people over the team', () => {
    // one delivery at peak, team of 4: 1.4 / 4 = 35%
    expect(dayPercent(0, 4, 5, 1)).toBe(Math.round((MILESTONE_CREW / 4) * 100));
    expect(dayPercent(0, 4, 5, 1)).toBe(35);
    // the same delivery barely registers for a team of 10: 14%
    expect(dayPercent(0, 10, 5, 1)).toBe(14);
  });

  it('has no diminishing returns for simultaneous deliveries', () => {
    // two deliveries, team of 4: 2.8 / 4 = 70% — double a single one
    expect(dayPercent(0, 4, 5, 2)).toBe(70);
    // two deliveries, team of 8: still exactly double a single one (35% vs 17.5%)
    expect(dayPercent(0, 8, 5, 2)).toBe(35);
  });

  it('caps the pinned crew at the whole team, so milestones alone max out at 100%', () => {
    // four deliveries would pin 5.6 people but the team only has 4
    expect(dayPercent(0, 4, 5, 4)).toBe(100);
    // ...and only tasks push past 100 into overload
    expect(dayPercent(16, 4, 5, 4)).toBe(180);
  });

  it('adds the milestone share on top of tasks and can exceed 100%', () => {
    // 80% of tasks + one delivery for a team of 4 tips into overload
    expect(dayPercent(16, 4, 5, 1)).toBe(115);
  });

  it('guards zero capacity and headcount', () => {
    expect(dayPercent(5, 0, 0, 0)).toBe(Math.round((5 / DEFAULT_CAPACITY_PER_PERSON) * 100));
  });
});

describe('levelForPercent', () => {
  it('buckets into five levels plus an overload level', () => {
    expect(levelForPercent(0)).toBe(0);
    expect(levelForPercent(25)).toBe(1);
    expect(levelForPercent(50)).toBe(2);
    expect(levelForPercent(75)).toBe(3);
    expect(levelForPercent(100)).toBe(4);
    expect(levelForPercent(101)).toBe(5);
    expect(levelForPercent(180)).toBe(5);
  });
});

describe('capacity resolution', () => {
  it('prefers an explicit override, then auto, then the default', () => {
    expect(resolveCapacity(6, 4)).toBe(6);
    expect(resolveCapacity(null, 4)).toBe(4);
    expect(resolveCapacity(null, null)).toBe(DEFAULT_CAPACITY_PER_PERSON);
    expect(resolveCapacity(0, null)).toBe(DEFAULT_CAPACITY_PER_PERSON);
  });

  it('derives auto capacity from a busy percentile of history, or null when sparse', () => {
    expect(autoCapacityPerPerson([1, 2])).toBeNull();
    const loads = Array.from({ length: 20 }, (_, i) => i + 1);
    const auto = autoCapacityPerPerson(loads);
    expect(auto).not.toBeNull();
    expect(auto as number).toBeGreaterThan(10);
    expect(auto as number).toBeLessThanOrEqual(20);
  });
});

describe('colorForLevel', () => {
  it('gives a transparent fill for free days and solid fills otherwise', () => {
    expect(colorForLevel(0).bg).toBe('transparent');
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(colorForLevel(level).bg).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
