import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import type { Project } from '@/features/planner/types/planner';
import { ProjectsDialogs } from '@/features/projects/components/ProjectsDialogs';
import { ProjectCardHeader } from '@/features/projects/components/projectCard/ProjectCardHeader';
import { useProjectCreateForm } from '@/features/projects/hooks/useProjectCreateForm';
import { useProjectMutations } from '@/features/projects/hooks/useProjectMutations';
import { useIsMobile } from '@/shared/hooks/use-mobile';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

vi.mock('@/shared/hooks/use-mobile', () => ({
  useIsMobile: vi.fn(),
}));

// The dialogs file mounts several unrelated dialog trees; only the "create
// project" one matters here, so the neighbours are stubbed out.
vi.mock('@/features/workspace/components/WorkspaceCommonDialogs', () => ({
  WorkspaceCommonDialogs: () => null,
}));
vi.mock('@/features/planner/components/timeline/MilestoneDialog', () => ({
  MilestoneDialog: () => null,
}));
vi.mock('@/features/projects/components/ProjectTaskDetailsDialog', () => ({
  ProjectTaskDetailsDialog: () => null,
}));
vi.mock('@/features/projects/components/CustomerCombobox', () => ({
  CustomerCombobox: () => null,
}));

const useIsMobileMock = vi.mocked(useIsMobile);

const STATUS_PLACEHOLDER = 'E.g. В работе, Заморожен, Завершен';

const makeProject = (overrides: Partial<Project> = {}): Project => ({
  id: 'p1',
  name: 'Helsinki tower',
  code: 'HEL',
  color: '#3b82f6',
  archived: false,
  customerId: null,
  ownerGroupId: null,
  status: null,
  ...overrides,
});

const renderCreateDialog = (setNewProjectStatus: (value: string) => void) => {
  const props = {
    // Neighbouring dialogs stay closed, but their string props are still read
    // while rendering, so every one of them gets an inert default.
    canEdit: true,
    newCustomerName: '',
    editingCustomerName: '',
    editingCustomerIndustry: '',
    projectSettingsName: '',
    projectSettingsCode: '',
    projectSettingsColor: '#3b82f6',
    projectSettingsStatus: '',
    projectSettingsCustomerId: null,
    projectSettingsOwnerGroupId: null,
    projectSettingsTarget: null,
    deleteProjectLabel: '',
    deleteMilestoneLabel: '',
    deleteCustomerLabel: '',
    selectedTaskDescription: '',
    setNewCustomerName: vi.fn(),
    setEditingCustomerName: vi.fn(),
    setEditingCustomerIndustry: vi.fn(),
    setProjectSettingsName: vi.fn(),
    setProjectSettingsCode: vi.fn(),
    setProjectSettingsColor: vi.fn(),
    setProjectSettingsStatus: vi.fn(),
    setProjectSettingsCustomerId: vi.fn(),
    setProjectSettingsOwnerGroupId: vi.fn(),
    handleAddCustomerFromTab: vi.fn(),
    handleRenameCustomer: vi.fn(),
    handleSaveProjectSettings: vi.fn(),
    requestCloseRenameCustomer: vi.fn(),
    requestCloseProjectSettings: vi.fn(),
    cancelCustomerEdit: vi.fn(),
    handleConfirmDeleteProject: vi.fn(),
    handleConfirmDeleteMilestone: vi.fn(),
    handleConfirmDeleteCustomer: vi.fn(),
    setDeleteProjectTarget: vi.fn(),
    setDeleteMilestoneTarget: vi.fn(),
    setDeleteCustomerTarget: vi.fn(),
    setSelectedTaskId: vi.fn(),
    handleOpenTaskInTimeline: vi.fn(),
    createProjectOpen: true,
    setCreateProjectOpen: vi.fn(),
    requestCloseCreateProject: vi.fn(),
    newProjectName: 'Helsinki tower',
    setNewProjectName: vi.fn(),
    newProjectCode: '',
    setNewProjectCode: vi.fn(),
    newProjectColor: '#3b82f6',
    setNewProjectColor: vi.fn(),
    newProjectCustomerId: null,
    setNewProjectCustomerId: vi.fn(),
    newProjectOwnerGroupId: null,
    setNewProjectOwnerGroupId: vi.fn(),
    newProjectStatus: '',
    setNewProjectStatus,
    memberGroups: [],
    customers: [],
    createCustomerByName: vi.fn(),
    handleCreateProject: vi.fn(),
    statusById: new Map(),
    assigneeById: new Map(),
    taskTypeById: new Map(),
    selectedTaskTags: [],
  } as unknown as React.ComponentProps<typeof ProjectsDialogs>;

  return render(<ProjectsDialogs {...props} />);
};

describe('project status is stored in caps from every entry point', () => {
  beforeEach(() => {
    useIsMobileMock.mockReset();
  });

  it('caps what the user types in the create-project dialog', () => {
    const setNewProjectStatus = vi.fn();
    renderCreateDialog(setNewProjectStatus);

    const input = screen.getByPlaceholderText(STATUS_PLACEHOLDER);
    fireEvent.change(input, { target: { value: 'в работе' } });

    expect(setNewProjectStatus).toHaveBeenCalledWith('В РАБОТЕ');
    // Belt and braces: the field renders in caps too, like the settings one.
    expect(input.className).toContain('uppercase');
  });

  it('saves a capped status when a project is created', async () => {
    const addProject = vi.fn(async () => makeProject());
    const { result } = renderHook(() => useProjectCreateForm({
      canEdit: true,
      addProject,
      setEditingCustomerId: vi.fn(),
      setEditingCustomerName: vi.fn(),
    }));

    act(() => {
      result.current.setNewProjectName('Helsinki tower');
      // Bypasses the input's own casing — e.g. a paste handled elsewhere or a
      // future caller of the hook.
      result.current.setNewProjectStatus(' в работе ');
    });

    await act(async () => {
      await result.current.handleCreateProject();
    });

    expect(addProject).toHaveBeenCalledWith(expect.objectContaining({ status: 'В РАБОТЕ' }));
  });

  it('saves a capped status from the inline chip on desktop', async () => {
    useIsMobileMock.mockReturnValue(false);
    const onSaveStatus = vi.fn(async () => true);

    render(
      <ProjectCardHeader
        project={makeProject({ status: 'В РАБОТЕ' })}
        customer={null}
        canEdit
        isTracked={false}
        onToggleTracked={vi.fn()}
        onSaveStatus={onSaveStatus}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit project status: В РАБОТЕ' }));
    fireEvent.change(screen.getByPlaceholderText('Project status'), { target: { value: 'на паузе' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaveStatus).toHaveBeenCalledWith('НА ПАУЗЕ'));
  });

  it('saves a capped status from the mobile sheet', async () => {
    useIsMobileMock.mockReturnValue(true);
    const onSaveStatus = vi.fn(async () => true);

    render(
      <ProjectCardHeader
        project={makeProject({ status: 'В РАБОТЕ' })}
        customer={null}
        canEdit
        isTracked={false}
        onToggleTracked={vi.fn()}
        onSaveStatus={onSaveStatus}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit project status: В РАБОТЕ' }));
    const sheetInput = screen.getByPlaceholderText('Project status');
    fireEvent.change(sheetInput, { target: { value: 'заморожен' } });
    expect((sheetInput as HTMLInputElement).value).toBe('ЗАМОРОЖЕН');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaveStatus).toHaveBeenCalledWith('ЗАМОРОЖЕН'));
  });

  it('caps a legacy lower-case status when project settings are saved, without reading as an unsaved edit', async () => {
    const updateProject = vi.fn(async () => undefined);
    const legacy = makeProject({ status: 'в работе' });
    const { result } = renderHook(() => useProjectMutations({
      canEdit: true,
      updateProject,
      deleteProject: vi.fn(async () => undefined),
      setMutationError: vi.fn(),
    }));

    act(() => {
      result.current.openProjectSettings(legacy);
    });

    // Opening the dialog is not an edit — the draft is just the normalized
    // version of what is already stored.
    expect(result.current.projectSettingsStatus).toBe('В РАБОТЕ');
    expect(result.current.projectSettingsHasUnsavedChanges).toBe(false);

    await act(async () => {
      await result.current.handleSaveProjectSettings();
    });

    expect(updateProject).toHaveBeenCalledWith('p1', expect.objectContaining({ status: 'В РАБОТЕ' }));
  });
});
