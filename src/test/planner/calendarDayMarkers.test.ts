import { describe, expect, it } from 'vitest';
import {
  buildTimeOffByDate,
  isPersonShown,
  normalizePeopleSelection,
  togglePersonSelection,
  DEFAULT_CALENDAR_OVERLAY_VISIBILITY,
  normalizeOverlayVisibility,
  selectCalendarTimeOff,
  timeOffCircleInsetClass,
  TIME_OFF_HOLIDAY_CIRCLE_SCALE,
} from '@/features/planner/lib/calendarDayMarkers';
import {
  buildDayPie,
  buildPieBackground,
  buildTimeOffColorMap,
  MAX_PIE_SEGMENTS,
  TIME_OFF_OVERFLOW_COLOR,
  TIME_OFF_PALETTE,
  resolveTimeOffColor,
} from '@/features/planner/lib/timeOffPalette';
import { PERSON_PRESET_COLORS } from '@/shared/lib/colors';
import type { Assignee, TimeOff } from '@/features/planner/types/planner';

const record = (over: Partial<TimeOff> = {}): TimeOff => ({
  id: 't1',
  assigneeId: 'a1',
  startDate: '2026-08-03',
  endDate: '2026-08-05',
  note: null,
  ...over,
});

const assignee = (over: Partial<Assignee> = {}): Assignee => ({
  id: 'a1',
  name: 'Person',
  isActive: true,
  email: null,
  phone: null,
  ...over,
});

const day = (iso: string) => new Date(`${iso}T12:00:00`);

describe('normalizeOverlayVisibility', () => {
  it('defaults to holidays and milestones on, time off off', () => {
    expect(DEFAULT_CALENDAR_OVERLAY_VISIBILITY).toEqual({
      holidays: true,
      milestones: true,
      timeOff: false,
    });
  });

  it('keeps known booleans and fills the rest from the defaults', () => {
    expect(normalizeOverlayVisibility({ timeOff: true, holidays: false })).toEqual({
      holidays: false,
      milestones: true,
      timeOff: true,
    });
  });

  it('survives junk', () => {
    expect(normalizeOverlayVisibility(null)).toEqual(DEFAULT_CALENDAR_OVERLAY_VISIBILITY);
    expect(normalizeOverlayVisibility('nope')).toEqual(DEFAULT_CALENDAR_OVERLAY_VISIBILITY);
    expect(normalizeOverlayVisibility({ holidays: 'yes' })).toEqual(DEFAULT_CALENDAR_OVERLAY_VISIBILITY);
  });
});

describe('selectCalendarTimeOff', () => {
  it('drops records of people who left the team and keeps unknown ones', () => {
    const assignees = new Map([
      ['a1', assignee()],
      ['a2', assignee({ id: 'a2', isActive: false })],
    ]);

    const kept = selectCalendarTimeOff(
      [record(), record({ id: 't2', assigneeId: 'a2' }), record({ id: 't3', assigneeId: 'ghost' })],
      assignees,
    );

    expect(kept.map((item) => item.id)).toEqual(['t1', 't3']);
  });
});

describe('buildTimeOffByDate', () => {
  it('expands a period over every day it covers, inclusive', () => {
    const byDate = buildTimeOffByDate([record()], day('2026-08-01'), day('2026-08-31'));

    expect([...byDate.keys()]).toEqual(['2026-08-03', '2026-08-04', '2026-08-05']);
  });

  it('clips to the rendered window', () => {
    const byDate = buildTimeOffByDate(
      [record({ startDate: '2026-07-28', endDate: '2026-08-02' })],
      day('2026-08-01'),
      day('2026-08-31'),
    );

    expect([...byDate.keys()]).toEqual(['2026-08-01', '2026-08-02']);
  });

  it('ignores records entirely outside the window', () => {
    const byDate = buildTimeOffByDate(
      [record({ startDate: '2026-01-01', endDate: '2026-01-05' })],
      day('2026-08-01'),
      day('2026-08-31'),
    );

    expect(byDate.size).toBe(0);
  });

  it('collects several people on the same day', () => {
    const byDate = buildTimeOffByDate(
      [record(), record({ id: 't2', assigneeId: 'a2', startDate: '2026-08-04', endDate: '2026-08-04' })],
      day('2026-08-01'),
      day('2026-08-31'),
    );

    expect(byDate.get('2026-08-04')).toHaveLength(2);
    expect(byDate.get('2026-08-03')).toHaveLength(1);
  });

  it('crosses a month boundary without gaps', () => {
    const byDate = buildTimeOffByDate(
      [record({ startDate: '2026-08-30', endDate: '2026-09-02' })],
      day('2026-08-01'),
      day('2026-09-30'),
    );

    expect([...byDate.keys()]).toEqual(['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02']);
  });
});

describe('time-off colours', () => {
  it('assigns palette colours by id order, so a new teammate shifts nobody', () => {
    const before = buildTimeOffColorMap([assignee({ id: 'b' }), assignee({ id: 'a' })]);
    const after = buildTimeOffColorMap([assignee({ id: 'b' }), assignee({ id: 'a' }), assignee({ id: 'z' })]);

    expect(before.get('a')).toBe(TIME_OFF_PALETTE[0]);
    expect(before.get('b')).toBe(TIME_OFF_PALETTE[1]);
    expect(after.get('a')).toBe(before.get('a'));
    expect(after.get('b')).toBe(before.get('b'));
    expect(after.get('z')).toBe(TIME_OFF_PALETTE[2]);
  });

  it('prefers the colour a person picked in workspace settings', () => {
    const picked = PERSON_PRESET_COLORS[4];
    const colors = buildTimeOffColorMap([
      assignee({ id: 'a' }),
      assignee({ id: 'b', color: picked }),
    ]);

    expect(colors.get('b')).toBe(picked);
    // The neighbour still gets the first colour nobody claimed — here that is
    // still slot 0, because the picked one sits further along the palette.
    expect(colors.get('a')).toBe(TIME_OFF_PALETTE[0]);
  });

  it('never hands out a colour somebody already picked', () => {
    const picked = PERSON_PRESET_COLORS[0];
    const colors = buildTimeOffColorMap([
      assignee({ id: 'a', color: picked }),
      assignee({ id: 'b' }),
      assignee({ id: 'c' }),
    ]);

    expect(colors.get('a')).toBe(picked);
    expect(colors.get('b')).not.toBe(picked);
    expect(colors.get('c')).not.toBe(picked);
    expect(colors.get('b')).not.toBe(colors.get('c'));
  });

  it('gives a full palette worth of people a colour each', () => {
    const people = Array.from({ length: TIME_OFF_PALETTE.length }, (_, index) => (
      assignee({ id: `person-${String(index).padStart(2, '0')}` })
    ));
    const colors = buildTimeOffColorMap(people);

    expect(new Set(colors.values()).size).toBe(TIME_OFF_PALETTE.length);
  });

  it('ignores a stored colour that is not a #rrggbb value', () => {
    const colors = buildTimeOffColorMap([assignee({ id: 'a', color: 'chartreuse' })]);

    expect(colors.get('a')).toBe(TIME_OFF_PALETTE[0]);
  });

  it('falls back to the palette once a colour is reset to auto', () => {
    const colors = buildTimeOffColorMap([assignee({ id: 'a', color: null })]);

    expect(colors.get('a')).toBe(TIME_OFF_PALETTE[0]);
  });

  it('wraps around when a workspace outgrows the palette', () => {
    const many = Array.from({ length: TIME_OFF_PALETTE.length + 1 }, (_, index) => (
      assignee({ id: `person-${String(index).padStart(2, '0')}` })
    ));
    const colors = buildTimeOffColorMap(many);

    expect(colors.get('person-00')).toBe(colors.get(`person-${TIME_OFF_PALETTE.length}`));
  });

  it('still gives an unknown person a stable palette colour, not a grey blob', () => {
    const first = resolveTimeOffColor(new Map(), 'ghost');

    expect(TIME_OFF_PALETTE).toContain(first);
    expect(resolveTimeOffColor(new Map(), 'ghost')).toBe(first);
    expect(resolveTimeOffColor(new Map(), 'other-ghost')).not.toBe('');
  });
});

describe('people selection', () => {
  const all = ['a1', 'a2', 'a3'];

  it('treats null as everyone and an empty list as nobody', () => {
    expect(isPersonShown(null, 'a1')).toBe(true);
    expect(isPersonShown([], 'a1')).toBe(false);
    expect(isPersonShown(['a2'], 'a1')).toBe(false);
  });

  it('unticking one person starts an explicit list', () => {
    expect(togglePersonSelection(null, 'a2', all)).toEqual(['a1', 'a3']);
  });

  it('ticking the last missing person collapses back to everyone', () => {
    // Stored as "everyone" on purpose: a teammate added later is then included
    // automatically instead of quietly missing from the calendar.
    expect(togglePersonSelection(['a1', 'a3'], 'a2', all)).toBeNull();
  });

  it('can end up with nobody selected', () => {
    expect(togglePersonSelection(['a1'], 'a1', all)).toEqual([]);
  });

  it('normalizes junk to everyone', () => {
    expect(normalizePeopleSelection(undefined)).toBeNull();
    expect(normalizePeopleSelection('a1')).toBeNull();
    expect(normalizePeopleSelection(['a1', 5])).toBeNull();
    expect(normalizePeopleSelection(['a1'])).toEqual(['a1']);
  });

  it('narrows the records the calendar draws', () => {
    const assignees = new Map([['a1', assignee()], ['a2', assignee({ id: 'a2' })]]);
    const records = [record(), record({ id: 't2', assigneeId: 'a2' })];

    expect(selectCalendarTimeOff(records, assignees, ['a2']).map((item) => item.id)).toEqual(['t2']);
    expect(selectCalendarTimeOff(records, assignees, null)).toHaveLength(2);
  });
});

describe('buildDayPie', () => {
  const colors = buildTimeOffColorMap([
    assignee({ id: 'a1' }), assignee({ id: 'a2' }), assignee({ id: 'a3' }),
    assignee({ id: 'a4' }), assignee({ id: 'a5' }),
  ]);

  it('counts a person once even with two records that day', () => {
    const pie = buildDayPie([record(), record({ id: 't2' })], colors);

    expect(pie.total).toBe(1);
    expect(pie.colors).toHaveLength(1);
  });

  it('is stable regardless of the order records arrive in', () => {
    const forward = buildDayPie(
      [record({ assigneeId: 'a1' }), record({ id: 't2', assigneeId: 'a2' })],
      colors,
    );
    const reversed = buildDayPie(
      [record({ id: 't2', assigneeId: 'a2' }), record({ assigneeId: 'a1' })],
      colors,
    );

    expect(forward.colors).toEqual(reversed.colors);
  });

  it('shows everyone while they still fit', () => {
    const pie = buildDayPie(
      ['a1', 'a2', 'a3', 'a4'].map((id, index) => record({ id: `t${index}`, assigneeId: id })),
      colors,
    );

    expect(pie.colors).toHaveLength(4);
    expect(pie.overflow).toBe(0);
    expect(pie.colors).not.toContain(TIME_OFF_OVERFLOW_COLOR);
  });

  it('folds the tail into one neutral slice once they stop fitting', () => {
    const pie = buildDayPie(
      ['a1', 'a2', 'a3', 'a4', 'a5'].map((id, index) => record({ id: `t${index}`, assigneeId: id })),
      colors,
    );

    expect(pie.colors).toHaveLength(MAX_PIE_SEGMENTS);
    expect(pie.colors.at(-1)).toBe(TIME_OFF_OVERFLOW_COLOR);
    // Three people keep their own colour, two share the neutral slice.
    expect(pie.overflow).toBe(2);
    expect(pie.total).toBe(5);
  });
});

describe('buildPieBackground', () => {
  it('is a flat colour for one person', () => {
    const pie = buildDayPie([record()], buildTimeOffColorMap([assignee()]));

    expect(buildPieBackground(pie)).toBe(TIME_OFF_PALETTE[0]);
  });

  it('splits the circle into equal slices for several', () => {
    const colors = buildTimeOffColorMap([assignee({ id: 'a1' }), assignee({ id: 'a2' })]);
    const pie = buildDayPie([record(), record({ id: 't2', assigneeId: 'a2' })], colors);
    const background = buildPieBackground(pie);

    expect(background).toContain('conic-gradient');
    expect(background).toContain('180deg');
  });

  it('is transparent when nobody is away', () => {
    expect(buildPieBackground({ colors: [], overflow: 0, total: 0 })).toBe('transparent');
  });
});

describe('away-circle size on a holiday', () => {
  it('shrinks the circle on a public holiday and leaves it alone otherwise', () => {
    expect(timeOffCircleInsetClass(true)).toBe('inset-[15%]');
    expect(timeOffCircleInsetClass(false)).toBe('inset-0');
  });

  // The class has to be a literal for Tailwind to emit it, so nothing enforces
  // that it still matches the documented ratio except this assertion.
  it('keeps the literal class in step with the documented 70%', () => {
    const inset = Number(/inset-\[(\d+(?:\.\d+)?)%\]/.exec(timeOffCircleInsetClass(true))?.[1]);

    expect(1 - (inset * 2) / 100).toBeCloseTo(TIME_OFF_HOLIDAY_CIRCLE_SCALE, 5);
  });
});
