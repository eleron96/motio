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

    const { container } = render(
      <TaskCommentSection
        taskId="task-1"
        workspaceId="workspace-1"
        canEdit
      />,
    );

    await waitFor(() => {
      expect(mocks.repo.fetchTaskComments).toHaveBeenCalledWith('workspace-1', 'task-1');
    });

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1024,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 768,
    });
    Object.defineProperty(window, 'scrollX', {
      configurable: true,
      value: 120,
    });
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 400,
    });

    const editor = container.querySelector('[contenteditable="true"]');
    const mentionButton = screen.getByTitle('Mention a person');
    expect(editor).not.toBeNull();
    expect(mentionButton).not.toBeNull();

    if (!(editor instanceof HTMLDivElement)) {
      throw new Error('Expected HTMLDivElement editor');
    }

    vi.spyOn(editor, 'getBoundingClientRect').mockReturnValue({
      x: 920,
      y: 720,
      top: 720,
      left: 920,
      bottom: 740,
      right: 960,
      width: 40,
      height: 20,
      toJSON: () => ({}),
    } as DOMRect);

    vi.spyOn(mentionButton, 'getBoundingClientRect').mockReturnValue({
      x: 120,
      y: 220,
      top: 220,
      left: 120,
      bottom: 244,
      right: 144,
      width: 24,
      height: 24,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent.click(mentionButton);

    expect(await screen.findByText('Anna')).toBeVisible();

    await waitFor(() => {
      const popover = screen.getByText('Anna').closest('[data-mention-popover="true"]');
      expect(popover).not.toBeNull();
      expect(document.body.contains(popover)).toBe(true);
      expect(container.contains(popover)).toBe(false);
      expect(popover).toHaveAttribute('data-placement', 'below');
      expect(popover).toHaveStyle({
        top: '248px',
        left: '120px',
      });
    });
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

  it('opens the mention picker when the caret is inside an element node after typing @', async () => {
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

    const { container } = render(
      <TaskCommentSection
        taskId="task-1"
        workspaceId="workspace-1"
        canEdit
      />,
    );

    const editor = container.querySelector('[contenteditable="true"]');
    expect(editor).not.toBeNull();

    if (!(editor instanceof HTMLDivElement)) {
      throw new Error('Expected HTMLDivElement editor');
    }

    vi.spyOn(editor, 'getBoundingClientRect').mockReturnValue({
      x: 140,
      y: 200,
      top: 200,
      left: 140,
      bottom: 224,
      right: 300,
      width: 160,
      height: 24,
      toJSON: () => ({}),
    } as DOMRect);

    editor.innerHTML = '<div>@</div>';
    const line = editor.firstElementChild;
    expect(line).not.toBeNull();

    const selection = window.getSelection();
    expect(selection).not.toBeNull();
    const range = document.createRange();
    range.setStart(line!, 1);
    range.collapse(true);
    selection!.removeAllRanges();
    selection!.addRange(range);

    fireEvent.input(editor);

    expect(await screen.findByText('Anna')).toBeVisible();
  });

  it('inserts the selected member when a mention candidate is clicked', async () => {
    mocks.authState.membersWorkspaceId = 'workspace-1';
    mocks.authState.members = [
      {
        userId: 'user-2',
        email: 'anna@example.com',
        displayName: 'Anna',
        role: 'viewer',
        groupId: null,
      },
      {
        userId: 'user-3',
        email: 'boris@example.com',
        displayName: 'Boris',
        role: 'viewer',
        groupId: null,
      },
    ];

    const { container } = render(
      <TaskCommentSection
        taskId="task-1"
        workspaceId="workspace-1"
        canEdit
      />,
    );

    const editor = container.querySelector('[contenteditable="true"]');
    expect(editor).not.toBeNull();

    if (!(editor instanceof HTMLDivElement)) {
      throw new Error('Expected HTMLDivElement editor');
    }

    vi.spyOn(editor, 'getBoundingClientRect').mockReturnValue({
      x: 140,
      y: 200,
      top: 200,
      left: 140,
      bottom: 224,
      right: 300,
      width: 160,
      height: 24,
      toJSON: () => ({}),
    } as DOMRect);

    editor.textContent = '@';

    const selection = window.getSelection();
    expect(selection).not.toBeNull();
    const range = document.createRange();
    range.setStart(editor.firstChild!, 1);
    range.collapse(true);
    selection!.removeAllRanges();
    selection!.addRange(range);

    fireEvent.input(editor);

    const annaOption = (await screen.findByText('Anna')).closest('button');
    expect(annaOption).not.toBeNull();

    selection!.removeAllRanges();
    fireEvent.mouseDown(annaOption!);

    expect(document.execCommand).toHaveBeenCalledWith(
      'insertHTML',
      false,
      expect.stringContaining('data-mention-user-id="user-2"'),
    );
    expect(document.execCommand).toHaveBeenCalledWith(
      'insertHTML',
      false,
      expect.stringContaining('@Anna'),
    );
  });

  it('keeps the mention picker open when the user scrolls the member list', async () => {
    mocks.authState.membersWorkspaceId = 'workspace-1';
    mocks.authState.members = Array.from({ length: 18 }, (_, index) => ({
      userId: `user-${index + 2}`,
      email: `user-${index + 2}@example.com`,
      displayName: `User ${index + 2}`,
      role: 'viewer' as const,
      groupId: null,
    }));

    render(
      <TaskCommentSection
        taskId="task-1"
        workspaceId="workspace-1"
        canEdit
      />,
    );

    const mentionButton = screen.getByTitle('Mention a person');
    vi.spyOn(mentionButton, 'getBoundingClientRect').mockReturnValue({
      x: 120,
      y: 220,
      top: 220,
      left: 120,
      bottom: 244,
      right: 144,
      width: 24,
      height: 24,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent.click(mentionButton);

    expect(await screen.findByText('User 2')).toBeVisible();

    const options = screen.getByText('User 2').closest('[data-mention-options="true"]');
    expect(options).not.toBeNull();

    const windowWheelListener = vi.fn();
    window.addEventListener('wheel', windowWheelListener);

    fireEvent.wheel(options!, { deltaY: 120 });
    options!.dispatchEvent(new Event('scroll', { bubbles: true }));

    await waitFor(() => {
      expect(screen.getByText('Select a member')).toBeVisible();
      expect(screen.getByText('User 2')).toBeVisible();
    });

    expect(windowWheelListener).not.toHaveBeenCalled();
    window.removeEventListener('wheel', windowWheelListener);
  });

  it('highlights the hovered member in the mention picker', async () => {
    mocks.authState.membersWorkspaceId = 'workspace-1';
    mocks.authState.members = [
      {
        userId: 'user-2',
        email: 'anna@example.com',
        displayName: 'Anna',
        role: 'viewer',
        groupId: null,
      },
      {
        userId: 'user-3',
        email: 'boris@example.com',
        displayName: 'Boris',
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

    const mentionButton = screen.getByTitle('Mention a person');
    vi.spyOn(mentionButton, 'getBoundingClientRect').mockReturnValue({
      x: 120,
      y: 220,
      top: 220,
      left: 120,
      bottom: 244,
      right: 144,
      width: 24,
      height: 24,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent.click(mentionButton);

    const annaOption = (await screen.findByText('Anna')).closest('button');
    const borisOption = screen.getByText('Boris').closest('button');
    expect(annaOption).not.toBeNull();
    expect(borisOption).not.toBeNull();
    expect(annaOption).toHaveClass('bg-accent');

    fireEvent.mouseEnter(borisOption!);

    expect(borisOption).toHaveClass('bg-accent');
    expect(annaOption).not.toHaveClass('bg-accent');
  });
});
