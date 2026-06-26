import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Project } from '@/features/planner/types/planner';
import { useProjectsPageEffects } from '@/features/projects/hooks/useProjectsPageEffects';

const makeProject = (overrides: Partial<Project>): Project => ({
  id: 'project-id',
  name: 'Project',
  code: null,
  color: '#000000',
  archived: false,
  customerId: null,
  ownerGroupId: null,
  status: null,
  ...overrides,
});

type Args = Parameters<typeof useProjectsPageEffects>[0];

// Only the project-reconciliation effect (and the props it reads) matter here.
// Everything else gets inert defaults so the hook can run in isolation.
const renderEffects = (overrides: Partial<Args>) => {
  const setSelectedProjectId = vi.fn();
  const props: Args = {
    tab: 'active',
    activeProjects: [],
    archivedProjects: [],
    filteredActiveProjects: [],
    filteredArchivedProjects: [],
    selectedProjectId: null,
    setSelectedProjectId,
    selectedTaskId: null,
    setSelectedTaskId: vi.fn(),
    projectTasks: [],
    mode: 'projects',
    filteredCustomers: [],
    selectedCustomerId: null,
    setSelectedCustomerId: vi.fn(),
    visibleMilestones: [],
    selectedMilestoneId: null,
    setSelectedMilestoneId: vi.fn(),
    createProjectOpen: true,
    resetCreateProjectForm: vi.fn(),
    setCreateProjectConfirmOpen: vi.fn(),
    projectSettingsOpen: true,
    setProjectSettingsTarget: vi.fn(),
    setProjectSettingsConfirmOpen: vi.fn(),
    ...overrides,
  };
  renderHook(() => useProjectsPageEffects(props));
  return { setSelectedProjectId };
};

describe('useProjectsPageEffects — project reconciliation', () => {
  // The reported bug: opening a project from the Customers/Milestones tab sets
  // selectedProjectId to a project the team/customer filter hides, and the
  // effect used to bounce it back to the first filtered project. It must now
  // honor the explicit selection because the project still exists in the tab.
  it('keeps a selected project that is hidden by the filter but exists in the tab', () => {
    const p1 = makeProject({ id: 'p1', ownerGroupId: 'g1' });
    const p2 = makeProject({ id: 'p2', ownerGroupId: 'g2' });
    const { setSelectedProjectId } = renderEffects({
      activeProjects: [p1, p2],
      filteredActiveProjects: [p1], // team filter hides p2
      selectedProjectId: 'p2',
    });
    expect(setSelectedProjectId).not.toHaveBeenCalled();
  });

  // The early guard must run before the empty-filtered-list reset, so opening a
  // project still works even when the active filter matches nothing in the tab.
  it('keeps the selection when the filtered list is empty but the project exists', () => {
    const p2 = makeProject({ id: 'p2', ownerGroupId: 'g2' });
    const { setSelectedProjectId } = renderEffects({
      activeProjects: [p2],
      filteredActiveProjects: [], // filter matches nothing
      selectedProjectId: 'p2',
    });
    expect(setSelectedProjectId).not.toHaveBeenCalled();
  });

  it('auto-selects the first filtered project when nothing is selected', () => {
    const p1 = makeProject({ id: 'p1' });
    const { setSelectedProjectId } = renderEffects({
      activeProjects: [p1],
      filteredActiveProjects: [p1],
      selectedProjectId: null,
    });
    expect(setSelectedProjectId).toHaveBeenCalledWith('p1');
  });

  it('resets to the first filtered project when the selection no longer exists', () => {
    const p1 = makeProject({ id: 'p1' });
    const { setSelectedProjectId } = renderEffects({
      activeProjects: [p1],
      filteredActiveProjects: [p1],
      selectedProjectId: 'deleted',
    });
    expect(setSelectedProjectId).toHaveBeenCalledWith('p1');
  });

  it('clears the selection when no projects match in this tab', () => {
    const { setSelectedProjectId } = renderEffects({
      activeProjects: [],
      filteredActiveProjects: [],
      selectedProjectId: 'gone',
    });
    expect(setSelectedProjectId).toHaveBeenCalledWith(null);
  });

  // fullList is tab-scoped, so a selection living in the other tab is not
  // honored — the active tab still reconciles to its own first project.
  it('does not honor an archived selection while the active tab is shown', () => {
    const active = makeProject({ id: 'p1' });
    const archived = makeProject({ id: 'a1', archived: true });
    const { setSelectedProjectId } = renderEffects({
      tab: 'active',
      activeProjects: [active],
      archivedProjects: [archived],
      filteredActiveProjects: [active],
      selectedProjectId: 'a1',
    });
    expect(setSelectedProjectId).toHaveBeenCalledWith('p1');
  });
});
