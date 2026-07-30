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

const { plannerState, authState } = vi.hoisted(() => ({
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

describe('SettingsPanel sections', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ([]),
    })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the section navigation and switches the active section', async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider>
        <SettingsPanel open onOpenChange={() => {}} />
      </TooltipProvider>,
    );

    // General is the default section.
    const generalNav = screen.getByRole('button', { name: 'General' });
    expect(generalNav).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Workspace name')).toBeInTheDocument();

    // Switching to Workflow reveals the statuses block.
    await user.click(screen.getByRole('button', { name: 'Workflow' }));
    expect(await screen.findByText('Statuses')).toBeInTheDocument();
  });

  it('exposes the "Unassigned" toggle under the Display section', async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider>
        <SettingsPanel open onOpenChange={() => {}} />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Display' }));
    expect(await screen.findByText('Show tasks without an assignee')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Show unassigned' })).toBeInTheDocument();
  });

  it('offers Transfer ownership to the workspace owner under the Danger zone', async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider>
        <SettingsPanel open onOpenChange={() => {}} />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Danger zone' }));
    expect(await screen.findByRole('button', { name: 'Transfer ownership' })).toBeInTheDocument();
  });
});
