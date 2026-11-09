import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const { repo, toastMock } = vi.hoisted(() => ({
  repo: {
    listWorkspaceClosures: vi.fn(),
    createWorkspaceClosure: vi.fn(),
    updateWorkspaceClosure: vi.fn(),
    deleteWorkspaceClosure: vi.fn(),
  },
  toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/infrastructure/workspace/workspaceClosuresRepository', () => repo);
vi.mock('@/shared/ui/sonner', () => ({ toast: toastMock }));

import { WorkspaceClosuresSettings } from '@/features/workspace/components/WorkspaceClosuresSettings';
import { useWorkspaceClosuresStore } from '@/features/planner/store/workspaceClosuresStore';

describe('WorkspaceClosuresSettings', () => {
  beforeEach(() => {
    useWorkspaceClosuresStore.setState({ byWorkspace: {}, loading: {} });
    repo.listWorkspaceClosures.mockReset().mockResolvedValue({
      closures: [{ id: 'c1', name: 'Inventory', startDate: '2099-07-01', endDate: '2099-07-02' }],
    });
    repo.createWorkspaceClosure.mockReset().mockImplementation(async (_ws: string, input: { name: string; startDate: string; endDate: string }) => ({
      closure: { id: 'c2', ...input },
    }));
    repo.deleteWorkspaceClosure.mockReset().mockResolvedValue({});
    toastMock.success.mockReset();
  });

  it('lists the days off and lets an admin add one; a single day needs only the first date', async () => {
    const user = userEvent.setup();
    render(<WorkspaceClosuresSettings workspaceId="ws-1" isAdmin />);
    expect(await screen.findByText('Inventory')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Name'), 'Winter closure');
    await user.type(screen.getByLabelText('First day'), '2099-12-24');
    await user.click(screen.getByRole('button', { name: 'Add days off' }));

    await waitFor(() => expect(repo.createWorkspaceClosure).toHaveBeenCalledWith('ws-1', {
      name: 'Winter closure',
      startDate: '2099-12-24',
      endDate: '2099-12-24',
    }));
    expect(await screen.findByText('Winter closure')).toBeInTheDocument();
  });

  it('explains what is wrong instead of saving', async () => {
    const user = userEvent.setup();
    render(<WorkspaceClosuresSettings workspaceId="ws-1" isAdmin />);
    await screen.findByText('Inventory');
    await user.click(screen.getByRole('button', { name: 'Add days off' }));
    expect(screen.getByText(/Give the days off a name/)).toBeInTheDocument();
    expect(repo.createWorkspaceClosure).not.toHaveBeenCalled();
  });

  it('deletes after a confirmation', async () => {
    const user = userEvent.setup();
    render(<WorkspaceClosuresSettings workspaceId="ws-1" isAdmin />);
    await screen.findByText('Inventory');
    await user.click(screen.getByRole('button', { name: 'Delete Inventory' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(repo.deleteWorkspaceClosure).toHaveBeenCalledWith('ws-1', 'c1'));
    await waitFor(() => expect(screen.queryByText('Inventory')).not.toBeInTheDocument());
  });

  it('only shows the list to people who are not admins', async () => {
    render(<WorkspaceClosuresSettings workspaceId="ws-1" isAdmin={false} />);
    expect(await screen.findByText('Inventory')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add days off' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Inventory' })).not.toBeInTheDocument();
  });
});
