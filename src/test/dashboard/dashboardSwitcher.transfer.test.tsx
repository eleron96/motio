import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardSwitcher } from '@/features/dashboard/components/DashboardSwitcher';
import type { DashboardManageDialogs } from '@/features/dashboard/hooks/useDashboardManageDialogs';
import { useInstanceSettingsStore } from '@/shared/store/instanceSettingsStore';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const { state, toastMock } = vi.hoisted(() => ({
  state: {
    dashboards: [{ id: 'd1', name: 'Weekly' }],
    currentDashboardId: 'd1',
    widgets: [{ id: 'w1', type: 'kpi', title: 'Open', period: 'week', statusFilter: 'all' }],
    layouts: { lg: [{ i: 'w1', x: 0, y: 0, w: 3, h: 2 }] },
    statuses: [],
    projects: [],
    assignees: [],
    groups: [],
    createDashboardFrom: vi.fn(),
  },
  toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/features/dashboard/store/dashboardStore', () => ({
  useDashboardStore: (selector: (value: typeof state) => unknown) => selector(state),
}));
vi.mock('@/shared/ui/sonner', () => ({ toast: toastMock }));

const dialogs = {
  openCreateDialog: vi.fn(),
  openRenameDialog: vi.fn(),
  openDeleteDialog: vi.fn(),
} as unknown as DashboardManageDialogs;

const renderSwitcher = () => render(
  <DashboardSwitcher
    dashboards={state.dashboards}
    currentDashboardId="d1"
    currentDashboardName="Weekly"
    onSelectDashboard={vi.fn()}
    canEdit
    canCreateDashboard
    canDeleteDashboard
    dialogs={dialogs}
    workspaceId="ws-1"
  />,
);

const setTransfer = (on: boolean) => useInstanceSettingsStore.setState((current) => ({
  values: { ...current.values, 'dashboards.transfer': on },
}));

describe('DashboardSwitcher: copy, export and import (dashboards.transfer)', () => {
  beforeEach(() => {
    state.createDashboardFrom.mockReset().mockResolvedValue({ id: 'd2', name: 'Weekly (2)' });
    toastMock.success.mockReset();
  });

  it('shows the gear menu as before while the setting is off', async () => {
    setTransfer(false);
    const user = userEvent.setup();
    renderSwitcher();
    await user.click(screen.getByRole('button', { name: 'Dashboard settings' }));
    expect(screen.getByRole('menuitem', { name: 'Rename dashboard' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Duplicate/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Export/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
  });

  it('duplicates the dashboard on screen when the setting is on', async () => {
    setTransfer(true);
    const user = userEvent.setup();
    renderSwitcher();
    await user.click(screen.getByRole('button', { name: 'Dashboard settings' }));
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate dashboard' }));
    await waitFor(() => expect(state.createDashboardFrom).toHaveBeenCalledWith('ws-1', {
      name: 'Weekly',
      widgets: state.widgets,
      layouts: state.layouts,
    }));
    expect(toastMock.success).toHaveBeenCalledWith('Copied as Weekly (2).');
  });
});
