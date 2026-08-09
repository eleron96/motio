import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { enUS } from 'date-fns/locale';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

import { MobileDaySheet } from '@/features/planner/components/timeline/MobileDaySheet';
import type { Assignee, Milestone, Project, TimeOff } from '@/features/planner/types/planner';

const DAY = new Date('2026-08-06T12:00:00');

const PROJECT = { id: 'p1', name: 'Brand Refresh', code: 'BR', color: '#3366ff' } as Project;
const MILESTONE = { id: 'm1', projectId: 'p1', title: 'Hand over the brief', date: '2026-08-06' } as Milestone;
const PERSON = { id: 'a1', name: 'Anna', isActive: true } as Assignee;
const AWAY = {
  id: 'to1',
  assigneeId: 'a1',
  startDate: '2026-08-05',
  endDate: '2026-08-08',
  note: 'Vacation',
} as TimeOff;

const renderSheet = (overrides: Partial<React.ComponentProps<typeof MobileDaySheet>> = {}) => {
  const props: React.ComponentProps<typeof MobileDaySheet> = {
    day: DAY,
    onOpenChange: vi.fn(),
    counts: { total: 4, mine: 1 },
    milestones: [MILESTONE],
    showMilestones: true,
    timeOff: [AWAY],
    holidayNames: [],
    showHolidays: true,
    projectById: new Map([['p1', PROJECT]]),
    assigneeById: new Map([['a1', PERSON]]),
    timeOffColors: new Map([['a1', '#88cc88']]),
    dateLocale: enUS,
    canEdit: true,
    onOpenDay: vi.fn(),
    onEditMilestone: vi.fn(),
    onCreateMilestone: vi.fn(),
    ...overrides,
  };
  render(<MobileDaySheet {...props} />);
  return props;
};

describe('Day sheet on a phone', () => {
  it('shows everything the hover card shows, which a finger cannot reach', () => {
    renderSheet();

    expect(screen.getByText('Hand over the brief')).toBeInTheDocument();
    expect(screen.getByText('[BR] Brand Refresh')).toBeInTheDocument();
    expect(screen.getByText('Anna')).toBeInTheDocument();
    expect(screen.getByText(/Vacation/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hand over the brief/ })).toBeInTheDocument();
    // Scoped to their own rows: two loose digits would still match if the two
    // counts were swapped.
    const totalRow = screen.getByText('Total').closest('div') as HTMLElement;
    const mineRow = screen.getByText('Mine').closest('div') as HTMLElement;
    expect(within(totalRow).getByText('4')).toBeInTheDocument();
    expect(within(mineRow).getByText('1')).toBeInTheDocument();
  });

  it('shows the holiday the day falls on', () => {
    renderSheet({ holidayNames: ['Independence Day'] });

    expect(screen.getByText('Independence Day')).toBeInTheDocument();
  });

  it('opens the day and edits a milestone from the sheet', async () => {
    const user = userEvent.setup();
    const props = renderSheet();

    await user.click(screen.getByRole('button', { name: /Hand over the brief/ }));
    expect(props.onEditMilestone).toHaveBeenCalledWith(MILESTONE);

    await user.click(screen.getByRole('button', { name: /Open this day/ }));
    expect(props.onOpenDay).toHaveBeenCalledWith(DAY);
  });

  it('offers "create milestone" only to an editor', async () => {
    const user = userEvent.setup();
    const props = renderSheet();

    await user.click(screen.getByRole('button', { name: /Create milestone/ }));
    expect(props.onCreateMilestone).toHaveBeenCalledWith(DAY);
  });

  it('hides "create milestone" from a read-only viewer', () => {
    renderSheet({ canEdit: false });

    expect(screen.queryByRole('button', { name: /Create milestone/ })).not.toBeInTheDocument();
    // Reading the day stays available to everyone.
    expect(screen.getByRole('button', { name: /Open this day/ })).toBeInTheDocument();
  });

  it('leaves out the layers the legend has switched off', () => {
    renderSheet({ showMilestones: false, holidayNames: ['Independence Day'], showHolidays: false });

    expect(screen.queryByText('Hand over the brief')).not.toBeInTheDocument();
    expect(screen.queryByText('Independence Day')).not.toBeInTheDocument();
    // Away and counts do not belong to those layers.
    expect(screen.getByText('Anna')).toBeInTheDocument();
  });

  it('renders nothing while no day is picked', () => {
    renderSheet({ day: null });

    expect(screen.queryByText('Anna')).not.toBeInTheDocument();
  });
});
