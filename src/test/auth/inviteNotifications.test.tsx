import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/shared/ui/tooltip';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) => (
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
  ),
}));

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as typeof ResizeObserver;
}

if (typeof window.requestIdleCallback === 'undefined') {
  window.requestIdleCallback = (() => 1) as typeof window.requestIdleCallback;
}

if (typeof window.cancelIdleCallback === 'undefined') {
  window.cancelIdleCallback = (() => {}) as typeof window.cancelIdleCallback;
}

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  removeChannel: vi.fn(async () => ({})),
  fetchWorkspaces: vi.fn(async () => {}),
  setCurrentWorkspaceId: vi.fn(),
  acceptInvite: vi.fn(async () => ({ error: undefined })),
  planner: {
    setViewMode: vi.fn(),
    setCurrentDate: vi.fn(),
    requestScrollToDate: vi.fn(),
    clearFilters: vi.fn(),
    setSelectedTaskId: vi.fn(),
    setHighlightedTaskId: vi.fn(),
  },
  selectedTaskId: { current: null as string | null },
  highlightedTaskId: { current: null as string | null },
  peekedTaskId: { current: null as string | null },
  tasks: { current: [] as Array<{ id: string; repeatId: string | null }> },
}));

vi.mock('@/shared/lib/supabaseClient', () => ({
  supabase: {
    functions: {
      invoke: mocks.invoke,
    },
    channel: () => {
      const channel = {
        on: vi.fn(() => channel),
        subscribe: vi.fn(() => channel),
      };
      return channel;
    },
    removeChannel: mocks.removeChannel,
  },
}));

vi.mock('@/features/auth/store/authStore', () => ({
  useAuthStore: (selector?: (state: unknown) => unknown) => {
    const state = {
      user: { id: 'user-1' },
      currentWorkspaceId: 'workspace-1',
      fetchWorkspaces: mocks.fetchWorkspaces,
      setCurrentWorkspaceId: mocks.setCurrentWorkspaceId,
      acceptInvite: mocks.acceptInvite,
    };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

vi.mock('@/features/planner/store/plannerStore', () => {
  const plannerState = () => ({
    ...mocks.planner,
    selectedTaskId: mocks.selectedTaskId.current,
    highlightedTaskId: mocks.highlightedTaskId.current,
    peekedTaskId: mocks.peekedTaskId.current,
    tasks: mocks.tasks.current,
  });
  const usePlannerStore = (selector?: (state: unknown) => unknown) => {
    const state = plannerState();
    return typeof selector === 'function' ? selector(state) : state;
  };
  usePlannerStore.getState = plannerState;
  return { usePlannerStore };
});

describe('InviteNotifications', () => {
  beforeEach(() => {
    let deletedAll = false;

    mocks.invoke.mockReset();
    mocks.removeChannel.mockClear();
    mocks.fetchWorkspaces.mockClear();
    mocks.setCurrentWorkspaceId.mockClear();
    mocks.acceptInvite.mockClear();
    Object.values(mocks.planner).forEach((fn) => fn.mockClear());
    mocks.selectedTaskId.current = null;
    mocks.highlightedTaskId.current = null;
    mocks.peekedTaskId.current = null;
    mocks.tasks.current = [];

    mocks.invoke.mockImplementation(async (name: string, options?: { body?: { action?: string } }) => {
      if (name === 'inbox') {
        return {
          data: {
            invites: [],
            sentInvites: [],
            notifications: deletedAll
              ? []
              : [
                {
                  id: 'n-1',
                  type: 'task_assigned',
                  workspaceId: 'workspace-1',
                  workspaceName: 'Workspace',
                  actorUserId: 'user-2',
                  actorDisplayName: 'Anna',
                  actorEmail: 'anna@example.com',
                  taskId: 'task-1',
                  taskTitle: 'Task A',
                  taskStartDate: '2026-03-11',
                  taskExists: true,
                  commentId: null,
                  commentPreview: null,
                  createdAt: '2026-03-11T10:00:00.000Z',
                  readAt: null,
                },
                {
                  id: 'n-2',
                  type: 'comment_mention',
                  workspaceId: 'workspace-1',
                  workspaceName: 'Workspace',
                  actorUserId: 'user-3',
                  actorDisplayName: 'Boris',
                  actorEmail: 'boris@example.com',
                  taskId: 'task-2',
                  taskTitle: 'Task B',
                  taskStartDate: '2026-03-11',
                  taskExists: true,
                  commentId: 'comment-1',
                  commentPreview: 'Check this',
                  createdAt: '2026-03-11T11:00:00.000Z',
                  readAt: null,
                },
              ],
          },
          error: null,
          response: new Response(),
        };
      }

      if (name === 'notifications' && options?.body?.action === 'deleteAll') {
        deletedAll = true;
        return {
          data: { success: true, updated: 2 },
          error: null,
          response: new Response(),
        };
      }

      return {
        data: { success: true },
        error: null,
        response: new Response(),
      };
    });
  });

  it('bulk deletes task notifications from the dropdown', async () => {
    const user = userEvent.setup();
    const { InviteNotifications } = await import('@/features/auth/components/InviteNotifications');

    render(
      <TooltipProvider>
        <MemoryRouter>
          <InviteNotifications />
        </MemoryRouter>
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Notifications' }));

    expect(await screen.findByText('Task updates')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Delete all' })).toBeInTheDocument();
    expect(screen.getByText('Task A')).toBeInTheDocument();
    expect(screen.getByText('Task B')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete all' }));

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith('notifications', {
        body: { action: 'deleteAll' },
      });
    });

    await waitFor(() => {
      expect(screen.queryByText('Task A')).not.toBeInTheDocument();
      expect(screen.queryByText('Task B')).not.toBeInTheDocument();
    });

    expect(screen.getByText('No notifications.')).toBeInTheDocument();
  });

  it('reads the notifications of a task whose card is open', async () => {
    const user = userEvent.setup();
    mocks.selectedTaskId.current = 'task-1';
    // The server remembers the read, as the real one does.
    let task1ReadAt: string | null = null;
    const listImplementation = mocks.invoke.getMockImplementation()!;
    mocks.invoke.mockImplementation(async (name: string, options?: { body?: { action?: string; taskId?: string } }) => {
      if (name === 'notifications' && options?.body?.action === 'markTaskRead') {
        task1ReadAt = '2026-10-13T12:00:00.000Z';
        return { data: { success: true, updated: 1 }, error: null, response: new Response() };
      }
      const result = await listImplementation(name, options);
      if (name === 'inbox' && task1ReadAt) {
        result.data.notifications = result.data.notifications.map((n: { taskId: string }) => (
          n.taskId === 'task-1' ? { ...n, readAt: task1ReadAt } : n
        ));
      }
      return result;
    });
    const { InviteNotifications } = await import('@/features/auth/components/InviteNotifications');

    render(
      <TooltipProvider>
        <MemoryRouter>
          <InviteNotifications />
        </MemoryRouter>
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Notifications' }));

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith('notifications', {
        body: { action: 'markTaskRead', taskId: 'task-1' },
      });
    });
    // Only Task B is still unread.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Mark as read \(1\)/ })).toBeInTheDocument();
    });
    expect(mocks.invoke).not.toHaveBeenCalledWith('notifications', {
      body: { action: 'markTaskRead', taskId: 'task-2' },
    });
    const markTaskReadCalls = mocks.invoke.mock.calls.filter(
      ([name, options]) => name === 'notifications' && options?.body?.action === 'markTaskRead',
    );
    expect(markTaskReadCalls).toHaveLength(1);
  });

  it('asks the server only once even if a refetch still shows the row unread', async () => {
    const user = userEvent.setup();
    mocks.selectedTaskId.current = 'task-1';
    const { InviteNotifications } = await import('@/features/auth/components/InviteNotifications');

    render(
      <TooltipProvider>
        <MemoryRouter>
          <InviteNotifications />
        </MemoryRouter>
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith('notifications', {
        body: { action: 'markTaskRead', taskId: 'task-1' },
      });
    });
    // The mock server never stores the read: the refetch brings the row back
    // unread, and the feed must not loop on it.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Mark as read \(2\)/ })).toBeInTheDocument();
    });
    const markTaskReadCalls = mocks.invoke.mock.calls.filter(
      ([name, options]) => name === 'notifications' && options?.body?.action === 'markTaskRead',
    );
    expect(markTaskReadCalls).toHaveLength(1);
  });

  const renderBellAndOpen = async () => {
    const user = userEvent.setup();
    const { InviteNotifications } = await import('@/features/auth/components/InviteNotifications');
    render(
      <TooltipProvider>
        <MemoryRouter>
          <InviteNotifications />
        </MemoryRouter>
      </TooltipProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Notifications' }));
  };

  it('reads the notifications of a task highlighted by a push jump', async () => {
    mocks.highlightedTaskId.current = 'task-1';
    await renderBellAndOpen();
    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith('notifications', {
        body: { action: 'markTaskRead', taskId: 'task-1' },
      });
    });
  });

  it('reads the notifications of a task previewed by a tap on a phone', async () => {
    mocks.peekedTaskId.current = 'task-2';
    await renderBellAndOpen();
    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith('notifications', {
        body: { action: 'markTaskRead', taskId: 'task-2' },
      });
    });
    expect(mocks.invoke).not.toHaveBeenCalledWith('notifications', {
      body: { action: 'markTaskRead', taskId: 'task-1' },
    });
  });

  it('reads a series notification when another occurrence of the series is open', async () => {
    mocks.tasks.current = [
      { id: 'task-1', repeatId: 'series-1' },
      { id: 'task-1-next', repeatId: 'series-1' },
    ];
    mocks.selectedTaskId.current = 'task-1-next';
    await renderBellAndOpen();
    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith('notifications', {
        body: { action: 'markTaskRead', taskId: 'task-1' },
      });
    });
  });

  it('asks nothing of the server while no open task has unread notifications', async () => {
    const user = userEvent.setup();
    mocks.selectedTaskId.current = 'task-without-notifications';
    const { InviteNotifications } = await import('@/features/auth/components/InviteNotifications');

    render(
      <TooltipProvider>
        <MemoryRouter>
          <InviteNotifications />
        </MemoryRouter>
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(await screen.findByRole('button', { name: 'Mark as read (2)' })).toBeInTheDocument();
    const markTaskReadCalls = mocks.invoke.mock.calls.filter(
      ([name, options]) => name === 'notifications' && options?.body?.action === 'markTaskRead',
    );
    expect(markTaskReadCalls).toHaveLength(0);
  });

  it('accents unread rows and leaves read ones plain', async () => {
    const user = userEvent.setup();
    mocks.invoke.mockImplementation(async (name: string) => {
      if (name === 'inbox') {
        return {
          data: {
            invites: [],
            sentInvites: [],
            notifications: [
              {
                id: 'n-unread',
                type: 'task_assigned',
                workspaceId: 'workspace-1',
                workspaceName: 'Workspace',
                actorUserId: 'user-2',
                actorDisplayName: 'Anna',
                actorEmail: 'anna@example.com',
                taskId: 'task-1',
                taskTitle: 'Fresh task',
                taskStartDate: '2026-03-11',
                taskExists: true,
                commentId: null,
                commentPreview: null,
                createdAt: '2026-03-11T10:00:00.000Z',
                readAt: null,
              },
              {
                id: 'n-read',
                type: 'task_assigned',
                workspaceId: 'workspace-1',
                workspaceName: 'Workspace',
                actorUserId: 'user-2',
                actorDisplayName: 'Anna',
                actorEmail: 'anna@example.com',
                taskId: 'task-2',
                taskTitle: 'Seen task',
                taskStartDate: '2026-03-11',
                taskExists: true,
                commentId: null,
                commentPreview: null,
                createdAt: '2026-03-10T10:00:00.000Z',
                readAt: '2026-03-10T12:00:00.000Z',
              },
            ],
          },
          error: null,
          response: new Response(),
        };
      }
      return { data: { success: true }, error: null, response: new Response() };
    });

    const { InviteNotifications } = await import('@/features/auth/components/InviteNotifications');

    render(
      <TooltipProvider>
        <MemoryRouter>
          <InviteNotifications />
        </MemoryRouter>
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Notifications' }));

    const unreadCard = (await screen.findByText('Fresh task')).closest('[role="button"]');
    const readCard = screen.getByText('Seen task').closest('[role="button"]');

    expect(unreadCard?.className).toContain('bg-primary/10');
    expect(unreadCard?.textContent).toContain('Unread');
    expect(readCard?.className).not.toContain('bg-primary/10');
    expect(readCard?.textContent).not.toContain('Unread');
  });
});
