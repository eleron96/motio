import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspaceMembersSection } from '@/features/workspace/components/WorkspaceMembersSection';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

// The panel and the palette are covered by their own tests; here we only care
// about which of them the section shows and what it hands them.
vi.mock('@/features/workspace/components/WorkspaceMembersPanel', () => ({
  WorkspaceMembersPanel: ({ accessTab }: { accessTab: string }) => (
    <div data-testid="members-panel" data-tab={accessTab}>
      Members panel
    </div>
  ),
}));

vi.mock('@/features/workspace/components/WorkspacePeopleColors', () => ({
  WorkspacePeopleColors: () => <div data-testid="people-colors">People colours</div>,
}));

const { authState, plannerState } = vi.hoisted(() => ({
  authState: {
    members: [
      { userId: 'user-1', email: 'niko@example.com', displayName: 'Niko', role: 'admin', groupId: null, status: 'ACTIVE' },
      { userId: 'user-2', email: 'ivan@example.com', displayName: 'Ivan', role: 'viewer', groupId: null, status: 'ACTIVE' },
      { userId: 'user-3', email: 'anna@example.com', displayName: 'Anna', role: 'editor', groupId: null, status: 'ACTIVE' },
    ],
    currentWorkspaceRole: 'admin',
  },
  plannerState: {
    assignees: [
      { id: 'assignee-1', userId: 'user-1', name: 'Niko', isActive: true },
      { id: 'assignee-2', userId: 'user-2', name: 'Ivan', isActive: false },
      { id: 'assignee-3', userId: 'user-3', name: 'Anna', isActive: true },
    ],
  },
}));

vi.mock('@/features/auth/store/authStore', () => ({
  useAuthStore: () => authState,
}));

vi.mock('@/features/planner/store/plannerStore', () => ({
  usePlannerStore: () => plannerState,
}));

describe('WorkspaceMembersSection', () => {
  beforeEach(() => {
    authState.currentWorkspaceRole = 'admin';
  });

  it('counts each person in exactly one access bucket', () => {
    render(<WorkspaceMembersSection />);

    expect(screen.getByRole('button', { name: /Active/ })).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: /Disabled/ })).toHaveTextContent('1');
  });

  it('hands the chosen tab to the panel and swaps in the palette', async () => {
    const user = userEvent.setup();

    render(<WorkspaceMembersSection />);

    expect(screen.getByTestId('members-panel')).toHaveAttribute('data-tab', 'active');

    await user.click(screen.getByRole('button', { name: /Disabled/ }));
    expect(screen.getByTestId('members-panel')).toHaveAttribute('data-tab', 'disabled');

    await user.click(screen.getByRole('button', { name: /History/ }));
    expect(screen.getByTestId('members-panel')).toHaveAttribute('data-tab', 'history');

    await user.click(screen.getByRole('button', { name: /Colours/ }));
    expect(screen.getByTestId('people-colors')).toBeInTheDocument();
    expect(screen.queryByTestId('members-panel')).not.toBeInTheDocument();
  });

  it('shows a non-admin the colours only', () => {
    authState.currentWorkspaceRole = 'editor';

    render(<WorkspaceMembersSection />);

    expect(screen.getByTestId('people-colors')).toBeInTheDocument();
    expect(screen.queryByTestId('members-panel')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Active/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /History/ })).not.toBeInTheDocument();
  });
});
