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


describe("WidgetEditorDialog people's colours toggle", () => {
  const renderEditor = (widget: Partial<DashboardWidget> = {}, onSave = vi.fn()) => {
    render(
      <WidgetEditorDialog
        open
        onOpenChange={vi.fn()}
        statuses={[]}
        projects={[]}
        assignees={[{ id: 'active-1', name: 'Active User', isActive: true }]}
        groups={[]}
        initialWidget={buildChartWidget(widget)}
        onSave={onSave}
      />,
    );
    return onSave;
  };

  it('is on for a widget saved before the toggle existed', () => {
    renderEditor();

    expect(screen.getByRole('switch', { name: "People's colours" })).toHaveAttribute('aria-checked', 'true');
  });

  it('reads back the stored choice', () => {
    renderEditor({ useAssigneeColors: false });

    expect(screen.getByRole('switch', { name: "People's colours" })).toHaveAttribute('aria-checked', 'false');
  });

  it('only appears where people are actually shown', () => {
    renderEditor({ groupBy: 'project' });

    expect(screen.queryByRole('switch', { name: "People's colours" })).not.toBeInTheDocument();
  });

  it('idles the palette select while it is on, and frees it when off', async () => {
    const user = userEvent.setup();
    renderEditor();

    expect(screen.getByText("Not used while own colours are on.")).toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: "People's colours" }));

    expect(screen.queryByText("Not used while own colours are on.")).not.toBeInTheDocument();
  });

  it('saves the switched-off state on the widget', async () => {
    const user = userEvent.setup();
    const onSave = renderEditor();

    await user.click(screen.getByRole('switch', { name: "People's colours" }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ useAssigneeColors: false }));
  });
});


describe('WidgetEditorDialog entity colour toggles', () => {
  const renderEditor = (widget: Partial<DashboardWidget> = {}, onSave = vi.fn()) => {
    render(
      <WidgetEditorDialog
        open
        onOpenChange={vi.fn()}
        statuses={[]}
        projects={[]}
        assignees={[{ id: 'active-1', name: 'Active User', isActive: true }]}
        groups={[]}
        initialWidget={buildChartWidget(widget)}
        onSave={onSave}
      />,
    );
    return onSave;
  };

  it('offers the project toggle only for a project grouped widget', () => {
    renderEditor({ groupBy: 'project' });

    expect(screen.getByRole('switch', { name: 'Project colours' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('switch', { name: "People's colours" })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Status colours' })).not.toBeInTheDocument();
  });

  it('offers the status toggle only for a status grouped widget', () => {
    renderEditor({ groupBy: 'status' });

    expect(screen.getByRole('switch', { name: 'Status colours' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('switch', { name: 'Project colours' })).not.toBeInTheDocument();
  });

  it('idles the palette while project colours are on', async () => {
    const user = userEvent.setup();
    renderEditor({ groupBy: 'project' });

    expect(screen.getByText("Not used while own colours are on.")).toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: 'Project colours' }));

    expect(screen.queryByText("Not used while own colours are on.")).not.toBeInTheDocument();
  });

  it('saves the project choice on the widget', async () => {
    const user = userEvent.setup();
    const onSave = renderEditor({ groupBy: 'project' });

    await user.click(screen.getByRole('switch', { name: 'Project colours' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ useProjectColors: false }));
  });
});
