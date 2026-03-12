import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) => (
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
  ),
}));

import { WidgetEditorDialog } from '@/features/dashboard/components/WidgetEditorDialog';
import type { DashboardWidget } from '@/features/dashboard/types/dashboard';

const buildChartWidget = (overrides: Partial<DashboardWidget> = {}): DashboardWidget => ({
  id: 'widget-1',
  title: 'Widget',
  type: 'bar',
  groupBy: 'assignee',
  period: 'week',
  statusFilter: 'all',
  statusIds: [],
  includeUnassigned: true,
  includeDisabledAssignees: false,
  filterGroups: [],
  ...overrides,
});

describe('WidgetEditorDialog disabled assignee toggle', () => {
  it('hides disabled assignees by default and reveals them when the toggle is enabled', async () => {
    const user = userEvent.setup();

    render(
      <WidgetEditorDialog
        open
        onOpenChange={vi.fn()}
        statuses={[]}
        projects={[]}
        assignees={[
          { id: 'active-1', name: 'Active User', isActive: true },
          { id: 'disabled-1', name: 'Disabled User', isActive: false },
        ]}
        groups={[]}
        initialWidget={buildChartWidget()}
        onSave={vi.fn()}
      />,
    );

    const showDisabledSwitch = screen.getByRole('switch', { name: 'Show disabled users' });
    expect(showDisabledSwitch).toHaveAttribute('aria-checked', 'false');

    await user.click(screen.getByRole('button', { name: 'Add group' }));

    let comboboxes = screen.getAllByRole('combobox');
    await user.click(comboboxes[comboboxes.length - 1]);

    expect(await screen.findByRole('option', { name: 'Active User' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Disabled User' })).not.toBeInTheDocument();

    await user.keyboard('{Escape}');
    await user.click(showDisabledSwitch);
    expect(showDisabledSwitch).toHaveAttribute('aria-checked', 'true');

    comboboxes = screen.getAllByRole('combobox');
    await user.click(comboboxes[comboboxes.length - 1]);

    expect(await screen.findByRole('option', { name: 'Disabled User' })).toBeInTheDocument();
  });

  it('hides the toggle and keeps all assignees available for By project widgets', async () => {
    const user = userEvent.setup();

    render(
      <WidgetEditorDialog
        open
        onOpenChange={vi.fn()}
        statuses={[]}
        projects={[]}
        assignees={[
          { id: 'active-1', name: 'Active User', isActive: true },
          { id: 'disabled-1', name: 'Disabled User', isActive: false },
        ]}
        groups={[]}
        initialWidget={buildChartWidget({ groupBy: 'project' })}
        onSave={vi.fn()}
      />,
    );

    expect(screen.queryByRole('switch', { name: 'Show disabled users' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add group' }));

    const comboboxes = screen.getAllByRole('combobox');
    await user.click(comboboxes[comboboxes.length - 1]);

    expect(await screen.findByRole('option', { name: 'Active User' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Disabled User' })).toBeInTheDocument();
  });
});
