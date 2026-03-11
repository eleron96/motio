import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) => (
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
  ),
}));

const mocks = vi.hoisted(() => ({
  authState: {
    user: { id: 'user-1', email: 'niko@example.com' },
    profileDisplayName: 'Niko',
    currentWorkspaceRole: 'admin',
    members: [] as Array<{
      userId: string;
      email: string;
      displayName: string | null;
      role: 'admin' | 'editor' | 'viewer';
      groupId: string | null;
    }>,
    membersWorkspaceId: null as string | null,
    membersLoading: false,
    fetchMembers: vi.fn(),
  },
  plannerState: {
    taskCommentCounts: {},
    adjustTaskCommentCount: vi.fn(),
    refreshTaskCommentCounts: vi.fn(async () => ({})),
  },
  repo: {
    fetchTaskComments: vi.fn(async () => ({
      data: { comments: [], nextCursor: null },
    })),
    createTaskComment: vi.fn(),
    deleteTaskComment: vi.fn(),
    updateTaskComment: vi.fn(),
    extractMentionedUserIds: vi.fn(() => []),
    getCommentPlainLength: vi.fn((value: string) => value.length),
    sanitizeCommentHtml: vi.fn((value: string) => value),
  },
}));

vi.mock('@/features/auth/store/authStore', () => ({
  useAuthStore: (selector: (state: typeof mocks.authState) => unknown) => selector(mocks.authState),
}));

vi.mock('@/features/planner/store/plannerStore', () => ({
  usePlannerStore: (selector: (state: typeof mocks.plannerState) => unknown) => selector(mocks.plannerState),
}));

vi.mock('@/shared/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
    },
  },
}));

vi.mock('@/infrastructure/tasks/taskCommentsRepository', () => ({
  COMMENT_MAX_PLAIN_LENGTH: 1000,
  fetchTaskComments: mocks.repo.fetchTaskComments,
  createTaskComment: mocks.repo.createTaskComment,
  deleteTaskComment: mocks.repo.deleteTaskComment,
  updateTaskComment: mocks.repo.updateTaskComment,
  extractMentionedUserIds: mocks.repo.extractMentionedUserIds,
  getCommentPlainLength: mocks.repo.getCommentPlainLength,
  sanitizeCommentHtml: mocks.repo.sanitizeCommentHtml,
}));

import { TaskCommentSection } from '@/features/planner/components/TaskCommentSection';

describe('TaskCommentSection mentions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authState.members = [];
    mocks.authState.membersWorkspaceId = null;
    mocks.authState.membersLoading = false;
    if (typeof document.execCommand !== 'function') {
      document.execCommand = vi.fn(() => true) as typeof document.execCommand;
    } else {
      vi.spyOn(document, 'execCommand').mockImplementation(() => true);
    }
  });

  it('shows a visible mention picker with workspace members when the toolbar button is clicked', async () => {
    mocks.authState.membersWorkspaceId = 'workspace-1';
    mocks.authState.members = [
      {
        userId: 'user-2',
        email: 'anna@example.com',
        displayName: 'Anna',
        role: 'viewer',
        groupId: null,
      },
    ];

    render(
      <TaskCommentSection
        taskId="task-1"
        workspaceId="workspace-1"
        canEdit
      />,
    );

    await waitFor(() => {
      expect(mocks.repo.fetchTaskComments).toHaveBeenCalledWith('workspace-1', 'task-1');
    });

    fireEvent.click(screen.getByTitle('Mention a person'));

    expect(await screen.findByText('Anna')).toBeVisible();
  });

  it('requests workspace members when the current mention cache belongs to another workspace', async () => {
    mocks.authState.membersWorkspaceId = null;

    render(
      <TaskCommentSection
        taskId="task-1"
        workspaceId="workspace-1"
        canEdit
      />,
    );

    await waitFor(() => {
      expect(mocks.authState.fetchMembers).toHaveBeenCalledWith('workspace-1');
    });
  });
});
