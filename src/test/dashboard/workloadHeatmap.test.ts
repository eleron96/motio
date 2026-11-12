import { describe, it, expect } from 'vitest';
import {
  autoCapacityPerPerson,
  availableHeadcount,
  availableShare,
  awayCountByDate,
  awayPercentByDate,
  capacityPercentByAssignee,
  normalizeCapacityPercent,
  colorForLevel,
  dayLoad,
  dayPercent,
  isOverloadLevel,
  overloadOutlook,
  DEFAULT_CAPACITY_PER_PERSON,
  FOUNDING_DAYS,
  headcountByDate,
  historyLoadPerPerson,
  levelForPercent,
  localIsoDay,
  milestoneKernelSum,
  MILESTONE_CREW,
  resolveCapacity,
  teamPercentByDate,
  teamPresence,
  workloadMilestones,
  type TeamMember,
} from '@/features/dashboard/lib/workloadHeatmap';
import type { DashboardMilestone, DashboardTimeOff } from '@/features/dashboard/types/dashboard';

// A team where everyone has always been there — what every test before the
// day-by-day team assumed.
const everyone = (...ids: string[]) => teamPresence(ids.map((id) => ({ id, isActive: true })));

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
  it('buckets a normal day into four levels and an overload into three steps', () => {
    expect(levelForPercent(0)).toBe(0);
    expect(levelForPercent(25)).toBe(1);
    expect(levelForPercent(50)).toBe(2);
    expect(levelForPercent(75)).toBe(3);
    expect(levelForPercent(100)).toBe(4);
    expect(levelForPercent(101)).toBe(5);
    expect(levelForPercent(125)).toBe(5);
    expect(levelForPercent(126)).toBe(6);
    expect(levelForPercent(150)).toBe(6);
    expect(levelForPercent(151)).toBe(7);
    expect(levelForPercent(400)).toBe(7);
  });

  it('calls only the levels over 100% an overload', () => {
    expect(isOverloadLevel(levelForPercent(100))).toBe(false);
    expect(isOverloadLevel(levelForPercent(101))).toBe(true);
    expect(isOverloadLevel(levelForPercent(200))).toBe(true);
  });
});

describe('dayLoad', () => {
  it('splits the day into tasks and deliveries that add up to the day', () => {
    // 4 people, capacity 1: 4 tasks = 100%; one delivery at peak pins 1.4 people = 35%.
    expect(dayLoad(4, 4, 1, 1)).toEqual({ percent: 135, taskPercent: 100, milestonePercent: 35 });
    expect(dayLoad(4, 4, 1, 0)).toEqual({ percent: 100, taskPercent: 100, milestonePercent: 0 });
  });

  it('never lets the rounded parts drift from the rounded whole', () => {
    for (let tasks = 0; tasks <= 9; tasks += 1) {
      for (const kernel of [0, 0.15, 0.5, 0.85, 1, 2.3]) {
        const load = dayLoad(tasks, 3, 0.7, kernel);
        expect(load.taskPercent + load.milestonePercent).toBe(load.percent);
        expect(load.percent).toBe(dayPercent(tasks, 3, 0.7, kernel));
        expect(load.milestonePercent).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('overloadOutlook', () => {
  const days = (...percents: number[]) => percents.map((percent, index) => ({
    iso: `2026-11-${String(index + 10).padStart(2, '0')}`,
    percent,
  }));

  it('says nothing is wrong when no working day is over 100%', () => {
    expect(overloadOutlook(days(40, 100, 90))).toEqual({ kind: 'clear' });
    expect(overloadOutlook([])).toEqual({ kind: 'clear' });
  });

  it('names the first overloaded day when the team is fine today', () => {
    expect(overloadOutlook(days(40, 60, 120, 130))).toEqual({ kind: 'ahead', from: '2026-11-12' });
  });

  it('runs an overload on through a short breather and ends it at a calm stretch', () => {
    // Overloaded today; one calm day on the 12th does not end it; five calm days do.
    expect(overloadOutlook(days(120, 110, 80, 140, 90, 90, 90, 90, 90, 150))).toEqual({
      kind: 'now',
      until: '2026-11-13',
    });
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
  const ACTIVE = everyone('a1', 'a2', 'a3');
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
    expect(awayCountByDate([record('a1', '2026-07-10', '2026-07-10')], everyone(), WINDOW).size).toBe(0);
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
    for (const level of [1, 2, 3, 4, 5, 6, 7] as const) {
      expect(colorForLevel(level).bg).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe('each person\'s share (heatmap.personCapacity)', () => {
  const WINDOW = { startIso: '2026-07-01', endIso: '2026-07-31' };
  const off = (assigneeId: string, startDate: string, endDate: string): DashboardTimeOff => ({
    id: `t-${assigneeId}-${startDate}`,
    assigneeId,
    startDate,
    endDate,
  });

  it('counts everyone in full unless a share is set, and keeps shares within 0–100', () => {
    const shares = capacityPercentByAssignee(['a', 'b', 'c'], { a: 0, b: 50, x: 30 });
    expect(Object.fromEntries(shares)).toEqual({ a: 0, b: 50, c: 100 });
    expect(teamPercentByDate(shares, everyone('a', 'b', 'c'), WINDOW).get('2026-07-10')).toBe(150);
    expect(normalizeCapacityPercent(140)).toBe(100);
    expect(normalizeCapacityPercent(-5)).toBe(0);
    expect(normalizeCapacityPercent('abc')).toBe(100);
    expect(normalizeCapacityPercent(33.4)).toBe(33);
  });

  it('gives the same numbers as whole people when everyone is at 100%', () => {
    const team = everyone('a', 'b', 'c', 'd');
    const records = [off('a', '2026-07-10', '2026-07-11'), off('b', '2026-07-11', '2026-07-11')];
    const shares = capacityPercentByAssignee(team.keys(), {});
    const teamPercent = teamPercentByDate(shares, team, WINDOW);
    const awayPercent = awayPercentByDate(records, shares, team, WINDOW);
    const headcount = headcountByDate(team, WINDOW);
    const awayCount = awayCountByDate(records, team, WINDOW);
    for (const iso of ['2026-07-09', '2026-07-10', '2026-07-11']) {
      expect(availableShare(teamPercent.get(iso) ?? 0, awayPercent.get(iso) ?? 0))
        .toBe(availableHeadcount(headcount.get(iso) ?? 0, awayCount.get(iso) ?? 0));
    }
  });

  it('takes away only the share of who is away', () => {
    const team = everyone('coord', 'half', 'full');
    const shares = capacityPercentByAssignee(team.keys(), { coord: 0, half: 50 });
    const teamPercent = teamPercentByDate(shares, team, WINDOW);
    const away = awayPercentByDate([off('half', '2026-07-10', '2026-07-10')], shares, team, WINDOW);
    expect(availableShare(teamPercent.get('2026-07-10') ?? 0, away.get('2026-07-10') ?? 0)).toBe(1);
    expect(availableShare(teamPercent.get('2026-07-09') ?? 0, away.get('2026-07-09') ?? 0)).toBe(1.5);
  });

  it('leaves exactly nobody when everyone with a share is away', () => {
    const team = everyone('a', 'b');
    const shares = capacityPercentByAssignee(team.keys(), { a: 30, b: 70 });
    const away = awayPercentByDate([off('a', '2026-07-10', '2026-07-10'), off('b', '2026-07-10', '2026-07-10')], shares, team, WINDOW);
    expect(availableShare(100, away.get('2026-07-10') ?? 0)).toBe(0);
  });

  it('drops the share of someone who has left from the days after, not the days before', () => {
    const team = teamPresence([
      { id: 'full', isActive: true },
      { id: 'half', isActive: false, leftOn: '2026-07-15' },
    ]);
    const shares = capacityPercentByAssignee(team.keys(), { half: 50 });
    const teamPercent = teamPercentByDate(shares, team, WINDOW);
    expect(teamPercent.get('2026-07-14')).toBe(150);
    expect(teamPercent.get('2026-07-15')).toBe(100);
  });

  it('loads half a person twice as heavily as a whole one', () => {
    expect(dayPercent(5, 0.5, 5, 0)).toBe(200);
    expect(dayPercent(5, 1, 5, 0)).toBe(100);
  });
});

describe('the team, day by day', () => {
  const WINDOW = { startIso: '2026-07-01', endIso: '2026-07-31' };
  // A workspace that has been running for years: the founding month is long over.
  const veteran = (id: string): TeamMember => ({ id, isActive: true, joinedOn: '2024-01-10' });
  const off = (assigneeId: string, startDate: string, endDate: string): DashboardTimeOff => ({
    id: `t-${assigneeId}-${startDate}`,
    assigneeId,
    startDate,
    endDate,
  });

  it('keeps the team a past day had when someone leaves', () => {
    const team = teamPresence([
      veteran('a'), veteran('b'), veteran('c'), veteran('d'),
      { id: 'e', isActive: false, joinedOn: '2024-01-10', leftOn: '2026-07-20' },
    ]);
    const headcount = headcountByDate(team, WINDOW);
    expect(headcount.get('2026-07-01')).toBe(5);
    expect(headcount.get('2026-07-19')).toBe(5);
    // From the day they were switched off the team is four — today and onwards.
    expect(headcount.get('2026-07-20')).toBe(4);
    expect(headcount.get('2026-07-31')).toBe(4);
    // The same 20 tasks: 80% for five people before, a full day for four after.
    expect(dayPercent(20, headcount.get('2026-07-19') ?? 0, 5, 0)).toBe(80);
    expect(dayPercent(20, headcount.get('2026-07-20') ?? 0, 5, 0)).toBe(100);
  });

  it('does not cool down the days before someone joined', () => {
    const team = teamPresence([
      veteran('a'), veteran('b'), veteran('c'), veteran('d'),
      { id: 'new', isActive: true, joinedOn: '2026-07-20' },
    ]);
    const headcount = headcountByDate(team, WINDOW);
    expect(headcount.get('2026-07-19')).toBe(4);
    expect(headcount.get('2026-07-20')).toBe(5);
  });

  it('counts everyone added while the workspace was being set up as there from the start', () => {
    // Work that began before Motio is entered with its real dates: the people
    // entered alongside it must be there to divide it by.
    const team = teamPresence([
      { id: 'owner', isActive: true, joinedOn: '2026-07-10' },
      { id: 'b', isActive: true, joinedOn: '2026-07-12' },
      { id: 'c', isActive: true, joinedOn: addDays('2026-07-10', FOUNDING_DAYS) },
      { id: 'late', isActive: true, joinedOn: addDays('2026-07-10', FOUNDING_DAYS + 1) },
    ]);
    const headcount = headcountByDate(team, { startIso: '2026-06-01', endIso: '2026-08-31' });
    expect(headcount.get('2026-06-01')).toBe(3);
    expect(headcount.get(addDays('2026-07-10', FOUNDING_DAYS))).toBe(3);
    expect(headcount.get(addDays('2026-07-10', FOUNDING_DAYS + 1))).toBe(4);
  });

  it('treats people without dates as always there (the sandbox, old data)', () => {
    const headcount = headcountByDate(everyone('a', 'b'), WINDOW);
    expect(headcount.get('2026-07-01')).toBe(2);
    expect(headcount.get('2026-07-31')).toBe(2);
  });

  it('leaves out a switched-off person whose leaving day is unknown, on every day', () => {
    const team = teamPresence([veteran('a'), { id: 'old', isActive: false, joinedOn: '2024-01-10' }]);
    expect(team.has('old')).toBe(false);
    expect(headcountByDate(team, WINDOW).get('2026-07-01')).toBe(1);
  });

  it('counts an absence only on days its person was on the team', () => {
    const team = teamPresence([
      veteran('a'),
      { id: 'gone', isActive: false, joinedOn: '2024-01-10', leftOn: '2026-07-12' },
    ]);
    const away = awayCountByDate([off('gone', '2026-07-10', '2026-07-14')], team, WINDOW);
    expect(away.get('2026-07-10')).toBe(1);
    expect(away.get('2026-07-11')).toBe(1);
    expect(away.get('2026-07-12')).toBeUndefined();
  });

  it('reads a timestamp as a local calendar day', () => {
    expect(localIsoDay(new Date(2026, 6, 20, 23, 30).toISOString())).toBe('2026-07-20');
    expect(localIsoDay(new Date(2026, 6, 20, 0, 5).toISOString())).toBe('2026-07-20');
    expect(localIsoDay(null)).toBeNull();
    expect(localIsoDay(undefined)).toBeNull();
    expect(localIsoDay('not a date')).toBeNull();
  });
});

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
