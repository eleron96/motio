import React, { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useMembersPageMode } from '@/features/members/hooks/useMembersPageMode';

type Mode = 'tasks' | 'groups';

const ModeHarness = ({ workspaceId }: { workspaceId: string }) => {
  const [mode, setMode] = useState<Mode>('tasks');

  useMembersPageMode({
    mode,
    setMode,
    currentWorkspaceId: workspaceId,
    userId: 'user-1',
  });

  return <div data-testid="mode">{mode}</div>;
};

describe('useMembersPageMode', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('restores a mode this page still renders', () => {
    window.localStorage.setItem('members-mode-workspace-1', 'groups');

    render(<ModeHarness workspaceId="workspace-1" />);

    expect(screen.getByTestId('mode')).toHaveTextContent('groups');
  });

  it('rewrites the retired access mode instead of leaving a blank page', () => {
    // Access moved into workspace settings; anyone whose last visit ended there
    // still carries 'access' in storage.
    window.localStorage.setItem('members-mode-workspace-1', 'access');

    render(<ModeHarness workspaceId="workspace-1" />);

    expect(screen.getByTestId('mode')).toHaveTextContent('tasks');
    expect(window.localStorage.getItem('members-mode-workspace-1')).toBe('tasks');
  });
});
