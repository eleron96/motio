import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspaceAccessMobile } from '@/features/workspace/components/WorkspaceAccessMobile';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

vi.mock('@/features/demo/hooks/useIsDemo', () => ({
  useIsDemo: () => false,
}));

vi.mock('@/features/demo/providers/DemoConversionProvider', () => ({
  useDemoConversion: () => ({ open: vi.fn() }),
}));

vi.mock('@/features/workspace/components/WorkspacePeopleColors', () => ({
  WorkspacePeopleColors: () => <div>People colours</div>,
}));

const { authState, plannerState } = vi.hoisted(() => ({
  authState: {
    user: { id: 'user-1', email: 'niko@example.com' },
    workspaces: [{ id: 'workspace-1', ownerId: 'user-1', name: 'Team', holidayCountry: 'RU', role: 'admin' }],
    members: [
      { userId: 'user-1', email: 'niko@example.com', displayName: 'Niko', role: 'admin', groupId: 'group-1', status: 'ACTIVE', avatarUrl: null },
      { userId: 'user-2', email: 'ivan@example.com', displayName: 'Ivan', role: 'viewer', groupId: null, status: 'ACTIVE', avatarUrl: null },
      { userId: 'user-3', email: 'anna@example.com', displayName: 'Anna', role: 'editor', groupId: null, status: 'ACTIVE', avatarUrl: null },
    ],
    membersLoading: false,
    fetchMembers: vi.fn(),
    inviteMember: vi.fn(async () => ({ inviteStatus: 'pending', inviteEmail: 'new@example.com' })),
    listSentInvites: vi.fn(async () => ({
      invites: [{
        token: 'tok-1',
        workspaceId: 'workspace-1',
        email: 'pending@example.com',
        status: 'pending',
        isPending: true,
        createdAt: '2026-08-01T10:00:00.000Z',
      }],
    })),
    cancelSentInvite: vi.fn(async () => ({ error: undefined })),
    listWorkspaceMemberActivity: vi.fn(async () => ({ entries: [] })),
    updateMemberRole: vi.fn(async () => ({ error: undefined })),
    updateMemberGroup: vi.fn(async () => ({ error: undefined })),
    removeMember: vi.fn(async () => ({ error: undefined })),
    leaveWorkspace: vi.fn(async () => ({ error: undefined })),
    transferWorkspaceOwnership: vi.fn(async () => ({ error: undefined })),
    renamePurgedProfile: vi.fn(async () => ({ error: undefined })),
    currentWorkspaceId: 'workspace-1',
    currentWorkspaceRole: 'admin',
  },
  plannerState: {
    assignees: [
      { id: 'assignee-1', userId: 'user-1', name: 'Niko', isActive: true },
      { id: 'assignee-2', userId: 'user-2', name: 'Ivan', isActive: false },
      { id: 'assignee-3', userId: 'user-3', name: 'Anna', isActive: true },
    ],
    refreshAssignees: vi.fn(),
    updateAssignee: vi.fn(async () => ({ error: undefined })),
    setWorkspaceId: vi.fn(),
    fetchMemberGroups: vi.fn(async () => ({ groups: [{ id: 'group-1', name: 'Design' }] })),
  },
}));

vi.mock('@/features/auth/store/authStore', () => ({
  useAuthStore: () => authState,
}));

vi.mock('@/features/planner/store/plannerStore', () => ({
  usePlannerStore: () => plannerState,
}));

describe('WorkspaceAccessMobile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.currentWorkspaceRole = 'admin';
  });

  it('offers a menu instead of a strip of tabs', async () => {
    render(<WorkspaceAccessMobile />);

    expect(await screen.findByRole('button', { name: /Members/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Invites/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Access history/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Colours/ })).toBeInTheDocument();
  });

  it('walks from the list into a member and changes their role there', async () => {
    const user = userEvent.setup();

    render(<WorkspaceAccessMobile />);

    await user.click(await screen.findByRole('button', { name: /Members/ }));

    const list = await screen.findByRole('dialog');
    // A row is a name, not a form: role and group read as one quiet line.
    expect(within(list).getByText('Editor · No group')).toBeInTheDocument();

    await user.click(within(list).getByText('Anna'));

    const detail = await screen.findByRole('dialog', { name: 'Anna' });
    await user.click(within(detail).getByRole('button', { name: /Role/ }));

    const rolePicker = await screen.findByRole('dialog', { name: 'Role' });
    await user.click(within(rolePicker).getByRole('button', { name: 'Admin' }));

    expect(authState.updateMemberRole).toHaveBeenCalledWith('user-3', 'admin');
  });

  it('keeps disabled people behind their own tab', async () => {
    const user = userEvent.setup();

    render(<WorkspaceAccessMobile />);

    await user.click(await screen.findByRole('button', { name: /Members/ }));
    const list = await screen.findByRole('dialog');

    expect(within(list).getByText('Anna')).toBeInTheDocument();
    expect(within(list).queryByText('Ivan')).not.toBeInTheDocument();

    await user.click(within(list).getByRole('button', { name: /Disabled/ }));

    expect(within(list).getByText('Ivan')).toBeInTheDocument();
    expect(within(list).queryByText('Anna')).not.toBeInTheDocument();
  });

  it('sends an invite from a screen, not a popover', async () => {
    const user = userEvent.setup();

    render(<WorkspaceAccessMobile />);

    await user.click(await screen.findByRole('button', { name: /Invites/ }));

    const invites = await screen.findByRole('dialog', { name: 'Invites' });
    expect(await within(invites).findByText('pending@example.com')).toBeInTheDocument();

    await user.click(within(invites).getByRole('button', { name: 'Add member' }));

    const form = await screen.findByRole('dialog', { name: 'Add member' });
    await user.type(within(form).getByLabelText('Email'), 'new@example.com');
    await user.click(within(form).getByRole('button', { name: 'Send invite' }));

    expect(authState.inviteMember).toHaveBeenCalledWith('new@example.com', 'viewer', null);
  });

  it('shows a non-admin the colours only', () => {
    authState.currentWorkspaceRole = 'editor';

    render(<WorkspaceAccessMobile />);

    expect(screen.getByText('People colours')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Invites/ })).not.toBeInTheDocument();
  });
});
