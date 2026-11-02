import { describe, expect, it } from 'vitest';
import { addDays, format, parseISO } from 'date-fns';
import type { Task } from '@/features/planner/types/planner';
import type { TaskWithLane } from '@/features/planner/lib/taskLanes';
import {
  buildRowLaneProfile,
  classifyRowsByViewport,
  getRowFitMargins,
  getViewportDayWindow,
  maxLanesInDayWindow,
  nextRowFit,
  resolveRowFitMode,
  rowFitTransition,
  rowHeightForLanes,
  scrollTopCompensation,
  type RowFitMode,
} from '@/features/planner/lib/timelineRowFit';

const bar = (id: string, startDate: string, endDate: string, lane: number): TaskWithLane => ({
  id,
  title: id,
  projectId: null,
  assigneeIds: [],
  startDate,
  endDate,
  statusId: 'status-1',
  typeId: 'type-1',
  priority: null,
  tagIds: [],
  description: null,
  repeatId: null,
  lane,
} as Task & { lane: number });

const keys = (from: string, count: number) => (
  Array.from({ length: count }, (_, index) => format(addDays(parseISO(from), index), 'yyyy-MM-dd'))
);

describe('buildRowLaneProfile', () => {
  const march = keys('2026-03-01', 31);

  it('needs one lane on a free day and lane + 1 on a day a bar covers', () => {
    const profile = buildRowLaneProfile([
      bar('a', '2026-03-03', '2026-03-04', 0),
      bar('b', '2026-03-04', '2026-03-04', 2),
    ], march);

    expect(Array.from(profile.slice(0, 6))).toEqual([1, 1, 1, 3, 1, 1]);
  });

  it('clips bars that reach past the rendered days', () => {
    const profile = buildRowLaneProfile([
      bar('before', '2026-02-20', '2026-03-02', 1),
      bar('after', '2026-03-30', '2026-04-10', 3),
    ], march);

    expect(Array.from(profile.slice(0, 3))).toEqual([2, 2, 1]);
    expect(Array.from(profile.slice(28))).toEqual([1, 4, 4]);
  });

  it('counts a bar with its dates the wrong way round on its start day, as it is drawn', () => {
    const profile = buildRowLaneProfile([bar('inverted', '2026-03-10', '2026-03-08', 2)], march);

    expect(profile[9]).toBe(3);
    expect(profile[7]).toBe(1);
  });

  it('ignores bars entirely outside the rendered days', () => {
    const profile = buildRowLaneProfile([bar('may', '2026-05-01', '2026-05-03', 5)], march);

    expect(Math.max(...profile)).toBe(1);
  });

  it('treats a time-off bar as a minimum lane, not an added one', () => {
    // The bar owns lane 0 and never enters the lane packer; tasks it overlaps
    // were already packed below it. Adding a lane for it left an empty strip
    // above the row's tasks on every day outside the period.
    const metrics = { minRowHeight: 56, taskHeight: 40, taskGap: 4 };
    const fit = (rowTasks: TaskWithLane[]) => rowHeightForLanes(
      maxLanesInDayWindow(buildRowLaneProfile(rowTasks, march, 1), { first: 0, last: 30 }),
      metrics,
    );

    expect(fit([bar('outside', '2026-03-10', '2026-03-10', 0)])).toBe(60);
    expect(fit([])).toBe(60);
    expect(fit([bar('under', '2026-03-10', '2026-03-10', 1)])).toBe(104);
  });

  it('keeps the minimum lanes on every day', () => {
    const profile = buildRowLaneProfile([], march, 2);

    expect(profile.every((lanes) => lanes === 2)).toBe(true);
  });
});

describe('maxLanesInDayWindow', () => {
  const march = keys('2026-03-01', 31);
  const profile = buildRowLaneProfile([
    bar('busy', '2026-03-05', '2026-03-05', 5),
    bar('later', '2026-03-20', '2026-03-22', 1),
  ], march);

  it('takes the busiest day inside the window only', () => {
    expect(maxLanesInDayWindow(profile, { first: 0, last: 10 })).toBe(6);
    expect(maxLanesInDayWindow(profile, { first: 10, last: 25 })).toBe(2);
    expect(maxLanesInDayWindow(profile, { first: 25, last: 30 })).toBe(1);
  });

  it('clamps the window to the rendered days and falls back when empty', () => {
    expect(maxLanesInDayWindow(profile, { first: -5, last: 4 })).toBe(6);
    expect(maxLanesInDayWindow(profile, { first: 40, last: 50 }, 1)).toBe(1);
  });
});

describe('getViewportDayWindow', () => {
  it('counts a day once any part of it is on screen', () => {
    expect(getViewportDayWindow({ scrollLeft: 130, viewportWidth: 300, dayWidth: 120, dayCount: 100 }))
      .toEqual({ first: 1, last: 3 });
  });

  it('widens by the margin and stays inside the rendered days', () => {
    expect(getViewportDayWindow({ scrollLeft: 0, viewportWidth: 240, dayWidth: 120, dayCount: 3, marginDays: 2 }))
      .toEqual({ first: 0, last: 2 });
  });

  it('is unknown until the viewport has been measured', () => {
    expect(getViewportDayWindow({ scrollLeft: 0, viewportWidth: 0, dayWidth: 120, dayCount: 100 })).toBeNull();
  });
});

describe('rowHeightForLanes', () => {
  it('stacks lanes of 40 px with 4 px gaps and 8 px padding, never below the minimum', () => {
    const metrics = { minRowHeight: 56, taskHeight: 40, taskGap: 4 };
    expect(rowHeightForLanes(1, metrics)).toBe(60);
    expect(rowHeightForLanes(3, metrics)).toBe(148);
    expect(rowHeightForLanes(1, { ...metrics, minRowHeight: 104 })).toBe(104);
  });
});

describe('getRowFitMargins', () => {
  it('grows for a fifth of the screen (160–240 px) and keeps 120 px more at rest', () => {
    expect(getRowFitMargins(1100, 120)).toEqual({ growDays: 2, settleDays: 3 });
    expect(getRowFitMargins(1100, 48)).toEqual({ growDays: 5, settleDays: 8 });
    expect(getRowFitMargins(334, 120)).toEqual({ growDays: 2, settleDays: 3 });
    expect(getRowFitMargins(334, 48)).toEqual({ growDays: 4, settleDays: 6 });
    expect(getRowFitMargins(2400, 120)).toEqual({ growDays: 2, settleDays: 3 });
  });

  it('is zero until the viewport is measured', () => {
    expect(getRowFitMargins(0, 120)).toEqual({ growDays: 0, settleDays: 0 });
  });
});

describe('classifyRowsByViewport', () => {
  const heights = { a: 100, b: 100, c: 100, d: 100, e: 100 };
  const order = ['a', 'b', 'c', 'd', 'e'];

  it('splits rows wholly above the band and more than half a screen below it', () => {
    // Header 50: rows at 50..150, 150..250, 250..350, 350..450, 450..550.
    // Scrolled 150: band 200..310, half a screen more to 365.
    const { above, below } = classifyRowsByViewport(order, heights, { scrollTop: 150, clientHeight: 160, headerHeight: 50 });

    expect([...above]).toEqual(['a']);
    expect([...below]).toEqual(['e']);
  });

  it('counts a row cut by the top of the band as visible while at least half of it shows', () => {
    // Band from 149: 'a' (50..150) shows 1 px, 'b' (150..250) all of it.
    const cutTop = classifyRowsByViewport(order, heights, { scrollTop: 99, clientHeight: 100, headerHeight: 50 });
    expect([...cutTop.above]).toEqual(['a']);
    expect([...cutTop.cut]).toEqual(['a']);
    // Band from 100: half of 'a' shows.
    expect([...classifyRowsByViewport(order, heights, { scrollTop: 50, clientHeight: 100, headerHeight: 50 }).above])
      .toEqual([]);
  });
});

describe('resolveRowFitMode', () => {
  it('holds over everything, resets on a jump or before measuring, then follows use', () => {
    expect(resolveRowFitMode({ measured: true, hold: true, jumped: true, interacting: true })).toBe('hold');
    expect(resolveRowFitMode({ measured: false, hold: false, jumped: false, interacting: true })).toBe('reset');
    expect(resolveRowFitMode({ measured: true, hold: false, jumped: true, interacting: true })).toBe('reset');
    expect(resolveRowFitMode({ measured: true, hold: false, jumped: false, interacting: true })).toBe('motion');
    expect(resolveRowFitMode({ measured: true, hold: false, jumped: false, interacting: false })).toBe('rest');
  });
});

describe('nextRowFit', () => {
  const rowIds = ['above', 'visible', 'below'];
  const none = new Set<string>();
  const sides = { above: new Set(['above']), below: new Set(['below']) };
  const fit = (
    shown: Record<string, number> | null,
    grow: Record<string, number>,
    settle: Record<string, number>,
    mode: RowFitMode,
    { above = none, below = none }: { above?: Set<string>; below?: Set<string> } = {},
  ) => nextRowFit({ rowIds, shown, growTarget: grow, settleTarget: settle, mode, above, below });

  it('grows while in use, never shrinks, and leaves rows above the screen alone', () => {
    const shown = { above: 100, visible: 100, below: 200 };
    const next = fit(shown, { above: 300, visible: 300, below: 100 }, { above: 300, visible: 300, below: 100 }, 'motion', sides);

    expect(next.heights).toEqual({ above: 100, visible: 300, below: 200 });
    expect([...next.instant].sort()).toEqual(['above', 'below']);
  });

  it('only shrinks at rest, to the settle target but not under the grow target', () => {
    const shown = { above: 300, visible: 300, below: 300 };
    const next = fit(shown, { above: 100, visible: 120, below: 100 }, { above: 150, visible: 150, below: 400 }, 'rest');

    expect(next.heights).toEqual({ above: 150, visible: 150, below: 300 });
  });

  it('still grows at rest to fit what is on screen', () => {
    const next = fit({ above: 100, visible: 100, below: 100 }, { above: 100, visible: 200, below: 100 }, { above: 100, visible: 200, below: 100 }, 'rest');

    expect(next.heights.visible).toBe(200);
  });

  it('keeps a visible row that would give back less than two lanes, but not one out of sight', () => {
    const shown = { above: 200, visible: 200, below: 200 };
    const next = fit(shown, { above: 120, visible: 120, below: 120 }, { above: 120, visible: 120, below: 120 }, 'rest', sides);

    expect(next.heights).toEqual({ above: 120, visible: 200, below: 120 });
    expect([...next.instant].sort()).toEqual(['above', 'below']);
  });

  it('sets every row at once on a reset and changes nothing on a hold', () => {
    const shown = { above: 200, visible: 200, below: 200 };
    const target = { above: 60, visible: 300, below: 60 };

    const reset = fit(shown, target, target, 'reset');
    expect(reset.heights).toEqual(target);
    expect(reset.instant.size).toBe(3);

    expect(fit(shown, target, target, 'hold').heights).toBe(shown);
  });

  it('takes the settle target at once for a row seen for the first time and drops rows gone', () => {
    const next = fit({ visible: 100, gone: 80 } as Record<string, number>, { above: 60, visible: 100, below: 60 }, { above: 104, visible: 100, below: 104 }, 'motion');

    expect(next.heights).toEqual({ above: 104, visible: 100, below: 104 });
    expect([...next.instant].sort()).toEqual(['above', 'below']);
  });

  it('does not shrink a row cut by the top of the screen, but lets it grow', () => {
    const shown = { above: 300, visible: 100, below: 100 };
    const cut = new Set(['above']);
    const shrink = nextRowFit({ rowIds, shown, growTarget: { above: 60, visible: 100, below: 100 }, settleTarget: { above: 60, visible: 100, below: 100 }, mode: 'rest', above: cut, below: none, cut });
    expect(shrink.heights).toBe(shown);

    const grow = nextRowFit({ rowIds, shown, growTarget: { above: 400, visible: 100, below: 100 }, settleTarget: { above: 400, visible: 100, below: 100 }, mode: 'rest', above: cut, below: none, cut });
    expect(grow.heights.above).toBe(400);
    expect(grow.instant.has('above')).toBe(true);
  });

  it('grows rows above the screen at once when nothing is scrolling', () => {
    const shown = { above: 100, visible: 100, below: 100 };
    const next = nextRowFit({ rowIds, shown, growTarget: { above: 300, visible: 100, below: 100 }, settleTarget: { above: 300, visible: 100, below: 100 }, mode: 'motion', above: new Set(['above']), below: none, holdAbove: false });

    expect(next.heights.above).toBe(300);
    expect(next.instant.has('above')).toBe(true);
  });

  it('returns the shown heights themselves when nothing changes', () => {
    const shown = { above: 100, visible: 100, below: 100 };

    expect(fit(shown, shown, shown, 'motion').heights).toBe(shown);
    expect(fit(shown, shown, shown, 'rest').heights).toBe(shown);
  });
});

describe('scrollTopCompensation', () => {
  const rowIds = ['a', 'b', 'c'];

  it('adds up the changes of the rows above the screen only', () => {
    expect(scrollTopCompensation(rowIds, { a: 100, b: 100, c: 100 }, { a: 60, b: 160, c: 300 }, new Set(['a', 'b']))).toBe(20);
  });

  it('is zero when the rows themselves changed', () => {
    expect(scrollTopCompensation(rowIds, { a: 100, b: 100 }, { a: 60, b: 160, c: 300 }, new Set(['a']))).toBe(0);
  });
});

describe('rowFitTransition', () => {
  it('glides quickly while growing in use, softly when settling, not at all otherwise', () => {
    expect(rowFitTransition('motion')).toBe('height 200ms cubic-bezier(0.2, 0, 0, 1)');
    expect(rowFitTransition('rest')).toBe('height 300ms cubic-bezier(0.4, 0, 0.2, 1)');
    expect(rowFitTransition('reset')).toBe('none');
    expect(rowFitTransition('hold')).toBe('none');
  });
});
