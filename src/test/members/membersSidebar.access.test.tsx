import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MembersSidebar } from '@/features/members/components/MembersSidebar';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const AccessSidebarHarness = () => {
  const [accessTab, setAccessTab] = useState<'active' | 'disabled' | 'history'>('active');
  const [accessSearch, setAccessSearch] = useState('');

  return (
    <MembersSidebar
      mode="access"
      onModeChange={vi.fn()}
      isAdmin
      tab="active"
      onTabChange={vi.fn()}
      accessTab={accessTab}
      onAccessTabChange={setAccessTab}
      accessSearch={accessSearch}
      onAccessSearchChange={setAccessSearch}
      activeAccessCount={2}
      disabledAccessCount={1}
      memberSearch=""
      onMemberSearchChange={vi.fn()}
      memberSort="asc"
      memberSortLabel="A-Z"
      onToggleMemberSort={vi.fn()}
      memberGroupBy="none"
      onToggleMemberGroupBy={vi.fn()}
      activeVisibleAssignees={[]}
      disabledVisibleAssignees={[]}
      activeMemberGroups={[]}
      disabledMemberGroups={[]}
      selectedAssigneeId={null}
      onSelectAssignee={vi.fn()}
      memberTaskCountsDate={null}
      memberTaskCounts={{}}
      groupSearch=""
      onGroupSearchChange={vi.fn()}
      groupSort="asc"
      groupSortLabel="A-Z"
      onToggleGroupSort={vi.fn()}
      groupsError=""
      creatingGroup={false}
      groupsLoading={false}
      sortedGroups={[]}
      selectedGroupId={null}
      onSelectGroup={vi.fn()}
      onStartEditGroup={vi.fn()}
      onDeleteGroup={vi.fn()}
    />
  );
};

describe('MembersSidebar access navigation', () => {
  it('renders access views in the left sidebar and hides search for history', async () => {
    const user = userEvent.setup();

    render(<AccessSidebarHarness />);

    expect(screen.getByRole('button', { name: /Active/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Disabled/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /History/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search people...')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Search people...'), 'anna');
    expect(screen.getByDisplayValue('anna')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /History/i }));
    expect(screen.queryByPlaceholderText('Search people...')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Disabled/i }));
    expect(screen.getByPlaceholderText('Search people...')).toBeInTheDocument();
    expect(screen.getByDisplayValue('anna')).toBeInTheDocument();
  });
});
