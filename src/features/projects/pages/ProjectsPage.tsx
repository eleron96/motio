import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { ProjectsSidebar } from '@/features/projects/components/ProjectsSidebar';
import { ProjectCardSidebar } from '@/features/projects/components/projectCard/ProjectCardSidebar';
import { isProjectCardEnabled } from '@/shared/lib/featureFlags';
import { ProjectsDialogs } from '@/features/projects/components/ProjectsDialogs';
import { ProjectsMainPanel } from '@/features/projects/components/ProjectsMainPanel';
import { useProjectsViewPreferences } from '@/features/projects/hooks/useProjectsViewPreferences';
import { useProjectsPageEffects } from '@/features/projects/hooks/useProjectsPageEffects';
import { useProjectTasksQuery } from '@/features/projects/hooks/useProjectTasksQuery';
import { usePlannerLookupMaps } from '@/features/planner/hooks/usePlannerLookupMaps';
import { useDisplayTaskRows } from '@/features/planner/hooks/useDisplayTaskRows';
import { useTaskScopeFilter } from '@/features/planner/hooks/useTaskScopeFilter';
import { useProjectsFilter } from '@/features/projects/hooks/useProjectsFilter';
import { useProjectSelection } from '@/features/projects/hooks/useProjectSelection';
import { useMilestoneActions } from '@/features/projects/hooks/useMilestoneActions';
import { useProjectMutations } from '@/features/projects/hooks/useProjectMutations';
import { useCustomerActions } from '@/features/projects/hooks/useCustomerActions';
import { useProjectCreateForm } from '@/features/projects/hooks/useProjectCreateForm';
import { WorkspacePageHeader } from '@/features/workspace/components/WorkspacePageHeader';
import { Button } from '@/shared/ui/button';
import { t } from '@lingui/macro';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/shared/ui/resizable';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { sortProjectsByTracking } from '@/shared/lib/projectSorting';
import { format, parseISO } from 'date-fns';
import {
  Plus,
} from 'lucide-react';
import { Assignee, Customer, Milestone, Project, Task } from '@/features/planner/types/planner';
import { useLocaleStore } from '@/shared/store/localeStore';
import { resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';
import {
  buildCustomerProjectCounts,
  filterCustomersBySearch,
  groupProjectsForSidebar,
  sortCustomersByName,
} from '@/features/projects/lib/projectsSelectors';
import { usePageSeo } from '@/shared/lib/seo/usePageSeo';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { MobilePageSheetLayout } from '@/shared/ui/mobile-page-sheet-layout';
import { MobilePillSubnav, type MobilePillSubnavItem } from '@/shared/ui/mobile-pill-subnav';
import { useOnboardingTour } from '@/features/onboarding/hooks/useOnboardingTour';

const ProjectsPage = () => {
  usePageSeo({
    title: 'Motio — Projects',
    description: 'Private projects workspace in Motio.',
    canonicalPath: '/app/projects',
    robots: 'noindex, nofollow',
  });

  const [showSettings, setShowSettings] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState('');
  const [search, setSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [assigneeFilterIds, setAssigneeFilterIds] = useState<string[]>([]);
  const {
    taskScope, setTaskScope,
    pastFromDate, setPastFromDate,
    pastToDate, setPastToDate,
    pastSort, setPastSort,
    pageIndex, setPageIndex,
    statusFilterIds, setStatusFilterIds,
  } = useTaskScopeFilter();
  const [mode, setMode] = useState<'projects' | 'milestones' | 'customers'>('projects');
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const isMobile = useIsMobile();
  const pageSize = 100;

  const {
    projects,
    milestones,
    trackedProjectIds,
    customers,
    customerContacts,
    projectMembers: projectMemberRows,
    projectActivity,
    memberGroups,
    statuses,
    assignees,
    taskTypes,
    tags,
    loadWorkspaceData,
    addProject,
    addCustomer,
    updateProject,
    updateCustomer,
    deleteCustomer,
    addCustomerContact,
    deleteCustomerContact,
    addProjectMember,
    deleteProjectMember,
    updateProjectMember,
    addProjectActivity,
    updateProjectActivity,
    deleteProjectActivity,
    updateAssignee,
    deleteProject,
    deleteMilestone,
    toggleTrackedProject,
    setHighlightedTaskId,
    setViewMode,
    setCurrentDate,
    requestScrollToDate,
    clearFilters,
  } = usePlannerStore(useShallow((state) => ({
    projects: state.projects,
    milestones: state.milestones,
    trackedProjectIds: state.trackedProjectIds,
    customers: state.customers,
    customerContacts: state.customerContacts,
    projectMembers: state.projectMembers,
    projectActivity: state.projectActivity,
    memberGroups: state.memberGroups,
    statuses: state.statuses,
    assignees: state.assignees,
    taskTypes: state.taskTypes,
    tags: state.tags,
    loadWorkspaceData: state.loadWorkspaceData,
    addProject: state.addProject,
    addCustomer: state.addCustomer,
    updateProject: state.updateProject,
    updateCustomer: state.updateCustomer,
    deleteCustomer: state.deleteCustomer,
    addCustomerContact: state.addCustomerContact,
    deleteCustomerContact: state.deleteCustomerContact,
    addProjectMember: state.addProjectMember,
    deleteProjectMember: state.deleteProjectMember,
    updateProjectMember: state.updateProjectMember,
    addProjectActivity: state.addProjectActivity,
    updateProjectActivity: state.updateProjectActivity,
    deleteProjectActivity: state.deleteProjectActivity,
    updateAssignee: state.updateAssignee,
    deleteProject: state.deleteProject,
    deleteMilestone: state.deleteMilestone,
    toggleTrackedProject: state.toggleTrackedProject,
    setHighlightedTaskId: state.setHighlightedTaskId,
    setViewMode: state.setViewMode,
    setCurrentDate: state.setCurrentDate,
    requestScrollToDate: state.requestScrollToDate,
    clearFilters: state.clearFilters,
  })));

  const {
    user,
    currentWorkspaceId,
    currentWorkspaceRole,
    isSuperAdmin,
  } = useAuthStore(useShallow((state) => ({
    user: state.user,
    currentWorkspaceId: state.currentWorkspaceId,
    currentWorkspaceRole: state.currentWorkspaceRole,
    isSuperAdmin: state.isSuperAdmin,
  })));

  const locale = useLocaleStore((state) => state.locale);
  const dateLocale = useMemo(() => resolveDateFnsLocale(locale), [locale]);
  const canEdit = currentWorkspaceRole === 'editor' || currentWorkspaceRole === 'admin';
  const {
    nameSort,
    setNameSort,
    groupByCustomer,
    setGroupByCustomer,
    milestoneTab,
    setMilestoneTab,
    milestoneGroupBy,
    setMilestoneGroupBy,
  } = useProjectsViewPreferences({
    currentWorkspaceId,
    userId: user?.id,
  });

  useEffect(() => {
    if (currentWorkspaceId) {
      loadWorkspaceData(currentWorkspaceId);
    }
  }, [currentWorkspaceId, loadWorkspaceData]);

  const {
    projectSettingsOpen, setProjectSettingsOpen,
    projectSettingsTarget, setProjectSettingsTarget,
    projectSettingsName, setProjectSettingsName,
    projectSettingsCode, setProjectSettingsCode,
    projectSettingsColor, setProjectSettingsColor,
    projectSettingsCustomerId, setProjectSettingsCustomerId,
    projectSettingsOwnerGroupId, setProjectSettingsOwnerGroupId,
    projectSettingsConfirmOpen, setProjectSettingsConfirmOpen,
    deleteProjectTarget, setDeleteProjectTarget,
    deleteProjectOpen, setDeleteProjectOpen,
    openProjectSettings,
    handleSaveProjectSettings,
    requestCloseProjectSettings,
    requestDeleteProject,
    handleConfirmDeleteProject,
    handleToggleProjectArchived,
  } = useProjectMutations({ canEdit, updateProject, deleteProject, setMutationError });

  const {
    newCustomerName, setNewCustomerName,
    createCustomerOpen, setCreateCustomerOpen,
    editingCustomerId, setEditingCustomerId,
    editingCustomerName, setEditingCustomerName,
    editingCustomerIndustry, setEditingCustomerIndustry,
    editingCustomerOriginalName,
    renameCustomerOpen, setRenameCustomerOpen,
    renameCustomerConfirmOpen, setRenameCustomerConfirmOpen,
    deleteCustomerTarget, setDeleteCustomerTarget,
    deleteCustomerOpen, setDeleteCustomerOpen,
    createCustomerByName,
    handleAddCustomerFromTab,
    startCustomerEdit,
    cancelCustomerEdit,
    handleRenameCustomer,
    requestCloseRenameCustomer,
    requestDeleteCustomer,
    handleConfirmDeleteCustomer,
  } = useCustomerActions({
    canEdit,
    customers,
    selectedCustomerId,
    setSelectedCustomerId,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    setMutationError,
  });

  const {
    createProjectOpen, setCreateProjectOpen,
    createProjectConfirmOpen, setCreateProjectConfirmOpen,
    newProjectName, setNewProjectName,
    newProjectCode, setNewProjectCode,
    newProjectColor, setNewProjectColor,
    newProjectCustomerId, setNewProjectCustomerId,
    newProjectOwnerGroupId, setNewProjectOwnerGroupId,
    resetCreateProjectForm,
    handleCreateProject,
    requestCloseCreateProject,
  } = useProjectCreateForm({
    canEdit,
    addProject,
    setEditingCustomerId,
    setEditingCustomerName,
  });

  const activeProjects = useMemo(
    () => sortProjectsByTracking(
      projects.filter((project) => !project.archived),
      trackedProjectIds,
      nameSort,
    ),
    [projects, trackedProjectIds, nameSort],
  );
  const archivedProjects = useMemo(
    () => sortProjectsByTracking(
      projects.filter((project) => project.archived),
      trackedProjectIds,
      nameSort,
    ),
    [projects, trackedProjectIds, nameSort],
  );
  const customerById = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer])),
    [customers],
  );
  const memberGroupById = useMemo(
    () => new Map(memberGroups.map((group) => [group.id, group])),
    [memberGroups],
  );
  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );
  const sortedCustomers = useMemo(
    () => sortCustomersByName(customers, nameSort),
    [customers, nameSort],
  );
  const filteredCustomers = useMemo(
    () => filterCustomersBySearch(sortedCustomers, customerSearch),
    [customerSearch, sortedCustomers],
  );
  const trackedProjectIdSet = useMemo(() => new Set(trackedProjectIds), [trackedProjectIds]);

  useEffect(() => {
    setPageIndex(1);
  }, [selectedProjectId]);

  const {
    projectTasks,
    totalCount,
    availableAssigneeIds,
    tasksLoading,
    tasksError,
    refetchTasks,
  } = useProjectTasksQuery({
    workspaceId: currentWorkspaceId,
    projectId: selectedProjectId,
    taskScope,
    pastFromDate,
    pastToDate,
    pastSort,
    statusFilterIds,
    assigneeFilterIds,
    search,
    pageIndex,
    pageSize,
  });

  const { statusById, assigneeById, taskTypeById, tagById } = usePlannerLookupMaps({
    statuses, assignees, taskTypes, tags,
  });

  const projectAssigneeIds = useMemo(
    () => new Set<string>([...availableAssigneeIds, ...assigneeFilterIds]),
    [assigneeFilterIds, availableAssigneeIds],
  );

  const assigneeOptions = useMemo(
    () => assignees
      .filter((assignee) => projectAssigneeIds.has(assignee.id))
      .sort((left, right) => left.name.localeCompare(right.name)),
    [assignees, projectAssigneeIds],
  );

  const customerProjectCounts = useMemo(
    () => buildCustomerProjectCounts(projects),
    [projects],
  );

  // Phase 1 (Project Card): derive members from the assignees actually used on
  // this project's tasks (no per-project membership table yet — Phase 4 will
  // replace this with explicit `project_members`).
  const projectMembers = useMemo(() => (
    Array.from(availableAssigneeIds)
      .map((id) => assigneeById.get(id))
      .filter((assignee): assignee is Assignee => Boolean(assignee))
  ), [assigneeById, availableAssigneeIds]);

  const projectMilestones = useMemo(() => (
    selectedProjectId
      ? milestones.filter((milestone) => milestone.projectId === selectedProjectId)
      : []
  ), [milestones, selectedProjectId]);

  const today = useMemo(() => new Date(), []);

  // Phase 3 — customer contact handlers; surface mutation errors via the
  // existing error banner.
  const handleAddCustomerContact = useCallback(async (
    payload: { customerId: string; name: string; role: string | null; email: string | null; phone: string | null; tag: string | null },
  ) => {
    setMutationError('');
    const result = await addCustomerContact(payload);
    if (!result) {
      setMutationError(t`Failed to add customer contact.`);
    }
  }, [addCustomerContact]);

  const handleDeleteCustomerContact = useCallback(async (id: string) => {
    setMutationError('');
    const result = await deleteCustomerContact(id);
    if (result?.error) {
      setMutationError(result.error);
    }
  }, [deleteCustomerContact]);

  // Phase 4/7 — project member handlers (workspace + external).
  const handleAddProjectMember = useCallback(async (
    projectId: string,
    input: import('@/features/projects/components/projectCard/TeamBlock').AddMemberInput,
  ) => {
    setMutationError('');
    const payload = input.kind === 'workspace'
      ? {
          projectId,
          assigneeId: input.assigneeId,
          role: input.role,
          tag: input.tag,
          externalName: null,
          externalCompany: null,
          externalEmail: null,
          externalPhone: null,
        }
      : {
          projectId,
          assigneeId: null,
          role: input.role,
          tag: input.tag,
          externalName: input.name,
          externalCompany: input.company,
          externalEmail: input.email,
          externalPhone: input.phone,
        };
    const result = await addProjectMember(payload);
    if (!result) {
      setMutationError(t`Failed to add project member.`);
    }
  }, [addProjectMember]);

  const handleUpdateExternalMember = useCallback(async (
    memberId: string,
    updates: Partial<Pick<import('@/features/planner/types/planner').ProjectMember,
      'externalName' | 'externalCompany' | 'externalEmail' | 'externalPhone' | 'role' | 'tag'
    >>,
  ) => {
    setMutationError('');
    const result = await updateProjectMember(memberId, updates);
    if (result?.error) {
      setMutationError(result.error);
    }
  }, [updateProjectMember]);

  const handleRemoveProjectMember = useCallback(async (memberId: string) => {
    setMutationError('');
    const result = await deleteProjectMember(memberId);
    if (result?.error) {
      setMutationError(result.error);
    }
  }, [deleteProjectMember]);

  const handleUpdateAssigneeContact = useCallback(async (
    assigneeId: string,
    email: string | null,
    phone: string | null,
  ) => {
    setMutationError('');
    const result = await updateAssignee(assigneeId, { email, phone });
    if (result?.error) {
      setMutationError(result.error);
    }
  }, [updateAssignee]);

  // Phase 6 — activity feed handlers.
  const handleAddProjectActivity = useCallback(async (projectId: string, content: string) => {
    setMutationError('');
    const result = await addProjectActivity({ projectId, content });
    if (!result) {
      setMutationError(t`Failed to publish activity entry.`);
    }
  }, [addProjectActivity]);

  const handleUpdateProjectActivity = useCallback(async (id: string, content: string) => {
    setMutationError('');
    const result = await updateProjectActivity(id, { content });
    if (result?.error) {
      setMutationError(result.error);
    }
  }, [updateProjectActivity]);

  const handleDeleteProjectActivity = useCallback(async (id: string) => {
    setMutationError('');
    const result = await deleteProjectActivity(id);
    if (result?.error) {
      setMutationError(result.error);
    }
  }, [deleteProjectActivity]);

  const formatActivityTimestamp = useCallback((iso: string) => (
    format(parseISO(iso), 'd MMM yyyy, HH:mm', { locale: dateLocale })
  ), [dateLocale]);

  const {
    projectSearch,
    setProjectSearch,
    customerFilterIds,
    setCustomerFilterIds,
    ownerGroupFilterIds,
    setOwnerGroupFilterIds,
    milestoneSearch,
    setMilestoneSearch,
    filteredActiveProjects,
    filteredArchivedProjects,
    visibleMilestones,
    groupedMilestones,
    milestoneGroupLabel,
    handleCycleMilestoneGroup,
  } = useProjectsFilter({
    activeProjects,
    archivedProjects,
    milestones,
    projects,
    sortedCustomers,
    trackedProjectIds,
    trackedProjectIdSet,
    projectById,
    customerById,
    nameSort,
    milestoneTab,
    milestoneGroupBy,
    setMilestoneGroupBy,
    dateLocale,
  });

  const {
    selectedProject,
    selectedMilestone,
    selectedMilestoneProject,
    selectedMilestoneCustomer,
    selectedTask,
    selectedTaskProject,
    selectedTaskCustomer,
    selectedTaskTags,
    selectedTaskDescription,
    selectedCustomer,
    selectedCustomerProjects,
  } = useProjectSelection({
    projects,
    milestones,
    customers,
    projectTasks,
    selectedProjectId,
    selectedMilestoneId,
    selectedCustomerId,
    selectedTaskId,
    projectById,
    customerById,
    tagById,
    trackedProjectIds,
  });

  useOnboardingTour({
    pageId: 'projects',
    canEdit,
    hasProjectAssigneeTarget: Boolean(selectedProject),
  });

  const navigate = useNavigate();

  const {
    editingMilestone,
    milestoneDialogOpen,
    milestoneDialogDate,
    milestoneDialogDefaultProjectId,
    deleteMilestoneTarget,
    deleteMilestoneOpen,
    setDeleteMilestoneOpen,
    setDeleteMilestoneTarget,
    handleOpenCreateMilestone,
    handleOpenCreateMilestoneForProject,
    handleOpenMilestoneSettings,
    handleMilestoneDialogOpenChange,
    requestDeleteMilestone,
    handleConfirmDeleteMilestone,
  } = useMilestoneActions({
    canEdit,
    selectedMilestone,
    selectedMilestoneId,
    setSelectedMilestoneId,
    deleteMilestone,
    setMutationError,
  });

  const handleOpenTaskInTimeline = useCallback(() => {
    if (!selectedTask) return;
    setHighlightedTaskId(selectedTask.id);
    clearFilters();
    if (user?.id && typeof window !== 'undefined') {
      window.localStorage.removeItem(`planner-filters-${user.id}`);
    }
    setViewMode('week');
    setCurrentDate(selectedTask.startDate);
    requestScrollToDate(selectedTask.startDate);
    setSelectedTaskId(null);
    navigate('/app');
  }, [
    clearFilters,
    navigate,
    requestScrollToDate,
    selectedTask,
    setHighlightedTaskId,
    setCurrentDate,
    setSelectedTaskId,
    setViewMode,
    user?.id,
  ]);

  const displayTaskRows = useDisplayTaskRows(projectTasks, taskScope);

  const totalPages = taskScope === 'past'
    ? Math.max(1, Math.ceil(totalCount / pageSize))
    : 1;
  const displayTotalCount = taskScope === 'current'
    ? displayTaskRows.length
    : totalCount;

  const statusFilterLabel = statusFilterIds.length === 0
    ? t`All statuses`
    : t`${statusFilterIds.length} selected`;

  const assigneeFilterLabel = assigneeFilterIds.length === 0
    ? t`All assignees`
    : t`${assigneeFilterIds.length} selected`;

  const customerFilterLabel = customerFilterIds.length === 0
    ? t`All`
    : t`${customerFilterIds.length} selected`;

  const ownerGroupFilterLabel = ownerGroupFilterIds.length === 0
    ? t`Team`
    : t`${ownerGroupFilterIds.length} selected`;

  const handleToggleOwnerGroupFilter = (groupId: string) => {
    setOwnerGroupFilterIds((current) => (
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId]
    ));
  };

  const nameSortLabel = nameSort === 'asc' ? t`A-Z` : t`Z-A`;

  const handleToggleStatus = (statusId: string) => {
    setPageIndex(1);
    setStatusFilterIds((current) => (
      current.includes(statusId)
        ? current.filter((id) => id !== statusId)
        : [...current, statusId]
    ));
  };

  const handleToggleAssignee = (assigneeId: string) => {
    setPageIndex(1);
    setAssigneeFilterIds((current) => (
      current.includes(assigneeId)
        ? current.filter((id) => id !== assigneeId)
        : [...current, assigneeId]
    ));
  };

  const handleToggleCustomer = (customerId: string) => {
    setCustomerFilterIds((current) => (
      current.includes(customerId)
        ? current.filter((id) => id !== customerId)
        : [...current, customerId]
    ));
  };

  const setStatusPreset = (mode: 'all' | 'open' | 'done') => {
    setPageIndex(1);
    if (mode === 'all') {
      setStatusFilterIds([]);
      return;
    }
    const targetIds = statuses
      .filter((status) => (mode === 'done'
        ? (status.isFinal || status.isCancelled)
        : (!status.isFinal && !status.isCancelled)))
      .map((status) => status.id);
    setStatusFilterIds(targetIds);
  };

  const formatMilestoneDate = useCallback((date: string) => (
    format(parseISO(date), 'dd MMM yyyy', { locale: dateLocale })
  ), [dateLocale]);

  const handleOpenProjectFromMilestone = useCallback((milestone: Milestone) => {
    const project = projectById.get(milestone.projectId);
    if (!project) return;
    setMode('projects');
    setTab(project.archived ? 'archived' : 'active');
    setSelectedProjectId(project.id);
  }, [projectById]);

  const handleOpenProjectFromCustomer = useCallback((project: Project) => {
    setMode('projects');
    setTab(project.archived ? 'archived' : 'active');
    setSelectedProjectId(project.id);
  }, []);

  useProjectsPageEffects({
    tab,
    filteredActiveProjects,
    filteredArchivedProjects,
    selectedProjectId,
    setSelectedProjectId,
    selectedTaskId,
    setSelectedTaskId,
    projectTasks,
    mode,
    filteredCustomers,
    selectedCustomerId,
    setSelectedCustomerId,
    visibleMilestones,
    selectedMilestoneId,
    setSelectedMilestoneId,
    createProjectOpen,
    resetCreateProjectForm,
    setCreateProjectConfirmOpen,
    projectSettingsOpen,
    setProjectSettingsTarget,
    setProjectSettingsConfirmOpen,
  });

  const deleteProjectLabel = deleteProjectTarget
    ? formatProjectLabel(deleteProjectTarget.name, deleteProjectTarget.code)
    : t`this project`;
  const deleteMilestoneLabel = deleteMilestoneTarget?.title ?? t`this milestone`;
  const deleteCustomerLabel = deleteCustomerTarget?.name ?? t`this customer`;

  const groupedProjects = useCallback(
    (list: Project[]) => groupProjectsForSidebar(
      list,
      groupByCustomer,
      sortedCustomers,
      trackedProjectIds,
      t`No customer`,
      t`All projects`,
    ),
    [groupByCustomer, sortedCustomers, trackedProjectIds],
  );

  const mobileSheetLabel = mode === 'milestones'
    ? t`Milestones`
    : mode === 'customers'
      ? t`Customers`
      : t`Projects`;
  const mobileSummary = mode === 'milestones'
    ? (selectedMilestone?.title ?? t`Select a milestone`)
    : mode === 'customers'
      ? (selectedCustomer?.name ?? t`Select a customer`)
      : (selectedProject ? formatProjectLabel(selectedProject.name, selectedProject.code) : t`Select a project`);

  const projectCardEnabled = isProjectCardEnabled();

  const renderProjectsSidebar = (closeOnSelect = false) => {
    // Phase 1.5: when the flag is on, in 'projects' mode, on desktop — replace
    // the legacy multi-mode sidebar with the new card-style list. Milestones /
    // customers / mobile keep using the legacy sidebar.
    if (projectCardEnabled && mode === 'projects' && !isMobile) {
      const visibleProjects = tab === 'archived'
        ? filteredArchivedProjects
        : filteredActiveProjects;
      const groupLabel = tab === 'archived' ? t`Archived` : t`Active`;
      return (
        <ProjectCardSidebar
          projects={visibleProjects}
          customerById={customerById}
          memberGroupById={memberGroupById}
          milestones={milestones}
          selectedProjectId={selectedProjectId}
          onSelectProject={(projectId) => {
            setSelectedProjectId(projectId);
            if (closeOnSelect) setMobileSidebarOpen(false);
          }}
          search={projectSearch}
          onSearchChange={setProjectSearch}
          nameSort={nameSort}
          onToggleNameSort={() => setNameSort((current) => (current === 'asc' ? 'desc' : 'asc'))}
          canEdit={canEdit}
          onOpenProjectSettings={openProjectSettings}
          onToggleProjectArchived={handleToggleProjectArchived}
          onRequestDeleteProject={requestDeleteProject}
          groupLabel={groupLabel}
          sortedCustomers={sortedCustomers}
          customerFilterIds={customerFilterIds}
          customerFilterLabel={customerFilterLabel}
          onToggleCustomerFilter={handleToggleCustomer}
          onClearCustomerFilters={() => setCustomerFilterIds([])}
          groupByCustomer={groupByCustomer}
          onToggleGroupByCustomer={() => setGroupByCustomer((current) => !current)}
          groupedProjects={groupedProjects(visibleProjects)}
          memberGroups={memberGroups}
          ownerGroupFilterIds={ownerGroupFilterIds}
          ownerGroupFilterLabel={ownerGroupFilterLabel}
          onToggleOwnerGroupFilter={handleToggleOwnerGroupFilter}
          onClearOwnerGroupFilters={() => setOwnerGroupFilterIds([])}
        />
      );
    }
    return (
    <ProjectsSidebar
      mode={mode}
      onModeChange={setMode}
      hideModeSelector={isMobile}
      canEdit={canEdit}
      nameSort={nameSort}
      nameSortLabel={nameSortLabel}
      onToggleNameSort={() => setNameSort((current) => (current === 'asc' ? 'desc' : 'asc'))}
      customerSearch={customerSearch}
      onCustomerSearchChange={setCustomerSearch}
      sortedCustomers={sortedCustomers}
      filteredCustomers={filteredCustomers}
      customerProjectCounts={customerProjectCounts}
      selectedCustomerId={selectedCustomerId}
      onSelectCustomer={(customerId) => {
        setSelectedCustomerId(customerId);
        if (closeOnSelect) setMobileSidebarOpen(false);
      }}
      onStartCustomerEdit={startCustomerEdit}
      onRequestDeleteCustomer={requestDeleteCustomer}
      milestoneTab={milestoneTab}
      onMilestoneTabChange={setMilestoneTab}
      milestoneSearch={milestoneSearch}
      onMilestoneSearchChange={setMilestoneSearch}
      milestoneGroupLabel={milestoneGroupLabel}
      onCycleMilestoneGroup={handleCycleMilestoneGroup}
      milestones={milestones}
      visibleMilestones={visibleMilestones}
      groupedMilestones={groupedMilestones}
      selectedMilestoneId={selectedMilestoneId}
      onSelectMilestone={(milestoneId) => {
        setSelectedMilestoneId(milestoneId);
        if (closeOnSelect) setMobileSidebarOpen(false);
      }}
      onOpenMilestoneSettings={handleOpenMilestoneSettings}
      onOpenProjectFromMilestone={handleOpenProjectFromMilestone}
      onRequestDeleteMilestone={requestDeleteMilestone}
      projectById={projectById}
      customerById={customerById}
      trackedProjectIdSet={trackedProjectIdSet}
      formatMilestoneDate={formatMilestoneDate}
      tab={tab}
      onTabChange={setTab}
      projectSearch={projectSearch}
      onProjectSearchChange={setProjectSearch}
      customerFilterLabel={customerFilterLabel}
      customerFilterIds={customerFilterIds}
      onClearCustomerFilters={() => setCustomerFilterIds([])}
      onToggleCustomerFilter={handleToggleCustomer}
      groupByCustomer={groupByCustomer}
      onToggleGroupByCustomer={() => setGroupByCustomer((current) => !current)}
      activeProjects={activeProjects}
      archivedProjects={archivedProjects}
      filteredActiveProjects={filteredActiveProjects}
      filteredArchivedProjects={filteredArchivedProjects}
      selectedProjectId={selectedProjectId}
      onSelectProject={(projectId) => {
        setSelectedProjectId(projectId);
        if (closeOnSelect) setMobileSidebarOpen(false);
      }}
      onToggleTrackedProject={(projectId, nextTracked) => {
        void toggleTrackedProject(projectId, nextTracked);
      }}
      onOpenProjectSettings={openProjectSettings}
      onRequestDeleteProject={requestDeleteProject}
      onToggleProjectArchived={handleToggleProjectArchived}
      groupProjects={groupedProjects}
    />
    );
  };

  const renderProjectsMainPanel = () => (
    <ProjectsMainPanel
      mode={mode}
      selectedProject={selectedProject}
      customerById={customerById}
      taskScope={taskScope}
      onChangeTaskScope={(scope) => {
        setTaskScope(scope);
        setPageIndex(1);
      }}
      search={search}
      onSearchChange={(value) => {
        setSearch(value);
        setPageIndex(1);
      }}
      statusFilterLabel={statusFilterLabel}
      setStatusPreset={setStatusPreset}
      statuses={statuses}
      statusFilterIds={statusFilterIds}
      onToggleStatus={handleToggleStatus}
      assigneeFilterLabel={assigneeFilterLabel}
      assigneeOptions={assigneeOptions}
      assigneeFilterIds={assigneeFilterIds}
      onToggleAssignee={handleToggleAssignee}
      pastFromDate={pastFromDate}
      onPastFromDateChange={(value) => {
        setPastFromDate(value);
        setPageIndex(1);
      }}
      pastToDate={pastToDate}
      onPastToDateChange={(value) => {
        setPastToDate(value);
        setPageIndex(1);
      }}
      pastSort={pastSort}
      onPastSortChange={(value) => {
        setPastSort(value);
        setPageIndex(1);
      }}
      onClearFilters={() => {
        setSearch('');
        setStatusFilterIds([]);
        setAssigneeFilterIds([]);
        setPastFromDate('');
        setPastToDate('');
        setPageIndex(1);
      }}
      selectedProjectId={selectedProjectId}
      onRefreshTasks={() => {
        if (selectedProjectId) {
          void refetchTasks();
        }
      }}
      tasksLoading={tasksLoading}
      tasksError={tasksError}
      displayTaskRows={displayTaskRows}
      taskScopePageSize={pageSize}
      displayTotalCount={displayTotalCount}
      pageIndex={pageIndex}
      totalPages={totalPages}
      onPrevPage={() => setPageIndex((current) => Math.max(1, current - 1))}
      onNextPage={() => setPageIndex((current) => Math.min(totalPages, current + 1))}
      statusById={statusById}
      assigneeById={assigneeById}
      onSelectTask={setSelectedTaskId}
      selectedMilestone={selectedMilestone}
      selectedMilestoneProject={selectedMilestoneProject}
      selectedMilestoneCustomer={selectedMilestoneCustomer}
      formatMilestoneDate={formatMilestoneDate}
      trackedProjectIdSet={trackedProjectIdSet}
      onOpenProjectFromMilestone={handleOpenProjectFromMilestone}
      onOpenMilestoneSettings={handleOpenMilestoneSettings}
      onRequestDeleteMilestone={requestDeleteMilestone}
      canEdit={canEdit}
      selectedCustomer={selectedCustomer}
      selectedCustomerProjects={selectedCustomerProjects}
      customersCount={customers.length}
      onOpenProjectFromCustomer={handleOpenProjectFromCustomer}
      projectMembers={projectMembers}
      projectMilestones={projectMilestones}
      today={today}
      onCreateMilestoneForProject={handleOpenCreateMilestoneForProject}
      onEditMilestone={handleOpenMilestoneSettings}
      customerContacts={customerContacts}
      onAddCustomerContact={handleAddCustomerContact}
      onDeleteCustomerContact={handleDeleteCustomerContact}
      projectMemberRows={projectMemberRows}
      workspaceAssignees={assignees}
      onAddProjectMember={handleAddProjectMember}
      onRemoveProjectMember={handleRemoveProjectMember}
      onUpdateAssigneeContact={handleUpdateAssigneeContact}
      onUpdateExternalMember={handleUpdateExternalMember}
      projectActivity={projectActivity}
      formatActivityTimestamp={formatActivityTimestamp}
      onAddProjectActivity={handleAddProjectActivity}
      onUpdateProjectActivity={handleUpdateProjectActivity}
      onDeleteProjectActivity={handleDeleteProjectActivity}
    />
  );

  if (isSuperAdmin) {
    return <Navigate to="/app/admin/users" replace />;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <WorkspacePageHeader
        primaryAction={mode === 'customers' ? (
          <Button
            data-tour="projects-primary-action"
            onClick={() => setCreateCustomerOpen(true)}
            size="sm"
            className="gap-2"
            disabled={!canEdit}
          >
            <Plus className="h-4 w-4" />
            {t`New customer`}
          </Button>
        ) : mode === 'milestones' ? (
          <Button
            data-tour="projects-primary-action"
            onClick={handleOpenCreateMilestone}
            size="sm"
            className="gap-2"
            disabled={!canEdit}
          >
            <Plus className="h-4 w-4" />
            {t`New milestone`}
          </Button>
        ) : (
          <Button
            data-tour="projects-primary-action"
            onClick={() => setCreateProjectOpen(true)}
            size="sm"
            className="gap-2"
            disabled={!canEdit}
          >
            <Plus className="h-4 w-4" />
            {t`New project`}
          </Button>
        )}
        onOpenSettings={() => setShowSettings(true)}
        onOpenAccountSettings={() => setShowAccountSettings(true)}
        settingsDisabled={!canEdit}
      />

      {mutationError && (
        <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <div className="flex items-center justify-between gap-3">
            <span className="truncate">{mutationError}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-destructive hover:text-destructive"
              onClick={() => setMutationError('')}
            >
              {t`Dismiss`}
            </Button>
          </div>
        </div>
      )}

      {isMobile ? (
        <>
          {(() => {
            const subnavItems: MobilePillSubnavItem[] = [
              { id: 'projects', label: t`Projects` },
              { id: 'milestones', label: t`Milestones` },
              { id: 'customers', label: t`Customers` },
            ];
            return (
              <div className="border-b border-border bg-card">
                <MobilePillSubnav
                  items={subnavItems}
                  activeId={mode}
                  onChange={(id) => setMode(id as 'projects' | 'milestones' | 'customers')}
                  ariaLabel={t`Projects sections`}
                />
              </div>
            );
          })()}
          <MobilePageSheetLayout
            open={mobileSidebarOpen}
            onOpenChange={setMobileSidebarOpen}
            browseLabel={mobileSheetLabel}
            sheetTitle={mobileSheetLabel}
            summary={mobileSummary}
            sheetContent={renderProjectsSidebar(true)}
          >
            {renderProjectsMainPanel()}
          </MobilePageSheetLayout>
        </>
      ) : (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <ResizablePanelGroup
            direction="horizontal"
            autoSaveId="projects-layout-split"
            className="flex-1 min-h-0"
          >
            <ResizablePanel defaultSize={28} minSize={18} maxSize={42} className="min-w-[260px]">
              {renderProjectsSidebar()}
            </ResizablePanel>
            <ResizableHandle withHandle className="bg-border/70" />
            <ResizablePanel defaultSize={72} minSize={58}>
              {renderProjectsMainPanel()}
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      )}

      <ProjectsDialogs
        canEdit={canEdit}
        showSettings={showSettings}
        setShowSettings={setShowSettings}
        showAccountSettings={showAccountSettings}
        setShowAccountSettings={setShowAccountSettings}
        createCustomerOpen={createCustomerOpen}
        setCreateCustomerOpen={setCreateCustomerOpen}
        newCustomerName={newCustomerName}
        setNewCustomerName={setNewCustomerName}
        handleAddCustomerFromTab={handleAddCustomerFromTab}
        renameCustomerOpen={renameCustomerOpen}
        setRenameCustomerOpen={setRenameCustomerOpen}
        requestCloseRenameCustomer={requestCloseRenameCustomer}
        editingCustomerName={editingCustomerName}
        setEditingCustomerName={setEditingCustomerName}
        editingCustomerIndustry={editingCustomerIndustry}
        setEditingCustomerIndustry={setEditingCustomerIndustry}
        handleRenameCustomer={handleRenameCustomer}
        renameCustomerConfirmOpen={renameCustomerConfirmOpen}
        setRenameCustomerConfirmOpen={setRenameCustomerConfirmOpen}
        cancelCustomerEdit={cancelCustomerEdit}
        createProjectOpen={createProjectOpen}
        setCreateProjectOpen={setCreateProjectOpen}
        requestCloseCreateProject={requestCloseCreateProject}
        newProjectName={newProjectName}
        setNewProjectName={setNewProjectName}
        newProjectCode={newProjectCode}
        setNewProjectCode={setNewProjectCode}
        newProjectColor={newProjectColor}
        setNewProjectColor={setNewProjectColor}
        newProjectCustomerId={newProjectCustomerId}
        setNewProjectCustomerId={setNewProjectCustomerId}
        newProjectOwnerGroupId={newProjectOwnerGroupId}
        setNewProjectOwnerGroupId={setNewProjectOwnerGroupId}
        memberGroups={memberGroups}
        handleCreateProject={handleCreateProject}
        createProjectConfirmOpen={createProjectConfirmOpen}
        setCreateProjectConfirmOpen={setCreateProjectConfirmOpen}
        customers={customers}
        createCustomerByName={createCustomerByName}
        projectSettingsOpen={projectSettingsOpen}
        setProjectSettingsOpen={setProjectSettingsOpen}
        requestCloseProjectSettings={requestCloseProjectSettings}
        projectSettingsTarget={projectSettingsTarget}
        projectSettingsName={projectSettingsName}
        setProjectSettingsName={setProjectSettingsName}
        projectSettingsCode={projectSettingsCode}
        setProjectSettingsCode={setProjectSettingsCode}
        projectSettingsColor={projectSettingsColor}
        setProjectSettingsColor={setProjectSettingsColor}
        projectSettingsCustomerId={projectSettingsCustomerId}
        setProjectSettingsCustomerId={setProjectSettingsCustomerId}
        projectSettingsOwnerGroupId={projectSettingsOwnerGroupId}
        setProjectSettingsOwnerGroupId={setProjectSettingsOwnerGroupId}
        handleSaveProjectSettings={handleSaveProjectSettings}
        projectSettingsConfirmOpen={projectSettingsConfirmOpen}
        setProjectSettingsConfirmOpen={setProjectSettingsConfirmOpen}
        milestoneDialogOpen={milestoneDialogOpen}
        handleMilestoneDialogOpenChange={handleMilestoneDialogOpenChange}
        milestoneDialogDate={milestoneDialogDate}
        milestoneDialogDefaultProjectId={milestoneDialogDefaultProjectId}
        editingMilestone={editingMilestone}
        selectedTaskId={selectedTaskId}
        setSelectedTaskId={setSelectedTaskId}
        selectedTask={selectedTask}
        selectedTaskProject={selectedTaskProject}
        selectedTaskCustomer={selectedTaskCustomer}
        statusById={statusById}
        assigneeById={assigneeById}
        taskTypeById={taskTypeById}
        selectedTaskTags={selectedTaskTags}
        selectedTaskDescription={selectedTaskDescription}
        handleOpenTaskInTimeline={handleOpenTaskInTimeline}
        deleteProjectOpen={deleteProjectOpen}
        setDeleteProjectOpen={setDeleteProjectOpen}
        deleteProjectLabel={deleteProjectLabel}
        setDeleteProjectTarget={setDeleteProjectTarget}
        handleConfirmDeleteProject={handleConfirmDeleteProject}
        deleteMilestoneOpen={deleteMilestoneOpen}
        setDeleteMilestoneOpen={setDeleteMilestoneOpen}
        deleteMilestoneLabel={deleteMilestoneLabel}
        setDeleteMilestoneTarget={setDeleteMilestoneTarget}
        handleConfirmDeleteMilestone={handleConfirmDeleteMilestone}
        deleteCustomerOpen={deleteCustomerOpen}
        setDeleteCustomerOpen={setDeleteCustomerOpen}
        deleteCustomerLabel={deleteCustomerLabel}
        setDeleteCustomerTarget={setDeleteCustomerTarget}
        handleConfirmDeleteCustomer={handleConfirmDeleteCustomer}
      />
    </div>
  );
};

export default ProjectsPage;
