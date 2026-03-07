import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspaceMembersPanel } from '@/features/workspace/components/WorkspaceMembersPanel';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const { authState, plannerState } = vi.hoisted(() => ({
  authState: {
    user: { id: 'user-1', email: 'niko@example.com' },
    workspaces: [{ id: 'workspace-1', ownerId: 'user-1', name: 'Team', holidayCountry: 'RU', role: 'admin' }],
    members: [
      { userId: 'user-1', email: 'niko@example.com', displayName: 'Niko', role: 'admin', groupId: 'group-1' },
      { userId: 'user-2', email: 'ivan@example.com', displayName: 'Ivan', role: 'viewer', groupId: null },
      { userId: 'user-3', email: 'anna@example.com', displayName: 'Anna', role: 'editor', groupId: null },
    ],
    membersLoading: false,
    fetchMembers: vi.fn(),
    inviteMember: vi.fn(async () => ({ inviteStatus: 'pending', inviteEmail: 'new@example.com' })),
    listSentInvites: vi.fn(async () => ({ invites: [] })),
    cancelSentInvite: vi.fn(async () => ({ error: undefined })),
    listWorkspaceMemberActivity: vi.fn(async () => ({
      entries: [{
        id: 'event-1',
        workspaceId: 'workspace-1',
        action: 'member_role_changed',
        actorUserId: 'user-1',
        actorLabel: 'Niko',
        targetUserId: 'user-2',
        targetLabel: 'Ivan',
        targetEmail: 'ivan@example.com',
        details: {
          previousRole: 'viewer',
          nextRole: 'editor',
        },
        createdAt: '2026-03-07T10:00:00.000Z',
      }],
    })),
    updateMemberRole: vi.fn(async () => ({ error: undefined })),
    updateMemberGroup: vi.fn(async () => ({ error: undefined })),
    removeMember: vi.fn(async () => ({ error: undefined })),
    currentWorkspaceId: 'workspace-1',
    currentWorkspaceRole: 'admin',
    profileDisplayName: 'Niko',
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
    fetchMemberGroups: vi.fn(async () => ({
      groups: [{ id: 'group-1', name: 'Design' }],
    })),
  },
}));

vi.mock('@/features/auth/store/authStore', () => ({
  useAuthStore: () => authState,
}));

vi.mock('@/features/planner/store/plannerStore', () => ({
  usePlannerStore: () => plannerState,
}));

describe('WorkspaceMembersPanel access tabs', () => {
  beforeEach(() => {
    authState.fetchMembers.mockClear();
    authState.listSentInvites.mockClear();
    authState.listWorkspaceMemberActivity.mockClear();
    plannerState.refreshAssignees.mockClear();
    plannerState.fetchMemberGroups.mockClear();
  });

  it('shows sidebar-style access views and filters active/disabled members', async () => {
    const user = userEvent.setup();

    render(<WorkspaceMembersPanel />);

    expect(screen.getByText('Team access')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Active 2' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Disabled 1' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search people...')).toBeInTheDocument();
    expect(await screen.findByText('anna@example.com')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'History 1' })).toBeInTheDocument();
    });
    expect(screen.queryByText('ivan@example.com')).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Search people...'), 'anna');
    expect(screen.getByText('anna@example.com')).toBeInTheDocument();
    expect(screen.queryByText('niko@example.com')).not.toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText('Search people...'));
    await user.click(screen.getByRole('tab', { name: 'Disabled 1' }));
    expect(await screen.findByText('ivan@example.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search people...')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Search people...'), 'zzz');
    expect(screen.getByText('No matches.')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'History 1' }));
    expect(await screen.findByText('Niko changed Ivan from viewer to editor.')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search people...')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(authState.listWorkspaceMemberActivity).toHaveBeenCalledWith({
        workspaceId: 'workspace-1',
        limit: 100,
      });
    });
  });
});
