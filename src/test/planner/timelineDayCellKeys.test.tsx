import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { addDays } from 'date-fns';
import { TimelineRow } from '@/features/planner/components/timeline/TimelineRow';
import { TimelineHeader } from '@/features/planner/components/timeline/TimelineHeader';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) => (
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
  ),
}));

// Radix ContextMenu needs ResizeObserver, absent in jsdom.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as typeof ResizeObserver;
}

const HOLIDAYS = new Set<string>();
const NOOP = () => {};

// Local midnights, as getVisibleDays builds them.
const daysFrom = (year: number, month: number, day: number, count: number) => (
  Array.from({ length: count }, (_, index) => addDays(new Date(year, month, day), index))
);

const row = (visibleDays: Date[]) => (
  <TimelineRow
    rowId="a1"
    rowIndex={0}
    visibleDays={visibleDays}
    dayWidth={40}
    viewMode="day"
    todayKey="2026-08-03"
    height={56}
  >
    {null}
  </TimelineRow>
);

const header = (visibleDays: Date[]) => (
  <TimelineHeader
    visibleDays={visibleDays}
    dayWidth={40}
    viewMode="day"
    attentionDate={null}
    todayKey="2026-08-03"
    holidayDates={HOLIDAYS}
    onDateContextAction={NOOP}
  />
);

const cellKeys = (container: HTMLElement) => Array.from(
  container.querySelectorAll('[data-day-key]'),
).map((cell) => cell.getAttribute('data-day-key'));

const cellFor = (container: HTMLElement, dayKey: string) => (
  container.querySelector(`[data-day-key="${dayKey}"]`)
);

// The day list of a session whose time zone changed: two midnights of the old
// zone that the new zone reads as the same calendar day (New York's 8 and 9
// March 2026 midnights, read in Cancun: 8 March 00:00 and 8 March 23:00).
const AFTER_ZONE_CHANGE = [
  new Date(2026, 2, 7),
  new Date(2026, 2, 8),
  new Date(2026, 2, 8, 23),
  new Date(2026, 2, 9, 23),
];

describe.each([
  ['TimelineRow', row],
  ['TimelineHeader', header],
] as const)('%s day cells', (_name, view) => {
  it('keeps the cells of the days that stay in range when the range shifts', () => {
    const { container, rerender } = render(view(daysFrom(2026, 7, 1, 10)));
    const kept = cellFor(container, '2026-08-05');

    rerender(view(daysFrom(2026, 7, 3, 10)));

    expect(cellKeys(container)).toEqual(
      daysFrom(2026, 7, 3, 10).map((day) => `2026-08-${String(day.getDate()).padStart(2, '0')}`),
    );
    expect(cellFor(container, '2026-08-05')).toBe(kept);
  });

  it('leaves no stray cell after a day list with a repeated calendar day', () => {
    const { container, rerender } = render(view(AFTER_ZONE_CHANGE));
    expect(container.querySelectorAll('[data-day-key]')).toHaveLength(4);

    const next = daysFrom(2026, 2, 5, 6);
    rerender(view(next));

    expect(cellKeys(container)).toEqual([
      '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10',
    ]);
  });
});
