import { describe, it, expect } from 'vitest';
import {
  autoCapacityPerPerson,
  availableHeadcount,
  awayCountByDate,
  colorForLevel,
  dayPercent,
  DEFAULT_CAPACITY_PER_PERSON,
  historyLoadPerPerson,
  levelForPercent,
  milestoneKernelSum,
  MILESTONE_CREW,
  resolveCapacity,
  workloadMilestones,
} from '@/features/dashboard/lib/workloadHeatmap';
import type { DashboardMilestone, DashboardTimeOff } from '@/features/dashboard/types/dashboard';

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

describe('absences', () => {
  const WINDOW = { startIso: '2026-07-01', endIso: '2026-07-31' };
  const ACTIVE = new Set(['a1', 'a2', 'a3']);
  const record = (
    assigneeId: string,
    startDate: string,
    endDate: string,
  ): DashboardTimeOff => ({ id: `${assigneeId}-${startDate}`, assigneeId, startDate, endDate });

  it('covers both ends of the period', () => {
    const away = awayCountByDate([record('a1', '2026-07-10', '2026-07-12')], ACTIVE, WINDOW);
    expect(away.get('2026-07-09')).toBeUndefined();
    expect(away.get('2026-07-10')).toBe(1);
    expect(away.get('2026-07-11')).toBe(1);
    expect(away.get('2026-07-12')).toBe(1);
    expect(away.get('2026-07-13')).toBeUndefined();
  });

  it('clips a period that starts before or ends after the window', () => {
    const away = awayCountByDate([record('a1', '2026-06-20', '2026-08-10')], ACTIVE, WINDOW);
    expect(away.get('2026-07-01')).toBe(1);
    expect(away.get('2026-07-31')).toBe(1);
    expect(away.size).toBe(31);
    expect(away.get('2026-06-30')).toBeUndefined();
    expect(away.get('2026-08-01')).toBeUndefined();
  });

  it('drops a period that misses the window entirely', () => {
    const away = awayCountByDate([record('a1', '2026-05-01', '2026-05-05')], ACTIVE, WINDOW);
    expect(away.size).toBe(0);
  });

  it('adds up different people on the same day', () => {
    const away = awayCountByDate(
      [record('a1', '2026-07-10', '2026-07-10'), record('a2', '2026-07-10', '2026-07-11')],
      ACTIVE,
      WINDOW,
    );
    expect(away.get('2026-07-10')).toBe(2);
    expect(away.get('2026-07-11')).toBe(1);
  });

  it('counts one person once even if two records cover the same day', () => {
    const away = awayCountByDate(
      [record('a1', '2026-07-10', '2026-07-12'), record('a1', '2026-07-11', '2026-07-13')],
      ACTIVE,
      WINDOW,
    );
    expect(away.get('2026-07-11')).toBe(1);
    expect(away.get('2026-07-13')).toBe(1);
  });

  it('ignores absences of people who are not in the headcount', () => {
    const away = awayCountByDate([record('gone', '2026-07-10', '2026-07-10')], ACTIVE, WINDOW);
    expect(away.size).toBe(0);
  });

  it('is empty without records or without an active team', () => {
    expect(awayCountByDate([], ACTIVE, WINDOW).size).toBe(0);
    expect(awayCountByDate([record('a1', '2026-07-10', '2026-07-10')], new Set(), WINDOW).size).toBe(0);
  });

  it('never reports a negative availability', () => {
    expect(availableHeadcount(6, 2)).toBe(4);
    expect(availableHeadcount(6, 6)).toBe(0);
    expect(availableHeadcount(2, 5)).toBe(0);
  });

  it('skips a day with nobody available when calibrating capacity', () => {
    expect(historyLoadPerPerson(12, 4)).toBe(3);
    expect(historyLoadPerPerson(12, 0)).toBeNull();
  });
});

describe('dayPercent with absences', () => {
  it('reads hotter when the same tasks land on fewer people', () => {
    // 20 tasks, capacity 5: a full team of 8 is at 50%...
    expect(dayPercent(20, 8, 5, 0)).toBe(50);
    // ...and with two of them away the same work is 67% of a day.
    expect(dayPercent(20, 6, 5, 0)).toBe(67);
  });

  it('caps the milestone crew at the people who are actually there', () => {
    // Three deliveries would pin 4.2 people; only 2 are available → 100%, no more.
    expect(dayPercent(0, 2, 5, 3)).toBe(100);
    // One delivery pins its crew out of 2 available instead of out of 4.
    expect(dayPercent(0, 2, 5, 1)).toBe(Math.round((MILESTONE_CREW / 2) * 100));
  });

  it('matches the pre-absence numbers when nobody is away', () => {
    // Regression guard: availableHeadcount(headcount, 0) === headcount, so every
    // number a workspace without time off sees must stay exactly as it was.
    expect(dayPercent(20, availableHeadcount(8, 0), 5, 0)).toBe(50);
    expect(dayPercent(0, availableHeadcount(4, 0), 5, 1)).toBe(35);
    expect(dayPercent(16, availableHeadcount(4, 0), 5, 4)).toBe(180);
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
