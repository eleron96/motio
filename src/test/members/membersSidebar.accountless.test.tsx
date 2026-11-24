import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MembersSidebar } from '@/features/members/components/MembersSidebar';
import type { Assignee } from '@/features/planner/types/planner';
import type { AccountlessRowActions } from '@/features/members/lib/accountlessRowActions';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

// People without an account on the Team page (server setting
// people.withoutAccount). The list gets the `accountless` prop only while the
// setting is on; without it the page must look exactly as it always did.

const member: Assignee = { id: 'a-member', name: 'Anna Becker', userId: 'user-1', isActive: true, email: null, phone: null };
const byName: Assignee = { id: 'a-name', name: 'Van 2', userId: null, isActive: true, email: null, phone: null };
const sample: Assignee = { id: 'a-sample', name: 'Sample Colleague', userId: null, isActive: true, email: null, phone: null, isSample: true };

const renderSidebar = (accountless?: AccountlessRowActions, isAdmin = true) => {
  const people = [member, byName, sample];
  return render(
    <MembersSidebar
      mode="tasks"
      onModeChange={vi.fn()}
      isAdmin={isAdmin}
      tab="active"
      onTabChange={vi.fn()}
      memberSearch=""
      onMemberSearchChange={vi.fn()}
      memberSort="asc"
      memberSortLabel="A-Z"
      onToggleMemberSort={vi.fn()}
      memberGroupBy="none"
      onToggleMemberGroupBy={vi.fn()}
      activeVisibleAssignees={people}
      disabledVisibleAssignees={[]}
      activeMemberGroups={[{ id: 'all', name: null, members: people }]}
      disabledMemberGroups={[]}
      selectedAssigneeId={null}
      onSelectAssignee={vi.fn()}
      memberTaskCountsDate={null}
      memberTaskCounts={{}}
      groupIdByUserId={new Map()}
      groupNameById={new Map()}
      onAssignAssigneeGroup={vi.fn()}
      onClearAssigneeGroup={vi.fn()}
      groupActionLoading={false}
      groupSearch=""
      onGroupSearchChange={vi.fn()}
      groupSort="asc"
      groupSortLabel="A-Z"
      onToggleGroupSort={vi.fn()}
      groupsError=""
      creatingGroup={false}
      groupsLoading={false}
      sortedGroups={[]}
      groupMarkColorById={new Map()}
      selectedGroupId={null}
      onSelectGroup={vi.fn()}
      onStartEditGroup={vi.fn()}
      onDeleteGroup={vi.fn()}
      accountless={accountless}
    />,
  );
};

const actions = (canManage: boolean): AccountlessRowActions => ({
  canManage,
  onEdit: vi.fn(),
  onInvite: vi.fn(),
  onSetActive: vi.fn(),
});

describe('MembersSidebar: people without an account', () => {
  it('with the setting off shows no caption and no menu on such a row', () => {
    renderSidebar(undefined);
    expect(screen.queryByText('No account')).toBeNull();
    expect(screen.queryByTestId('assignee-actions-a-name')).toBeNull();
    // The member's own menu is untouched.
    expect(screen.getByTestId('assignee-actions-a-member')).toBeTruthy();
  });

  it('marks a person added by name, and not a member or a sample colleague', () => {
    renderSidebar(actions(true));
    expect(screen.getAllByText('No account')).toHaveLength(1);
    expect(screen.queryByTestId('assignee-actions-a-sample')).toBeNull();
  });

  it('lets an admin edit, invite and disable the person', async () => {
    const rowActions = actions(true);
    renderSidebar(rowActions);
    const user = userEvent.setup();

    await user.click(screen.getByTestId('assignee-actions-a-name'));
    await user.click(await screen.findByText('Invite to Motio'));
    expect(rowActions.onInvite).toHaveBeenCalledWith(byName);

    await user.click(screen.getByTestId('assignee-actions-a-name'));
    await user.click(await screen.findByText('Edit'));
    expect(rowActions.onEdit).toHaveBeenCalledWith(byName);

    await user.click(screen.getByTestId('assignee-actions-a-name'));
    await user.click(await screen.findByText('Disable'));
    expect(rowActions.onSetActive).toHaveBeenCalledWith(byName, false);
  });

  it('shows the caption to everyone but the menu only to admins', () => {
    renderSidebar(actions(false), false);
    expect(screen.getByText('No account')).toBeTruthy();
    expect(screen.queryByTestId('assignee-actions-a-name')).toBeNull();
  });
});
