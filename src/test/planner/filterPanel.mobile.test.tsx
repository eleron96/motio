import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const mocks = vi.hoisted(() => ({
  state: {
    projects: [
      { id: 'p1', name: 'Brand Refresh', code: 'BR', color: '#123456', archived: false },
      { id: 'p2', name: 'Data Migration', code: 'DM', color: '#654321', archived: false },
    ],
    trackedProjectIds: [] as string[],
    assignees: [{ id: 'a1', name: 'Anna', isActive: true }],
    memberGroups: [],
    statuses: [{ id: 's1', name: 'In progress', emoji: null, color: '#999999' }],
    taskTypes: [{ id: 't1', name: 'Task', icon: null }],
    tags: [{ id: 'g1', name: 'urgent', color: '#ff0000' }],
    viewMode: 'day',
    filters: {
      projectIds: [] as string[],
      assigneeIds: [] as string[],
      groupIds: [] as string[],
      statusIds: [] as string[],
      typeIds: [] as string[],
      tagIds: [] as string[],
      hideUnassigned: false,
    },
    setFilters: vi.fn(),
    clearFilterCriteria: vi.fn(),
  },
}));

vi.mock('@/features/planner/store/plannerStore', () => ({
  usePlannerStore: (selector: (state: unknown) => unknown) => selector(mocks.state),
}));

vi.mock('@/features/planner/hooks/useFilteredAssignees', () => ({
  useFilteredAssignees: (assignees: unknown[]) => assignees,
}));

import { FilterPanel } from '@/features/planner/components/FilterPanel';

describe('FilterPanel in phone mode', () => {
  beforeEach(() => {
    mocks.state.filters = {
      projectIds: [], assigneeIds: [], groupIds: [], statusIds: [], typeIds: [], tagIds: [],
      hideUnassigned: false,
    };
    mocks.state.setFilters.mockClear();
    mocks.state.clearFilterCriteria.mockClear();
  });

  const iconOnlyButtons = () => screen
    .queryAllByRole('button')
    .filter((button) => button.textContent === '');

  it('leaves the way back to the screen around it', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    // With a filter picked, so the phone's bar is on screen and could carry a
    // chevron — the shell's back arrow must still be the only one.
    mocks.state.filters = { ...mocks.state.filters, tagIds: ['g1'] };
    const { unmount } = render(<FilterPanel collapsed={false} onToggle={onToggle} touch />);

    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
    expect(iconOnlyButtons()).toHaveLength(0);
    unmount();

    render(<FilterPanel collapsed={false} onToggle={onToggle} />);
    const chevron = iconOnlyButtons();
    expect(chevron).toHaveLength(1);
    await user.click(chevron[0]);
    expect(onToggle).toHaveBeenCalled();
  });

  it('swaps the desktop title bar for a clear bar that appears only when it has something to say', () => {
    const first = render(<FilterPanel collapsed={false} onToggle={vi.fn()} touch />);
    expect(screen.queryByText('Filters')).not.toBeInTheDocument();
    expect(screen.queryByText('Filter applied')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
    first.unmount();

    mocks.state.filters = { ...mocks.state.filters, tagIds: ['g1'] };
    const second = render(<FilterPanel collapsed={false} onToggle={vi.fn()} touch />);
    expect(screen.getByText('Filter applied')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
    second.unmount();

    // Desktop keeps its own title, at every filter state.
    render(<FilterPanel collapsed={false} onToggle={vi.fn()} />);
    expect(screen.getByText('Filters')).toBeInTheDocument();
  });

  it('counts what is picked so a folded section does not hide its own state', () => {
    mocks.state.filters = { ...mocks.state.filters, projectIds: ['p1', 'p2'] };
    render(<FilterPanel collapsed={false} onToggle={vi.fn()} touch />);

    const projects = screen.getByRole('button', { name: /Projects/ });
    expect(within(projects).getByText('2')).toBeInTheDocument();
    // A section with a selection starts open, so the picks are visible at once.
    expect(projects).toHaveAttribute('aria-expanded', 'true');

    const people = screen.getByRole('button', { name: /People/ });
    expect(people).toHaveAttribute('aria-expanded', 'false');
    expect(within(people).queryByText('2')).not.toBeInTheDocument();
  });

  it('ticks a project through the store', async () => {
    const user = userEvent.setup();
    render(<FilterPanel collapsed={false} onToggle={vi.fn()} touch />);

    await user.click(screen.getByRole('button', { name: /Projects/ }));
    // The whole row is the target on a phone, not the 16px box inside it.
    await user.click(screen.getByText('Brand Refresh').closest('label') as HTMLElement);

    expect(mocks.state.setFilters).toHaveBeenCalledWith({ projectIds: ['p1'] });
  });

  it('clears everything from the bar', async () => {
    const user = userEvent.setup();
    mocks.state.filters = { ...mocks.state.filters, tagIds: ['g1'] };
    render(<FilterPanel collapsed={false} onToggle={vi.fn()} touch />);

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(mocks.state.clearFilterCriteria).toHaveBeenCalled();
  });
});
