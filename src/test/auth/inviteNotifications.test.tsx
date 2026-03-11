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

vi.mock('@/features/planner/store/plannerStore', () => ({
  usePlannerStore: (selector?: (state: unknown) => unknown) => {
    const state = mocks.planner;
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

describe('InviteNotifications', () => {
  beforeEach(() => {
    let deletedAll = false;

    mocks.invoke.mockReset();
    mocks.removeChannel.mockClear();
    mocks.fetchWorkspaces.mockClear();
    mocks.setCurrentWorkspaceId.mockClear();
    mocks.acceptInvite.mockClear();
    Object.values(mocks.planner).forEach((fn) => fn.mockClear());

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
});
