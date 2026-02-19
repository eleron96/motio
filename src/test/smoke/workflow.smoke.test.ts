import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  getUser: vi.fn(),
  invoke: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

const localeStoreMocks = vi.hoisted(() => ({
  setLocaleFromProfile: vi.fn(),
}));

vi.mock('@/shared/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      signInWithPassword: supabaseMocks.signInWithPassword,
      signUp: supabaseMocks.signUp,
      resetPasswordForEmail: supabaseMocks.resetPasswordForEmail,
      updateUser: supabaseMocks.updateUser,
      signOut: supabaseMocks.signOut,
      getUser: supabaseMocks.getUser,
    },
    functions: {
      invoke: supabaseMocks.invoke,
    },
    from: supabaseMocks.from,
    rpc: supabaseMocks.rpc,
  },
}));

vi.mock('@/shared/store/localeStore', () => ({
  useLocaleStore: {
    getState: () => ({
      setLocaleFromProfile: localeStoreMocks.setLocaleFromProfile,
    }),
  },
}));

import { useAuthStore } from '@/features/auth/store/authStore';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import type { Task } from '@/features/planner/types/planner';

const originalFetchMembers = useAuthStore.getState().fetchMembers;
const originalRefreshAssignees = usePlannerStore.getState().refreshAssignees;
const originalRefreshMemberGroups = usePlannerStore.getState().refreshMemberGroups;

const mockTaskInsert = (row: {
  id: string;
  workspace_id: string;
  title: string;
  project_id: string | null;
  assignee_id: string | null;
  assignee_ids: string[];
  start_date: string;
  end_date: string;
  status_id: string;
  type_id: string;
  priority: Task['priority'];
  tag_ids: string[];
  description: string | null;
  repeat_id: string | null;
}) => {
  const single = vi.fn().mockResolvedValue({ data: row, error: null });
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });

  supabaseMocks.from.mockImplementation((table: string) => {
    if (table === 'tasks') {
      return { insert };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return { insert, select, single };
};

beforeEach(() => {
  vi.clearAllMocks();
  if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.clear === 'function') {
    window.localStorage.clear();
  }

  usePlannerStore.getState().reset();
  useAuthStore.setState({
    currentWorkspaceId: null,
    session: null,
    user: null,
    members: [],
    fetchMembers: originalFetchMembers,
  });
  usePlannerStore.setState({
    refreshAssignees: originalRefreshAssignees,
    refreshMemberGroups: originalRefreshMemberGroups,
  });
});

describe('Smoke: key user workflows', () => {
  it('login: signs in with email/password', async () => {
    supabaseMocks.signInWithPassword.mockResolvedValue({ error: null });

    const result = await useAuthStore.getState().signIn('user@example.com', 'secret123');

    expect(result).toEqual({});
    expect(supabaseMocks.signInWithPassword).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'secret123',
    });
  });

  it('login: returns auth error message', async () => {
    supabaseMocks.signInWithPassword.mockResolvedValue({
      error: { message: 'Invalid login credentials' },
    });

    const result = await useAuthStore.getState().signIn('user@example.com', 'bad-pass');

    expect(result).toEqual({ error: 'Invalid login credentials' });
  });

  it('planner: creates a task for current workspace', async () => {
    usePlannerStore.setState({ workspaceId: 'ws-1' });

    const insertedRow = {
      id: 'task-1',
      workspace_id: 'ws-1',
      title: 'Smoke task',
      project_id: null,
      assignee_id: 'assignee-1',
      assignee_ids: ['assignee-1'],
      start_date: '2026-02-08',
      end_date: '2026-02-09',
      status_id: 'status-1',
      type_id: 'type-1',
      priority: 'medium' as const,
      tag_ids: ['tag-1'],
      description: 'Task from smoke test',
      repeat_id: null,
    };

    const { insert } = mockTaskInsert(insertedRow);

    const created = await usePlannerStore.getState().addTask({
      title: 'Smoke task',
      projectId: null,
      assigneeIds: ['assignee-1', 'assignee-1'],
      startDate: '2026-02-08',
      endDate: '2026-02-09',
      statusId: 'status-1',
      typeId: 'type-1',
      priority: 'medium',
      tagIds: ['tag-1'],
      description: 'Task from smoke test',
      repeatId: null,
    });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      workspace_id: 'ws-1',
      title: 'Smoke task',
      assignee_ids: [],
    }));
    expect(created?.id).toBe('task-1');
    expect(usePlannerStore.getState().tasks).toHaveLength(1);
  });

  it('invite: returns error when workspace is not selected', async () => {
    const result = await useAuthStore.getState().inviteMember('member@example.com', 'viewer');

    expect(result).toEqual({ error: 'Workspace not selected.' });
    expect(supabaseMocks.invoke).not.toHaveBeenCalled();
  });

  it('invite: sends pending invite link without mutating memberships immediately', async () => {
    useAuthStore.setState({
      currentWorkspaceId: 'ws-1',
    });

    supabaseMocks.invoke.mockResolvedValue({
      data: {
        success: true,
        inviteEmail: 'member@example.com',
        inviteStatus: 'pending',
      },
      error: null,
      response: undefined,
    });

    const result = await useAuthStore
      .getState()
      .inviteMember('member@example.com', 'editor', 'group-1');

    expect(result).toEqual({
      inviteEmail: 'member@example.com',
      inviteStatus: 'pending',
    });
    expect(supabaseMocks.invoke).toHaveBeenCalledWith('invite', {
      body: {
        action: 'create',
        workspaceId: 'ws-1',
        email: 'member@example.com',
        role: 'editor',
        groupId: 'group-1',
      },
    });
  });
});
