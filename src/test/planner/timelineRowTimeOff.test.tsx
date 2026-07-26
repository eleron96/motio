import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { TimelineRow } from '@/features/planner/components/timeline/TimelineRow';
import type { TimeOff } from '@/features/planner/types/planner';

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

// Mon 2026-08-03 … Sun 2026-08-09.
const WEEK = [
  '2026-08-03',
  '2026-08-04',
  '2026-08-05',
  '2026-08-06',
  '2026-08-07',
  '2026-08-08', // Saturday
  '2026-08-09', // Sunday
];

const visibleDays = WEEK.map((iso) => new Date(`${iso}T12:00:00`));

const record: TimeOff = {
  id: 'to1',
  assigneeId: 'a1',
  startDate: '2026-08-04',
  endDate: '2026-08-09',
  note: null,
};

const daysMapFor = (item: TimeOff) => {
  const map = new Map<string, TimeOff>();
  WEEK.forEach((iso) => {
    if (iso >= item.startDate && iso <= item.endDate) map.set(iso, item);
  });
  return map;
};

const renderRow = (timeOffDays?: Map<string, TimeOff>, holidayDates?: Set<string>) => render(
  <TimelineRow
    rowId="a1"
    rowIndex={0}
    visibleDays={visibleDays}
    dayWidth={40}
    viewMode="day"
    todayKey="2026-08-03"
    holidayDates={holidayDates}
    timeOffDays={timeOffDays}
    height={104}
  >
    {null}
  </TimelineRow>,
);

const shadedKeys = (container: HTMLElement) => Array.from(
  container.querySelectorAll('[data-time-off-shaded="true"]'),
).map((cell) => cell.getAttribute('data-day-key'));

describe('TimelineRow time-off shading', () => {
  it('shades the working days of the period and leaves the weekend alone', () => {
    const { container } = renderRow(daysMapFor(record));

    // 08-08 and 08-09 are covered by the record but are a weekend: untouched.
    expect(shadedKeys(container)).toEqual(['2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07']);
  });

  it('leaves a holiday inside the period untouched', () => {
    const { container } = renderRow(daysMapFor(record), new Set(['2026-08-05']));

    expect(shadedKeys(container)).toEqual(['2026-08-04', '2026-08-06', '2026-08-07']);
  });

  it('shades nothing in a row without records', () => {
    const { container } = renderRow(undefined);

    expect(shadedKeys(container)).toEqual([]);
  });

  it('keeps every day cell rendered regardless of shading', () => {
    const { container } = renderRow(daysMapFor(record));

    expect(container.querySelectorAll('[data-day-key]')).toHaveLength(WEEK.length);
  });
});
