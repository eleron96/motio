import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const { adminState, toastMock } = vi.hoisted(() => ({
  adminState: {
    loadPickablePeople: vi.fn(),
    addAdminWorkspaceMember: vi.fn(),
  },
  toastMock: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock('@/features/admin/store/adminStore', () => ({
  useAdminStore: (selector?: (s: typeof adminState) => unknown) =>
    (typeof selector === 'function' ? selector(adminState) : adminState),
}));

vi.mock('@/shared/ui/sonner', () => ({ toast: toastMock }));

import { AdminWorkspaceAddMemberDialog } from '@/features/admin/components/AdminWorkspaceAddMemberDialog';

const workspace = {
  id: 'ws-1',
  name: 'North',
  ownerId: 'owner-1',
  ownerEmail: 'owner@example.com',
  ownerDisplayName: 'Owner',
  membersCount: 1,
  tasksCount: 0,
  createdAt: null,
};

// The person picker comes first, the role select second. A combobox takes no
// name from its text, so it is found by position, as in the easter-egg tests.
const personPicker = async () => {
  await screen.findByText('Select user');
  return screen.getAllByRole('combobox')[0]!;
};

const pickAnna = async () => {
  fireEvent.click(await personPicker());
  fireEvent.click(await screen.findByRole('option', { name: /anna@example\.com/ }));
};

describe('AdminWorkspaceAddMemberDialog', () => {
  beforeEach(() => {
    adminState.loadPickablePeople.mockReset().mockResolvedValue({
      people: [{ id: 'user-anna', email: 'anna@example.com', displayName: 'Anna' }],
    });
    adminState.addAdminWorkspaceMember.mockReset();
    toastMock.success.mockReset();
    toastMock.info.mockReset();
  });

  it('adds the chosen person with the chosen role right away', async () => {
    adminState.addAdminWorkspaceMember.mockResolvedValue({ outcome: 'added' });
    const onAdded = vi.fn();
    const onOpenChange = vi.fn();
    render(<AdminWorkspaceAddMemberDialog workspace={workspace} onOpenChange={onOpenChange} onAdded={onAdded} />);

    expect(screen.getByText('Add member to North')).toBeInTheDocument();
    await pickAnna();
    fireEvent.click(screen.getByRole('button', { name: 'Add member' }));

    await waitFor(() => {
      expect(adminState.addAdminWorkspaceMember).toHaveBeenCalledWith('ws-1', 'user-anna', 'viewer');
    });
    expect(toastMock.success).toHaveBeenCalledWith('Anna was added to North.');
    expect(onAdded).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps the dialog open and explains the limit of five workspaces', async () => {
    adminState.addAdminWorkspaceMember.mockResolvedValue({ outcome: 'limit_reached' });
    const onAdded = vi.fn();
    const onOpenChange = vi.fn();
    render(<AdminWorkspaceAddMemberDialog workspace={workspace} onOpenChange={onOpenChange} onAdded={onAdded} />);

    await pickAnna();
    fireEvent.click(screen.getByRole('button', { name: 'Add member' }));

    expect(await screen.findByText('Anna is already in 5 workspaces, the most one account can join.')).toBeInTheDocument();
    expect(onAdded).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('says so when the person is already a member', async () => {
    adminState.addAdminWorkspaceMember.mockResolvedValue({ outcome: 'already_member' });
    const onAdded = vi.fn();
    render(<AdminWorkspaceAddMemberDialog workspace={workspace} onOpenChange={vi.fn()} onAdded={onAdded} />);

    await pickAnna();
    fireEvent.click(screen.getByRole('button', { name: 'Add member' }));

    await waitFor(() => {
      expect(toastMock.info).toHaveBeenCalledWith('Anna is already a member of North.');
    });
    expect(onAdded).not.toHaveBeenCalled();
  });

  it('cannot add before a person is chosen', async () => {
    render(<AdminWorkspaceAddMemberDialog workspace={workspace} onOpenChange={vi.fn()} onAdded={vi.fn()} />);

    await personPicker();
    expect(screen.getByRole('button', { name: 'Add member' })).toBeDisabled();
  });
});
