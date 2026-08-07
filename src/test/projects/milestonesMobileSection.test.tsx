import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MilestonesMobileSection } from '@/features/projects/components/MilestonesMobileSection';
import type { Customer, Milestone, Project } from '@/features/planner/types/planner';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const project = {
  id: 'p1',
  name: 'Brand Refresh',
  code: 'BRD',
  color: '#3b82f6',
  archived: false,
  customerId: 'c1',
} as Project;

const customer = { id: 'c1', name: 'Blue Orbit' } as Customer;

const milestones = [
  { id: 'm-past', title: 'Kickoff', projectId: 'p1', date: '2020-06-30', note: null, statusOverride: null },
  { id: 'm-next', title: 'Launch', projectId: 'p1', date: '2999-08-08', note: 'Ship it', statusOverride: null },
] as Milestone[];

const renderSection = (overrides: Partial<React.ComponentProps<typeof MilestonesMobileSection>> = {}) => {
  const props: React.ComponentProps<typeof MilestonesMobileSection> = {
    milestones,
    projectById: new Map([[project.id, project]]),
    customerById: new Map([[customer.id, customer]]),
    search: '',
    onSearchChange: vi.fn(),
    canEdit: true,
    onOpenProject: vi.fn(),
    onEditMilestone: vi.fn(),
    onRequestDelete: vi.fn(),
    ...overrides,
  };
  return { ...render(<MilestonesMobileSection {...props} />), props };
};

describe('MilestonesMobileSection', () => {
  it('shows one timeline with past and future together', () => {
    renderSection();

    // No current/past switch: scrolling up is how you go back in time.
    expect(screen.queryByRole('button', { name: 'Past' })).not.toBeInTheDocument();
    expect(screen.getByText('Kickoff')).toBeInTheDocument();
    expect(screen.getByText('Launch')).toBeInTheDocument();
    // Months label the timeline so it stays readable while scrolling back.
    expect(screen.getByText('June 2020')).toBeInTheDocument();
  });

  it('opens a milestone with its actions behind the header menu', async () => {
    const user = userEvent.setup();
    const { props } = renderSection();

    await user.click(screen.getByText('Launch'));

    const detail = await screen.findByRole('dialog', { name: 'Launch' });
    expect(within(detail).getByText('Ship it')).toBeInTheDocument();
    expect(within(detail).getByText('Blue Orbit')).toBeInTheDocument();

    await user.click(within(detail).getByRole('button', { name: 'Milestone actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit milestone' }));

    expect(props.onEditMilestone).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'm-next' }),
    );
  });

  it('opens the project from inside the milestone', async () => {
    const user = userEvent.setup();
    const { props } = renderSection();

    await user.click(screen.getByText('Launch'));
    const detail = await screen.findByRole('dialog', { name: 'Launch' });
    await user.click(within(detail).getByRole('button', { name: 'Open project' }));

    expect(props.onOpenProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'm-next' }),
    );
  });
});
