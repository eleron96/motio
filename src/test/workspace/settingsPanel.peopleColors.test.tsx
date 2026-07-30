import React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsPanel } from '@/features/workspace/components/SettingsPanel';
import { TooltipProvider } from '@/shared/ui/tooltip';
import { PERSON_PRESET_COLORS } from '@/shared/lib/colors';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

// A pickable stand-in for the popover: one button that reports the swatch it
// would apply, so a click through the UI reaches the store action.
vi.mock('@/shared/ui/color-picker', () => ({
  ColorPicker: ({
    onChange,
    disabled,
    presets,
    'aria-label': ariaLabel,
  }: {
    onChange: (color: string) => void;
    disabled?: boolean;
    presets?: readonly string[];
    'aria-label'?: string;
  }) => (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange((presets ?? [])[3])}
    >
      picker
    </button>
  ),
}));

vi.mock('@/shared/ui/emoji-picker', () => ({
  EmojiPicker: () => <div>Emoji picker</div>,
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
    assignees: [
      { id: 'a-me', name: 'Me', userId: 'user-1', isActive: true, email: null, phone: null, color: null },
      { id: 'a-mate', name: 'Teammate', userId: 'user-2', isActive: true, email: null, phone: null, color: '#a7ccf1' },
      { id: 'a-external', name: 'External', userId: null, isActive: true, email: null, phone: null, color: null },
      { id: 'a-gone', name: 'Disabled', userId: 'user-3', isActive: false, email: null, phone: null, color: null },
    ],
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
    updateWorkspaceHeatmapEnabled: vi.fn(async () => ({ error: undefined })),
    updateWorkspaceHeatmapCapacity: vi.fn(async () => ({ error: undefined })),
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

const openPeopleSection = async () => {
  const user = userEvent.setup();
  render(
    <TooltipProvider>
      <SettingsPanel open onOpenChange={() => {}} />
    </TooltipProvider>,
  );
  await user.click(screen.getByRole('button', { name: 'People' }));
  await screen.findByText('Colours');
  return user;
};

describe('SettingsPanel people colours', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.currentWorkspaceRole = 'admin';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ([]) })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists the active people and leaves disabled ones out', async () => {
    await openPeopleSection();

    expect(screen.getByText('Me')).toBeInTheDocument();
    expect(screen.getByText('Teammate')).toBeInTheDocument();
    expect(screen.getByText('External')).toBeInTheDocument();
    expect(screen.queryByText('Disabled')).not.toBeInTheDocument();
  });

  it('saves the picked colour for the chosen person', async () => {
    const user = await openPeopleSection();

    await user.click(screen.getByRole('button', { name: 'Colour of Teammate' }));

    expect(plannerState.setAssigneeColor).toHaveBeenCalledWith('a-mate', PERSON_PRESET_COLORS[3]);
  });

  it('resets a person back to the automatic palette', async () => {
    const user = await openPeopleSection();

    // Only the person who already has a colour offers the reset.
    const resets = screen.getAllByRole('button', { name: 'Auto' });
    expect(resets).toHaveLength(1);

    await user.click(resets[0]);

    expect(plannerState.setAssigneeColor).toHaveBeenCalledWith('a-mate', null);
  });

  it('lets a non-admin change only their own colour', async () => {
    authState.currentWorkspaceRole = 'editor';

    await openPeopleSection();

    expect(screen.getByRole('button', { name: 'Colour of Me' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Colour of Teammate' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Colour of External' })).toBeDisabled();
    expect(screen.getByText(
      'You can change your own colour. Only an admin can recolour the rest of the team.',
    )).toBeInTheDocument();
  });

  it('surfaces a failure from the server instead of pretending it saved', async () => {
    plannerState.setAssigneeColor.mockResolvedValueOnce({ error: 'Not allowed to change this colour' });
    const user = await openPeopleSection();

    await user.click(screen.getByRole('button', { name: 'Colour of Me' }));

    expect(await screen.findByText('Not allowed to change this colour')).toBeInTheDocument();
  });
});
