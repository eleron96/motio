import React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsPanel } from '@/features/workspace/components/SettingsPanel';
import { TooltipProvider } from '@/shared/ui/tooltip';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

vi.mock('@/shared/ui/color-picker', () => ({
  ColorPicker: () => <div>Color picker</div>,
}));

vi.mock('@/shared/ui/emoji-picker', () => ({
  EmojiPicker: ({ onSelect }: { onSelect?: (value: string) => void }) => (
    <button type="button" onClick={() => onSelect?.('')}>Emoji picker</button>
  ),
}));

vi.mock('@/features/workspace/components/WorkspaceMembersPanel', () => ({
  WorkspaceMembersPanel: () => <div>Members panel</div>,
}));

const { plannerState, authState, flags, repo } = vi.hoisted(() => ({
  flags: { workspaceApi: false },
  repo: {
    listWorkspaceApiTokens: vi.fn(async () => ({
      tokens: [{ id: 't-1', name: 'HR sync', tokenPrefix: 'motio_1a2b3c4d', createdAt: '2026-10-01T10:00:00Z', lastUsedAt: null }],
    })),
    createWorkspaceApiToken: vi.fn(async (_workspaceId: string, name: string) => ({
      token: { id: 't-2', name, tokenPrefix: 'motio_9f8e7d6c', createdAt: '2026-10-28T10:00:00Z', lastUsedAt: null, token: `motio_9f8e7d6c${'0'.repeat(56)}` },
    })),
    revokeWorkspaceApiToken: vi.fn(async () => ({})),
  },
  plannerState: {
    statuses: [],
    addStatus: vi.fn(),
    updateStatus: vi.fn(),
    deleteStatus: vi.fn(),
    taskTypes: [],
    addTaskType: vi.fn(),
    updateTaskType: vi.fn(),
    deleteTaskType: vi.fn(),
    tags: [],
    addTag: vi.fn(),
    updateTag: vi.fn(),
    deleteTag: vi.fn(),
    assignees: [],
    setAssigneeColor: vi.fn(async () => ({})),
    workspaceId: 'workspace-1',
    applyWorkspaceTemplate: vi.fn(async () => ({ error: undefined })),
    filters: { hideUnassigned: false },
    setFilters: vi.fn(),
  },
  authState: {
    user: { id: 'user-1' },
    workspaces: [{ id: 'workspace-1', name: 'Motio Team', holidayCountry: 'RU', ownerId: 'user-1' }],
    members: [],
    fetchMembers: vi.fn(),
    currentWorkspaceId: 'workspace-1',
    currentWorkspaceRole: 'admin',
    updateWorkspaceName: vi.fn(async () => ({ error: undefined })),
    updateWorkspaceHolidayCountry: vi.fn(async () => ({ error: undefined })),
    deleteWorkspace: vi.fn(async () => ({ error: undefined })),
    transferWorkspaceOwnership: vi.fn(async () => ({ error: undefined })),
  },
}));

vi.mock('@/features/planner/store/plannerStore', () => ({
  usePlannerStore: () => plannerState,
}));

vi.mock('@/features/auth/store/authStore', () => ({
  useAuthStore: () => authState,
}));

vi.mock('@/shared/lib/featureFlags', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/featureFlags')>()),
  isWorkspaceApiEnabled: () => flags.workspaceApi,
}));

vi.mock('@/infrastructure/workspace/apiTokenRepository', () => repo);

const renderPanel = () => render(
  <TooltipProvider>
    <SettingsPanel open onOpenChange={() => {}} />
  </TooltipProvider>,
);

describe('SettingsPanel API section', () => {
  beforeEach(() => {
    flags.workspaceApi = false;
    authState.currentWorkspaceRole = 'admin';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ([]) })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is not there while the flag is off', () => {
    renderPanel();
    expect(screen.queryByRole('button', { name: 'API' })).not.toBeInTheDocument();
  });

  it('is not there for people who are not admins', () => {
    flags.workspaceApi = true;
    authState.currentWorkspaceRole = 'editor';
    renderPanel();
    expect(screen.queryByRole('button', { name: 'API' })).not.toBeInTheDocument();
  });

  it('lists tokens and shows a new one exactly once', async () => {
    flags.workspaceApi = true;
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'API' }));
    expect(await screen.findByText('HR sync')).toBeInTheDocument();
    expect(screen.getByText('motio_1a2b3c4d…')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Create token' })[0]);
    await user.type(screen.getByLabelText('Name'), 'Time tracking');
    await user.click(screen.getAllByRole('button', { name: 'Create token' }).at(-1)!);

    expect(repo.createWorkspaceApiToken).toHaveBeenCalledWith('workspace-1', 'Time tracking');
    expect(await screen.findByText('Copy your token now')).toBeInTheDocument();
    expect(screen.getByText(`motio_9f8e7d6c${'0'.repeat(56)}`)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText(`motio_9f8e7d6c${'0'.repeat(56)}`)).not.toBeInTheDocument();
    expect(screen.getByText('Time tracking')).toBeInTheDocument();
  });
});
