import { useState } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { formatDayHeader } from '@/features/planner/lib/dateUtils';
import { TimelineHeader } from '@/features/planner/components/timeline/TimelineHeader';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

// Count how many times TimelineHeader does render-time work by wrapping the pure
// per-day helper it calls once per visible day.
vi.mock('@/features/planner/lib/dateUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/planner/lib/dateUtils')>();
  return { ...actual, formatDayHeader: vi.fn(actual.formatDayHeader) };
});

const DAYS = [new Date('2026-02-02'), new Date('2026-02-03'), new Date('2026-02-04')];
const HOLIDAYS = new Set<string>();
const NOOP = () => {};

// A parent that re-renders on demand while passing STABLE props to the header.
const Harness = ({ dayWidth }: { dayWidth: number }) => {
  const [tick, setTick] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setTick((value) => value + 1)}>
        tick {tick}
      </button>
      <TimelineHeader
        visibleDays={DAYS}
        dayWidth={dayWidth}
        viewMode="day"
        attentionDate={null}
        todayKey="2026-02-03"
        holidayDates={HOLIDAYS}
        onDateContextAction={NOOP}
      />
    </>
  );
};

const renderCount = () => (formatDayHeader as unknown as ReturnType<typeof vi.fn>).mock.calls.length / DAYS.length;

describe('TimelineHeader memoization', () => {
  beforeEach(() => {
    (formatDayHeader as unknown as ReturnType<typeof vi.fn>).mockClear();
  });

  it('does not re-render when the parent re-renders with unchanged props', () => {
    const { getByRole } = render(<Harness dayWidth={40} />);
    expect(renderCount()).toBe(1); // initial render

    // Force three parent re-renders (props to the header stay referentially equal).
    fireEvent.click(getByRole('button'));
    fireEvent.click(getByRole('button'));
    fireEvent.click(getByRole('button'));

    // React.memo bailed every time — the ~122 day cells are not rebuilt on a scroll tick.
    expect(renderCount()).toBe(1);
  });

  it('does re-render when a prop actually changes (memo compares, not always-bails)', () => {
    const { rerender } = render(<Harness dayWidth={40} />);
    expect(renderCount()).toBe(1);

    rerender(<Harness dayWidth={48} />); // dayWidth changed → header must re-render
    expect(renderCount()).toBe(2);
  });
});
