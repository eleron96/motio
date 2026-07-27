import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TimeOffBar } from '@/features/planner/components/timeline/TimeOffBar';
import type { TimeOff } from '@/features/planner/types/planner';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) => (
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
  ),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('@/features/planner/store/plannerStore', () => ({
  usePlannerStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    updateTimeOff: vi.fn(),
    setTimeOffDragPreview: vi.fn(),
  }),
}));

vi.mock('@/shared/hooks/use-mobile', () => ({ useIsMobile: () => false }));

const record = (note: string | null): TimeOff => ({
  id: 'to1',
  assigneeId: 'a1',
  startDate: '2026-08-17',
  endDate: '2026-08-30',
  note,
});

const renderBar = (note: string | null) => render(
  <TimeOffBar
    record={record(note)}
    position={{ left: 0, width: 400 }}
    dayWidth={40}
    siblings={[]}
    canEditOwn
    onOpenDetail={vi.fn()}
  />,
);

const lines = () => Array.from(
  screen.getByTestId('timeline-time-off-to1').querySelectorAll('span'),
).map((span) => span.textContent);

describe('TimeOffBar label', () => {
  // The bar IS the record, so it reads "Day off", not the action that made it.
  it('leads with the note so the reason is the first thing read', () => {
    renderBar('отпуск');

    expect(lines()[0]).toBe('Day off — отпуск');
  });

  it('drops the dash when there is no note', () => {
    renderBar(null);

    expect(lines()[0]).toBe('Day off');
  });

  // The dates moved off the headline to make room; they must not vanish with it.
  it('keeps the range on its own second line, without the note', () => {
    renderBar('отпуск');

    expect(lines()[1]).toContain('2026');
    expect(lines()[1]).not.toContain('отпуск');
  });

  it('still spells everything out in the tooltip', () => {
    renderBar('отпуск');
    const title = screen.getByTestId('timeline-time-off-to1').getAttribute('title');

    expect(title).toContain('Day off');
    expect(title).toContain('отпуск');
    expect(title).toContain('2026');
  });
});
