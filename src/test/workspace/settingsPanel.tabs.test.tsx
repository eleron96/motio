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
    workspaceId: 'workspace-1',
    applyWorkspaceTemplate: vi.fn(async () => ({ error: undefined })),
  },
  authState: {
    workspaces: [{ id: 'workspace-1', name: 'Motio Team', holidayCountry: 'RU' }],
    currentWorkspaceId: 'workspace-1',
    currentWorkspaceRole: 'admin',
    updateWorkspaceName: vi.fn(async () => ({ error: undefined })),
    updateWorkspaceHolidayCountry: vi.fn(async () => ({ error: undefined })),
    deleteWorkspace: vi.fn(async () => ({ error: undefined })),
  },
}));

vi.mock('@/features/planner/store/plannerStore', () => ({
  usePlannerStore: () => plannerState,
}));

vi.mock('@/features/auth/store/authStore', () => ({
  useAuthStore: () => authState,
}));

describe('SettingsPanel tabs', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ([]),
    })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the shared segmented tab style and switches active top-level tab', async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider>
        <SettingsPanel open onOpenChange={() => {}} />
      </TooltipProvider>,
    );

    const tabList = screen.getByRole('tablist');
    const generalTab = screen.getByRole('tab', { name: 'General' });
    const workflowTab = screen.getByRole('tab', { name: 'Workflow' });

    expect(tabList).toHaveClass('grid', 'grid-cols-2');
    expect(generalTab).toHaveAttribute('data-state', 'active');
    expect(workflowTab).toHaveAttribute('data-state', 'inactive');

    await user.click(workflowTab);

    expect(generalTab).toHaveAttribute('data-state', 'inactive');
    expect(workflowTab).toHaveAttribute('data-state', 'active');
    expect(await screen.findByText('Statuses')).toBeInTheDocument();
  });
});
