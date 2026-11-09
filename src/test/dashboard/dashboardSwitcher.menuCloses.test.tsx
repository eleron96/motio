import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardSwitcher } from '@/features/dashboard/components/DashboardSwitcher';
import { DashboardManageDialogs } from '@/features/dashboard/components/DashboardManageDialogs';
import { useDashboardManageDialogs } from '@/features/dashboard/hooks/useDashboardManageDialogs';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

vi.mock('@/features/dashboard/store/dashboardStore', () => {
  const state = {
    createDashboard: vi.fn(async () => ({})),
    deleteDashboard: vi.fn(async () => undefined),
    renameDashboard: vi.fn(async () => ({})),
  };
  return {
    useDashboardStore: (selector: (value: typeof state) => unknown) => selector(state),
  };
});

const Harness = () => {
  const dialogs = useDashboardManageDialogs({
    currentWorkspaceId: 'workspace-1',
    currentDashboardId: 'dashboard-1',
    currentDashboardName: 'Team workload',
    canCreateDashboard: true,
  });
  return (
    <>
      <DashboardSwitcher
        dashboards={[{ id: 'dashboard-1', name: 'Team workload' }]}
        currentDashboardId="dashboard-1"
        currentDashboardName="Team workload"
        onSelectDashboard={vi.fn()}
        canEdit
        canCreateDashboard
        canDeleteDashboard
        dialogs={dialogs}
        workspaceId="workspace-1"
      />
      <DashboardManageDialogs
        dialogs={dialogs}
        canEdit
        canCreateDashboard
        canDeleteDashboard
        currentDashboardName="Team workload"
      />
    </>
  );
};

const cases = [
  { trigger: 'Dashboard settings', item: 'Rename dashboard', dialogRole: 'dialog' },
  { trigger: 'Dashboard settings', item: 'Delete dashboard', dialogRole: 'alertdialog' },
  { trigger: 'Team workload', item: 'New dashboard', dialogRole: 'dialog' },
] as const;

describe('DashboardSwitcher menus', () => {
  it.each(cases)('closes the menu when $item opens its dialog, and it stays closed after Cancel', async ({
    trigger,
    item,
    dialogRole,
  }) => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: trigger }));
    await user.click(await screen.findByRole('menuitem', { name: item }));

    const dialog = await screen.findByRole(dialogRole);
    // The open dialog hides everything behind it from the accessibility tree,
    // so look for the menu among hidden elements too.
    await waitFor(() => expect(screen.queryByRole('menu', { hidden: true })).not.toBeInTheDocument());

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole(dialogRole)).not.toBeInTheDocument());
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
