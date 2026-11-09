import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const { invoke, toastMock } = vi.hoisted(() => ({
  invoke: vi.fn(),
  toastMock: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock('@/infrastructure/auth/functionsGateway', () => ({ invokeAdminFunction: invoke }));
vi.mock('@/shared/ui/sonner', () => ({ toast: toastMock }));

import { AdminWorkspaceMembersDialog } from '@/features/admin/components/AdminWorkspaceMembersDialog';
import type { AdminWorkspace } from '@/features/admin/store/adminStore';

const workspace = {
  id: 'ws-north',
  name: 'North',
  ownerId: 'u-owner',
  ownerEmail: 'owner@example.com',
  ownerDisplayName: 'Olga',
  membersCount: 3,
  tasksCount: 0,
  createdAt: '2026-11-01T10:00:00Z',
} as unknown as AdminWorkspace;

const members = [
  { userId: 'u-owner', email: 'owner@example.com', displayName: 'Olga', role: 'admin', isOwner: true, viaGroup: false, joinedAt: null },
  { userId: 'u-anna', email: 'anna@example.com', displayName: 'Anna', role: 'viewer', isOwner: false, viaGroup: true, joinedAt: null },
  { userId: 'u-boris', email: 'boris@example.com', displayName: 'Boris', role: 'editor', isOwner: false, viaGroup: false, joinedAt: null },
];

describe('AdminWorkspaceMembersDialog', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => undefined);
    Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
    invoke.mockReset();
    toastMock.success.mockReset();
    toastMock.error.mockReset();
  });

  const renderDialog = (onChanged = vi.fn()) => {
    invoke.mockResolvedValueOnce({ data: { members } });
    render(
      <AdminWorkspaceMembersDialog workspace={workspace} onOpenChange={vi.fn()} onChanged={onChanged} />,
    );
    return onChanged;
  };

  it('lists the people with their roles, the owner and who came from a group', async () => {
    renderDialog();
    expect(await screen.findByText('Anna')).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith({ action: 'workspaces.members', workspaceId: 'ws-north' });
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('From a group')).toBeInTheDocument();
    // The owner has no role picker and no remove button.
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(2);
    expect(screen.queryByRole('combobox', { name: 'Role of Olga' })).not.toBeInTheDocument();
  });

  it('removes someone after a confirmation that warns about the group', async () => {
    const onChanged = renderDialog();
    const user = userEvent.setup();
    await screen.findByText('Anna');
    invoke.mockResolvedValueOnce({ data: { success: true, outcome: 'removed' } });

    const annaRow = screen.getByText('Anna').closest('li') as HTMLElement;
    await user.click(within(annaRow).getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText(/they come back at their next sign-in/)).toBeInTheDocument();
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(invoke).toHaveBeenLastCalledWith({
      action: 'workspaces.removeMember',
      workspaceId: 'ws-north',
      userId: 'u-anna',
    }));
    await waitFor(() => expect(screen.queryByText('Anna')).not.toBeInTheDocument());
    expect(onChanged).toHaveBeenCalled();
  });

  it('shows a refusal from the server', async () => {
    renderDialog();
    const user = userEvent.setup();
    await screen.findByText('Boris');
    invoke.mockResolvedValueOnce({ error: 'The owner cannot leave their workspace; delete the workspace instead.' });

    const borisRow = screen.getByText('Boris').closest('li') as HTMLElement;
    await user.click(within(borisRow).getByRole('button', { name: 'Remove' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(screen.getByText('Boris')).toBeInTheDocument();
  });
});
