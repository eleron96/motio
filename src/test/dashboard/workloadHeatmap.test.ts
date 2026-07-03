import { describe, it, expect } from 'vitest';
import {
  autoCapacityPerPerson,
  colorForLevel,
  dayPercent,
  DEFAULT_CAPACITY_PER_PERSON,
  levelForPercent,
  milestoneKernelSum,
  MILESTONE_FRACTION,
  resolveCapacity,
} from '@/features/dashboard/lib/workloadHeatmap';
import type { DashboardMilestone } from '@/features/dashboard/types/dashboard';

const milestone = (date: string): DashboardMilestone => ({
  id: `m-${date}`,
  title: 'Deadline',
  projectId: 'p1',
  date,
});

describe('milestone kernel', () => {
  const target = '2026-07-10';
  const ms = [milestone(target)];

  it('weighs the milestone day the same as the day before it, both at peak (1.0)', () => {
    expect(milestoneKernelSum(target, ms)).toBeCloseTo(1, 5);
    expect(milestoneKernelSum('2026-07-09', ms)).toBeCloseTo(1, 5);
  });

  it('ramps up over the 3-4 days before and is light after', () => {
    const before2 = milestoneKernelSum('2026-07-08', ms); // -2 → 0.75
    const before4 = milestoneKernelSum('2026-07-06', ms); // -4 → 0.25
    const after1 = milestoneKernelSum('2026-07-11', ms); // +1 → 0.35
    expect(before2).toBeGreaterThan(before4);
    expect(before4).toBeGreaterThan(0);
    expect(after1).toBeLessThan(before2);
  });

  it('makes a multi-delivery day heavier with diminishing returns, and caps a wide stack', () => {
    // four deliveries on the same date ≈ 1.75× a single one (not 4×)
    const sameDay = milestoneKernelSum(target, [
      milestone(target), milestone(target), milestone(target), milestone(target),
    ]);
    expect(sameDay).toBeCloseTo(1.75, 5);
    expect(sameDay).toBeGreaterThan(milestoneKernelSum(target, ms));
    // heavy clusters on two peak days (the day itself and the day it precedes) blow
    // past the cap and are clamped to MILESTONE_STACK_CAP (1.8)
    const capped = milestoneKernelSum(target, [
      milestone(target), milestone(target), milestone(target), milestone(target),
      milestone('2026-07-11'), milestone('2026-07-11'),
      milestone('2026-07-11'), milestone('2026-07-11'),
    ]);
    expect(capped).toBeCloseTo(1.8, 5);
  });

  it('is zero outside the kernel window', () => {
    expect(milestoneKernelSum('2026-07-05', ms)).toBe(0); // -5
    expect(milestoneKernelSum('2026-07-13', ms)).toBe(0); // +3
  });
});

describe('dayPercent', () => {
  it('is task load over capacity', () => {
    // (20 / 8) / 5 = 0.5 → 50%
    expect(dayPercent(20, 8, 5, 0)).toBe(50);
  });

  it('adds a milestone share on top of tasks and can exceed 100%', () => {
    // one milestone at peak alone
    expect(dayPercent(0, 8, 5, 1)).toBe(Math.round(MILESTONE_FRACTION * 100));
    // 50% of tasks + one capped milestone (45%) = 95%
    expect(dayPercent(20, 8, 5, 1)).toBe(50 + Math.round(MILESTONE_FRACTION * 100));
    // 100% of tasks + one milestone tips into overload
    expect(dayPercent(40, 8, 5, 1)).toBe(100 + Math.round(MILESTONE_FRACTION * 100));
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
