import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { ProjectsSidebar } from '@/features/projects/components/ProjectsSidebar';
import { ProjectCardSidebar } from '@/features/projects/components/projectCard/ProjectCardSidebar';
import { computeGroupMembersToAdd } from '@/features/projects/lib/projectCard/computeGroupMembersToAdd';
import { isProjectCardEnabled, isProjectCardMobileEnabled } from '@/shared/lib/featureFlags';
import { ProjectsDialogs } from '@/features/projects/components/ProjectsDialogs';
import { ProjectsMainPanel } from '@/features/projects/components/ProjectsMainPanel';
import { AddTaskDialog } from '@/features/planner/components/AddTaskDialog';
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
import { useWorkspaceHeader } from '@/features/workspace/components/WorkspaceLayout';
import { Button } from '@/shared/ui/button';
import { t } from '@lingui/macro';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/shared/ui/resizable';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { sortProjectsByTracking } from '@/shared/lib/projectSorting';
import { needsAssigneeGroupingToRevealTask } from '@/shared/domain/timelineTaskReveal';
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
import {
  ALL_COMPANIES,
  buildContactList,
  buildCompanyBuckets,
  filterEntriesByCompany,
  searchContactList,
} from '@/features/projects/lib/contactList';
import { ContactsPeoplePanel } from '@/features/projects/components/ContactsPeoplePanel';
import { usePageSeo } from '@/shared/lib/seo/usePageSeo';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { MobilePillSubnav } from '@/shared/ui/mobile-pill-subnav';
import { MobileSwipeDeck } from '@/shared/ui/mobile-swipe-deck';
import { MobileScreenShell } from '@/shared/ui/mobile-screen-shell';
import { MOBILE_FAB_BUTTON_CLASS } from '@/shared/ui/mobile-fab';
import { ProjectsMobileList } from '@/features/projects/components/ProjectsMobileList';
import { MilestonesMobileSection } from '@/features/projects/components/MilestonesMobileSection';
import { CustomersMobileList } from '@/features/projects/components/CustomersMobileList';
import { ProjectsMobileFiltersScreen } from '@/features/projects/components/ProjectsMobileFiltersScreen';
import { cn } from '@/shared/lib/classNames';
import { useOnboardingTour } from '@/features/onboarding/hooks/useOnboardingTour';

/**
 * Phone sections, in the order they are swiped through. The pill strip, the
 * deck and the dots all read this one list, so they cannot disagree about
 * what comes next.
 */
const PROJECT_MOBILE_SECTIONS: Array<{ id: 'projects' | 'milestones' | 'customers' | 'contacts' }> = [
  { id: 'projects' },
  { id: 'milestones' },
  { id: 'customers' },
  { id: 'contacts' },
];

const ProjectsPage = () => {
  usePageSeo({
    title: 'Motio — Projects',
    description: 'Private projects workspace in Motio.',
    canonicalPath: '/app/projects',
    robots: 'noindex, nofollow',
  });

  const [showSettings, setShowSettings] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [mutationError, setMutationError] = useState('');
  const [search, setSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [selectedCompanyKey, setSelectedCompanyKey] = useState<string>(ALL_COMPANIES);
  const [assigneeFilterIds, setAssigneeFilterIds] = useState<string[]>([]);
  const {
    taskScope, setTaskScope,
    pastFromDate, setPastFromDate,
    pastToDate, setPastToDate,
    pastSort, setPastSort,
    pageIndex, setPageIndex,
    statusFilterIds, setStatusFilterIds,
  } = useTaskScopeFilter();
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  // Two levels on a phone: the deck of lists, and the detail pushed on top.
  const [mobileProjectScreenOpen, setMobileProjectScreenOpen] = useState(false);
  const [mobileProjectFiltersOpen, setMobileProjectFiltersOpen] = useState(false);
  const [mobileCustomerScreenOpen, setMobileCustomerScreenOpen] = useState(false);
  // Bumped to ask the contacts panel to open its new-contact form; the button
  // itself belongs to the page header so it floats like every other one.
  const [contactCreateRequest, setContactCreateRequest] = useState(0);
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
    memberGroupAssignments,
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
    updateCustomerContact,
    addProjectMember,
    deleteProjectMember,
    updateProjectMember,
    addProjectActivity,
    updateProjectActivity,
    deleteProjectActivity,
    setProjectActivityPinned,
    updateAssignee,
    deleteProject,
    deleteMilestone,
    toggleTrackedProject,
    setHighlightedTaskId,
    setViewMode,
    setCurrentDate,
    requestScrollToDate,
    clearFilters,
    groupMode,
    setGroupMode,
  } = usePlannerStore(useShallow((state) => ({
    projects: state.projects,
    milestones: state.milestones,
    trackedProjectIds: state.trackedProjectIds,
    customers: state.customers,
    customerContacts: state.customerContacts,
    projectMembers: state.projectMembers,
    projectActivity: state.projectActivity,
    memberGroups: state.memberGroups,
    memberGroupAssignments: state.memberGroupAssignments,
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
    updateCustomerContact: state.updateCustomerContact,
    addProjectMember: state.addProjectMember,
    deleteProjectMember: state.deleteProjectMember,
    updateProjectMember: state.updateProjectMember,
    addProjectActivity: state.addProjectActivity,
    updateProjectActivity: state.updateProjectActivity,
    deleteProjectActivity: state.deleteProjectActivity,
    setProjectActivityPinned: state.setProjectActivityPinned,
    updateAssignee: state.updateAssignee,
    deleteProject: state.deleteProject,
    deleteMilestone: state.deleteMilestone,
    toggleTrackedProject: state.toggleTrackedProject,
    setHighlightedTaskId: state.setHighlightedTaskId,
    setViewMode: state.setViewMode,
    setCurrentDate: state.setCurrentDate,
    requestScrollToDate: state.requestScrollToDate,
    clearFilters: state.clearFilters,
    groupMode: state.groupMode,
    setGroupMode: state.setGroupMode,
  })));

  const {
    user,
    currentWorkspaceId,
    currentWorkspaceRole,
    isSuperAdmin,
    workspacesLoaded,
    hasWorkspaces,
  } = useAuthStore(useShallow((state) => ({
    user: state.user,
    currentWorkspaceId: state.currentWorkspaceId,
    currentWorkspaceRole: state.currentWorkspaceRole,
    isSuperAdmin: state.isSuperAdmin,
    workspacesLoaded: state.workspacesLoaded,
    hasWorkspaces: state.workspaces.length > 0,
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
    tab: persistedTab,
    setTab: setPersistedTab,
    mode: persistedMode,
    setMode: setPersistedMode,
    selectedProjectId: persistedSelectedProjectId,
    setSelectedProjectId: setPersistedSelectedProjectId,
    selectedCustomerId: persistedSelectedCustomerId,
    setSelectedCustomerId: setPersistedSelectedCustomerId,
    customerFilterIds: persistedCustomerFilterIds,
    setCustomerFilterIds: setPersistedCustomerFilterIds,
    ownerGroupFilterIds: persistedOwnerGroupFilterIds,
    setOwnerGroupFilterIds: setPersistedOwnerGroupFilterIds,
    milestoneOwnerGroupFilterIds: persistedMilestoneOwnerGroupFilterIds,
    setMilestoneOwnerGroupFilterIds: setPersistedMilestoneOwnerGroupFilterIds,
  } = useProjectsViewPreferences({
    currentWorkspaceId,
    userId: user?.id,
  });
  // Surface persisted state under the names the rest of the page already
  // uses, so we don't have to rename hundreds of references downstream.
  const tab = persistedTab;
  const setTab = setPersistedTab;
  const mode = persistedMode;
  const setMode = setPersistedMode;
  const selectedProjectId = persistedSelectedProjectId;
  const setSelectedProjectId = setPersistedSelectedProjectId;
  const selectedCustomerId = persistedSelectedCustomerId;
  const setSelectedCustomerId = setPersistedSelectedCustomerId;

  useEffect(() => {
    if (currentWorkspaceId) {
      loadWorkspaceData(currentWorkspaceId);
    }
  }, [currentWorkspaceId, loadWorkspaceData]);

  // Deep link from elsewhere (e.g. the workload heatmap): /app/projects?milestone=<id>
  // opens the milestones view on that specific milestone. Wait for milestones to load
  // so the auto-select effect doesn't overwrite the choice, pick the matching tab, and
  // clear any owner-group filter that could hide it. The param is consumed once.
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkMilestoneAppliedRef = useRef(false);
  useEffect(() => {
    if (deepLinkMilestoneAppliedRef.current) return;
    const milestoneId = searchParams.get('milestone');
    if (!milestoneId) return;
    if (milestones.length === 0) return;
    deepLinkMilestoneAppliedRef.current = true;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('milestone');
      return next;
    }, { replace: true });
    const target = milestones.find((milestone) => milestone.id === milestoneId);
    if (!target) return;
    const todayKey = new Date().toISOString().slice(0, 10);
    setPersistedMode('milestones');
    setMilestoneTab(target.date >= todayKey ? 'active' : 'past');
    setPersistedMilestoneOwnerGroupFilterIds([]);
    setSelectedMilestoneId(target.id);
  }, [
    searchParams,
    milestones,
    setSearchParams,
    setPersistedMode,
    setMilestoneTab,
    setPersistedMilestoneOwnerGroupFilterIds,
    setSelectedMilestoneId,
  ]);

  // When an owner team (member group) is assigned to a project, auto-add
  // every workspace user in that group as an explicit project member. The
  // user can still prune individual members afterward; we never remove anyone
  // here, only add. Idempotent — already-added members are skipped.
  const syncGroupMembersToProject = useCallback(async (
    projectId: string,
    groupId: string | null,
  ) => {
    const toAdd = computeGroupMembersToAdd({
      projectId,
      groupId,
      memberGroupAssignments,
      assignees,
      projectMembers: projectMemberRows,
    });
    if (toAdd.length === 0) return;
    await Promise.all(toAdd.map((assignee) => addProjectMember({
      projectId,
      assigneeId: assignee.id,
      role: null,
      tag: null,
      externalName: null,
      externalCompany: null,
      externalEmail: null,
      externalPhone: null,
    })));
  }, [addProjectMember, assignees, memberGroupAssignments, projectMemberRows]);

  const addProjectWithGroupSync = useCallback(async (
    payload: Parameters<typeof addProject>[0],
  ) => {
    const created = await addProject(payload);
    if (created && payload.ownerGroupId) {
      await syncGroupMembersToProject(created.id, payload.ownerGroupId);
    }
    return created;
  }, [addProject, syncGroupMembersToProject]);

  const updateProjectWithGroupSync = useCallback(async (
    id: string,
    updates: Parameters<typeof updateProject>[1],
  ) => {
    const previous = projects.find((project) => project.id === id) ?? null;
    const result = await updateProject(id, updates);
    if (result?.error) return result;
    // Only fan out to project_members when the owner group actually changed
    // and resolves to a non-null group. Avoids redundant round-trips when an
    // unrelated field (name, color, etc.) is edited.
    const nextGroupId = 'ownerGroupId' in updates ? updates.ownerGroupId ?? null : null;
    const previousGroupId = previous?.ownerGroupId ?? null;
    if (nextGroupId && nextGroupId !== previousGroupId) {
      await syncGroupMembersToProject(id, nextGroupId);
    }
    return result;
  }, [projects, updateProject, syncGroupMembersToProject]);

  const {
    projectSettingsOpen, setProjectSettingsOpen,
    projectSettingsTarget, setProjectSettingsTarget,
    projectSettingsName, setProjectSettingsName,
    projectSettingsCode, setProjectSettingsCode,
    projectSettingsColor, setProjectSettingsColor,
    projectSettingsCustomerId, setProjectSettingsCustomerId,
    projectSettingsOwnerGroupId, setProjectSettingsOwnerGroupId,
    projectSettingsStatus, setProjectSettingsStatus,
    projectSettingsConfirmOpen, setProjectSettingsConfirmOpen,
    deleteProjectTarget, setDeleteProjectTarget,
    deleteProjectOpen, setDeleteProjectOpen,
    openProjectSettings,
    handleSaveProjectSettings,
    requestCloseProjectSettings,
    requestDeleteProject,
    handleConfirmDeleteProject,
    handleToggleProjectArchived,
  } = useProjectMutations({ canEdit, updateProject: updateProjectWithGroupSync, deleteProject, setMutationError });

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
    newProjectStatus, setNewProjectStatus,
    resetCreateProjectForm,
    handleCreateProject,
    requestCloseCreateProject,
  } = useProjectCreateForm({
    canEdit,
    addProject: addProjectWithGroupSync,
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
  // Contacts tab: one flat list of every person (customer contacts +
  // deduped external project members).
  const contactEntries = useMemo(
    () => buildContactList(customerContacts, projectMemberRows, customerById),
    [customerContacts, projectMemberRows, customerById],
  );
  // The single sidebar search runs over EVERYTHING (companies, people, tags,
  // roles, emails, phones): the company list shows only buckets that still
  // contain matches, the panel shows the matching people.
  const searchedContactEntries = useMemo(
    () => searchContactList(contactEntries, contactSearch),
    [contactEntries, contactSearch],
  );
  const companyBuckets = useMemo(
    () => buildCompanyBuckets(searchedContactEntries),
    [searchedContactEntries],
  );
  // A selected company can drop out of the results while the user types; fall
  // back to "All contacts" instead of showing an empty panel (the selection
  // comes back as soon as the company matches again).
  const effectiveCompanyKey = useMemo(() => (
    selectedCompanyKey === ALL_COMPANIES
    || companyBuckets.some((bucket) => bucket.key === selectedCompanyKey)
      ? selectedCompanyKey
      : ALL_COMPANIES
  ), [selectedCompanyKey, companyBuckets]);
  const companyFilteredEntries = useMemo(
    () => filterEntriesByCompany(searchedContactEntries, effectiveCompanyKey),
    [searchedContactEntries, effectiveCompanyKey],
  );
  // Typing a fresh query widens the view to all companies, so matches are
  // never hidden by a previously selected bucket; clicking a company after
  // that narrows within the results.
  const handleContactSearchChange = useCallback((value: string) => {
    if (value.trim() && !contactSearch.trim()) setSelectedCompanyKey(ALL_COMPANIES);
    setContactSearch(value);
  }, [contactSearch]);
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

  // Fallback list: derive members from the assignees actually used on this
  // project's tasks. The project_members table is the authoritative source;
  // this list is shown in the legacy mobile UI which doesn't load that table.
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

  // Customer contact handlers; surface mutation errors via the
  // existing error banner.
  const handleAddCustomerContact = useCallback(async (
    payload: { customerId: string | null; name: string; company: string | null; role: string | null; email: string | null; phone: string | null; tag: string | null },
  ): Promise<boolean> => {
    setMutationError('');
    const result = await addCustomerContact(payload);
    if (!result) {
      setMutationError(t`Failed to add customer contact.`);
      return false;
    }
    return true;
  }, [addCustomerContact]);

  const handleDeleteCustomerContact = useCallback(async (id: string): Promise<boolean> => {
    setMutationError('');
    const result = await deleteCustomerContact(id);
    if (result?.error) {
      setMutationError(result.error);
      return false;
    }
    return true;
  }, [deleteCustomerContact]);

  const handleUpdateCustomerContact = useCallback(async (
    id: string,
    updates: { name?: string; company?: string | null; role?: string | null; email?: string | null; phone?: string | null; tag?: string | null; customerId?: string | null },
  ): Promise<boolean> => {
    setMutationError('');
    const result = await updateCustomerContact(id, updates);
    if (result?.error) {
      setMutationError(result.error);
      return false;
    }
    return true;
  }, [updateCustomerContact]);

  // "Edit / delete everywhere" for a deduplicated external person: apply the
  // same change to every backing project_members row.
  const handleUpdateExternalPerson = useCallback(async (
    memberIds: string[],
    updates: { externalName: string; externalCompany: string | null; externalEmail: string | null; externalPhone: string | null; role: string | null; tag: string | null },
  ): Promise<boolean> => {
    setMutationError('');
    const results = await Promise.all(memberIds.map((memberId) => updateProjectMember(memberId, updates)));
    const failed = results.find((result) => result?.error);
    if (failed?.error) {
      setMutationError(failed.error);
      return false;
    }
    return true;
  }, [updateProjectMember]);

  const handleDeleteExternalPerson = useCallback(async (memberIds: string[]): Promise<boolean> => {
    setMutationError('');
    const results = await Promise.all(memberIds.map((memberId) => deleteProjectMember(memberId)));
    const failed = results.find((result) => result?.error);
    if (failed?.error) {
      setMutationError(failed.error);
      return false;
    }
    return true;
  }, [deleteProjectMember]);

  // Project member handlers (workspace + external).
  const handleAddProjectMember = useCallback(async (
    projectId: string,
    input: import('@/features/projects/components/projectCard/TeamBlock').AddMemberInput,
  ): Promise<boolean> => {
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
      return false;
    }
    return true;
  }, [addProjectMember]);

  const handleUpdateExternalMember = useCallback(async (
    memberId: string,
    updates: Partial<Pick<import('@/features/planner/types/planner').ProjectMember,
      'externalName' | 'externalCompany' | 'externalEmail' | 'externalPhone' | 'role' | 'tag'
    >>,
  ): Promise<boolean> => {
    setMutationError('');
    const result = await updateProjectMember(memberId, updates);
    if (result?.error) {
      setMutationError(result.error);
      return false;
    }
    return true;
  }, [updateProjectMember]);

  const handleRemoveProjectMember = useCallback(async (memberId: string): Promise<boolean> => {
    setMutationError('');
    const result = await deleteProjectMember(memberId);
    if (result?.error) {
      setMutationError(result.error);
      return false;
    }
    return true;
  }, [deleteProjectMember]);

  const handleUpdateAssigneeContact = useCallback(async (
    assigneeId: string,
    email: string | null,
    phone: string | null,
  ): Promise<boolean> => {
    setMutationError('');
    const result = await updateAssignee(assigneeId, { email, phone });
    if (result?.error) {
      setMutationError(result.error);
      return false;
    }
    return true;
  }, [updateAssignee]);

  // Activity feed handlers.
  const handleAddProjectActivity = useCallback(async (projectId: string, content: string): Promise<boolean> => {
    setMutationError('');
    const result = await addProjectActivity({ projectId, content });
    if (!result) {
      setMutationError(t`Failed to publish note.`);
      return false;
    }
    return true;
  }, [addProjectActivity]);

  const handleUpdateProjectActivity = useCallback(async (id: string, content: string): Promise<boolean> => {
    setMutationError('');
    const result = await updateProjectActivity(id, { content });
    if (result?.error) {
      setMutationError(result.error);
      return false;
    }
    return true;
  }, [updateProjectActivity]);

  const handleDeleteProjectActivity = useCallback(async (id: string): Promise<boolean> => {
    setMutationError('');
    const result = await deleteProjectActivity(id);
    if (result?.error) {
      setMutationError(result.error);
      return false;
    }
    return true;
  }, [deleteProjectActivity]);

  const handleSetProjectActivityPinned = useCallback(async (id: string, pinned: boolean): Promise<boolean> => {
    setMutationError('');
    const result = await setProjectActivityPinned(id, pinned);
    if (result?.error) {
      setMutationError(result.error);
      return false;
    }
    return true;
  }, [setProjectActivityPinned]);

  const formatActivityTimestamp = useCallback((iso: string) => (
    format(parseISO(iso), 'd MMM yyyy, HH:mm', { locale: dateLocale })
  ), [dateLocale]);

  // Inline status edit from the project card header.
  const handleSaveProjectStatus = useCallback(async (projectId: string, next: string | null): Promise<boolean> => {
    setMutationError('');
    const result = await updateProject(projectId, { status: next });
    if (result?.error) {
      setMutationError(result.error);
      return false;
    }
    return true;
  }, [updateProject]);

  const {
    projectSearch,
    setProjectSearch,
    customerFilterIds,
    setCustomerFilterIds,
    ownerGroupFilterIds,
    setOwnerGroupFilterIds,
    milestoneOwnerGroupFilterIds,
    setMilestoneOwnerGroupFilterIds,
    milestoneSearch,
    setMilestoneSearch,
    filteredActiveProjects,
    filteredArchivedProjects,
    filteredMilestones,
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
    // Persisted filters live in useProjectsViewPreferences so they survive
    // reloads — pass them through so the filter hook reads/writes the same
    // backing store.
    customerFilterIds: persistedCustomerFilterIds,
    setCustomerFilterIds: setPersistedCustomerFilterIds,
    ownerGroupFilterIds: persistedOwnerGroupFilterIds,
    setOwnerGroupFilterIds: setPersistedOwnerGroupFilterIds,
    milestoneOwnerGroupFilterIds: persistedMilestoneOwnerGroupFilterIds,
    setMilestoneOwnerGroupFilterIds: setPersistedMilestoneOwnerGroupFilterIds,
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
    if (needsAssigneeGroupingToRevealTask({ task: selectedTask, projects, assignees, groupMode })) {
      setGroupMode('assignee');
    }
    setViewMode('day');
    setCurrentDate(selectedTask.startDate);
    requestScrollToDate(selectedTask.startDate);
    setSelectedTaskId(null);
    navigate('/app');
  }, [
    assignees,
    clearFilters,
    groupMode,
    navigate,
    projects,
    requestScrollToDate,
    selectedTask,
    setGroupMode,
    setHighlightedTaskId,
    setCurrentDate,
    setSelectedTaskId,
    setViewMode,
    user?.id,
  ]);

  const displayTaskRows = useDisplayTaskRows(projectTasks, taskScope);

  const selectedTaskRepeatMeta = useMemo(() => {
    if (!selectedTaskId) return null;
    const row = displayTaskRows.find((entry) => entry.taskIds.includes(selectedTaskId));
    return row?.repeatMeta ?? null;
  }, [displayTaskRows, selectedTaskId]);

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

  const handleToggleMilestoneOwnerGroupFilter = (groupId: string) => {
    setMilestoneOwnerGroupFilterIds((current) => (
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
    activeProjects,
    archivedProjects,
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

  const mobileSectionIndex = Math.max(
    0,
    PROJECT_MOBILE_SECTIONS.findIndex((section) => section.id === mode),
  );
  // Counted, not just flagged: the button carries the number so you can see how
  // much is narrowing the list without opening the screen.
  const mobileProjectFilterCount = customerFilterIds.length
    + ownerGroupFilterIds.length
    + (tab === 'archived' ? 1 : 0)
    + (groupByCustomer ? 1 : 0);

  const projectCardEnabled = isProjectCardEnabled();
  const projectCardMobileEnabled = isProjectCardMobileEnabled();

  // Projects | Milestones | Customers segmented switch — one rounded pill
  // container, the active option goes black. Used above both the new card
  // sidebar and the legacy customers sidebar. On mobile this also replaces
  // the top-of-page MobilePillSubnav so the user has only one mode switcher.
  const renderModeTabs = () => {
    const tabs: Array<{ id: 'projects' | 'milestones' | 'customers' | 'contacts'; label: string }> = [
      { id: 'projects', label: t`Projects` },
      { id: 'milestones', label: t`Milestones` },
      { id: 'customers', label: t`Customers` },
      { id: 'contacts', label: t`Contacts` },
    ];
    return (
      <div className="border-b border-border bg-card px-3 py-2">
        <div className="inline-flex w-full items-center rounded-full border border-border bg-muted/50 p-0.5">
          {tabs.map((tabItem) => (
            <button
              key={tabItem.id}
              type="button"
              onClick={() => setMode(tabItem.id)}
              aria-pressed={mode === tabItem.id}
              className={`flex-1 truncate whitespace-nowrap rounded-full px-2 py-1.5 text-[12px] font-medium transition-colors ${
                mode === tabItem.id
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tabItem.label}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderProjectsSidebar = () => {
    // When the flag is on and in 'projects' mode, replace the legacy
    // multi-mode sidebar with the new card-style list. Mobile rendering is
    // gated separately by VITE_FEATURE_PROJECT_CARD_MOBILE so the M1 card
    // can roll out without affecting milestones / customers modes.
    if (
      projectCardEnabled
      && mode === 'projects'
      && (!isMobile || projectCardMobileEnabled)
    ) {
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
          modeTabs={renderModeTabs()}
          showArchived={tab === 'archived'}
          onToggleShowArchived={() => setTab((current) => current === 'archived' ? 'active' : 'archived')}
          trackedProjectIdSet={trackedProjectIdSet}
          onToggleTrackedProject={(projectId, nextTracked) => {
            void toggleTrackedProject(projectId, nextTracked);
          }}
        />
      );
    }
    if (projectCardEnabled && !isMobile) {
      // Customers/milestones modes: show the same Projects|Customers tabs above
      // the legacy sidebar so the user can still flip between them.
      return (
        <div className="flex h-full flex-col">
          {renderModeTabs()}
          <div className="flex-1 min-h-0">
            <ProjectsSidebar
              mode={mode}
              onModeChange={setMode}
              hideModeSelector
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
              }}
              onStartCustomerEdit={startCustomerEdit}
              onRequestDeleteCustomer={requestDeleteCustomer}
              {...contactsSidebarProps}
              onSelectCompany={(key) => {
                setSelectedCompanyKey(key);
              }}
              milestoneTab={milestoneTab}
              onMilestoneTabChange={setMilestoneTab}
              milestoneSearch={milestoneSearch}
              onMilestoneSearchChange={setMilestoneSearch}
              milestoneGroupLabel={milestoneGroupLabel}
              onCycleMilestoneGroup={handleCycleMilestoneGroup}
              memberGroups={memberGroups}
              milestoneOwnerGroupFilterIds={milestoneOwnerGroupFilterIds}
              onToggleMilestoneOwnerGroupFilter={handleToggleMilestoneOwnerGroupFilter}
              onClearMilestoneOwnerGroupFilters={() => setMilestoneOwnerGroupFilterIds([])}
              milestones={milestones}
              visibleMilestones={visibleMilestones}
              groupedMilestones={groupedMilestones}
              selectedMilestoneId={selectedMilestoneId}
              onSelectMilestone={(milestoneId) => {
                setSelectedMilestoneId(milestoneId);
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
              }}
              onToggleTrackedProject={(projectId, nextTracked) => {
                void toggleTrackedProject(projectId, nextTracked);
              }}
              onOpenProjectSettings={openProjectSettings}
              onRequestDeleteProject={requestDeleteProject}
              onToggleProjectArchived={handleToggleProjectArchived}
              groupProjects={groupedProjects}
            />
          </div>
        </div>
      );
    }
    // Project-card flag fully off — fall through to the legacy ProjectsSidebar
    // which has its own internal mode selector on desktop. On mobile we wrap
    // it with the shared 3-way pill above so the user can still switch between
    // Projects | Milestones | Customers (used to live in the top-of-page
    // MobilePillSubnav that we removed).
    const legacySidebar = (
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
      }}
      onStartCustomerEdit={startCustomerEdit}
      onRequestDeleteCustomer={requestDeleteCustomer}
      {...contactsSidebarProps}
      onSelectCompany={(key) => {
        setSelectedCompanyKey(key);
      }}
      milestoneTab={milestoneTab}
      onMilestoneTabChange={setMilestoneTab}
      milestoneSearch={milestoneSearch}
      onMilestoneSearchChange={setMilestoneSearch}
      milestoneGroupLabel={milestoneGroupLabel}
      onCycleMilestoneGroup={handleCycleMilestoneGroup}
      memberGroups={memberGroups}
      milestoneOwnerGroupFilterIds={milestoneOwnerGroupFilterIds}
      onToggleMilestoneOwnerGroupFilter={handleToggleMilestoneOwnerGroupFilter}
      onClearMilestoneOwnerGroupFilters={() => setMilestoneOwnerGroupFilterIds([])}
      milestones={milestones}
      visibleMilestones={visibleMilestones}
      groupedMilestones={groupedMilestones}
      selectedMilestoneId={selectedMilestoneId}
      onSelectMilestone={(milestoneId) => {
        setSelectedMilestoneId(milestoneId);
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
    if (isMobile) {
      return (
        <div className="flex h-full flex-col">
          {renderModeTabs()}
          <div className="flex-1 min-h-0">
            {legacySidebar}
          </div>
        </div>
      );
    }
    return legacySidebar;
  };

  const selectedCompanyBucket = companyBuckets.find((bucket) => bucket.key === effectiveCompanyKey) ?? null;
  const contactsPanelTitle = effectiveCompanyKey === ALL_COMPANIES
    ? t`All contacts`
    : selectedCompanyBucket
      ? (selectedCompanyBucket.company ?? t`No company`)
      : t`All contacts`;
  const contactsSidebarProps = {
    companyBuckets,
    contactSearch,
    onContactSearchChange: handleContactSearchChange,
    selectedCompanyKey: effectiveCompanyKey,
  };
  const renderContactsPeople = () => (
    <ContactsPeoplePanel
      entries={companyFilteredEntries}
      allEntries={contactEntries}
      title={contactsPanelTitle}
      defaultCompany={selectedCompanyBucket?.company ?? null}
      projectById={projectById}
      canEdit={canEdit}
      sectionPadding={isMobile ? 'px-4 py-3' : 'px-6 py-4'}
      search={contactSearch}
      onSearchChange={handleContactSearchChange}
      createRequestId={contactCreateRequest}
      onAddContact={handleAddCustomerContact}
      onUpdateContact={handleUpdateCustomerContact}
      onDeleteContact={handleDeleteCustomerContact}
      onUpdateExternalPerson={handleUpdateExternalPerson}
      onDeleteExternalPerson={handleDeleteExternalPerson}
    />
  );

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
      onAddTask={selectedProjectId ? () => setAddTaskOpen(true) : undefined}
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
      onStartCustomerEdit={startCustomerEdit}
      onRequestDeleteCustomer={requestDeleteCustomer}
      projectMembers={projectMembers}
      projectMilestones={projectMilestones}
      today={today}
      onCreateMilestoneForProject={handleOpenCreateMilestoneForProject}
      onEditMilestone={handleOpenMilestoneSettings}
      onSaveProjectStatus={handleSaveProjectStatus}
      onToggleProjectTracked={(projectId, nextTracked) => {
        void toggleTrackedProject(projectId, nextTracked);
      }}
      onOpenProjectSettings={openProjectSettings}
      onToggleProjectArchived={handleToggleProjectArchived}
      onRequestDeleteProject={requestDeleteProject}
      customerContacts={customerContacts}
      onAddCustomerContact={handleAddCustomerContact}
      onDeleteCustomerContact={handleDeleteCustomerContact}
      onUpdateCustomerContact={handleUpdateCustomerContact}
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
      onSetProjectActivityPinned={handleSetProjectActivityPinned}
      workspaceId={currentWorkspaceId}
    />
  );

  useWorkspaceHeader(
    {
      // Contacts tab has its own "Add contact" button inside the panel.
      primaryAction: mode === 'contacts' ? (isMobile ? (
        <Button
          data-tour="projects-primary-action"
          onClick={() => setContactCreateRequest((current) => current + 1)}
          size={isMobile ? 'default' : 'sm'}
          className={isMobile ? MOBILE_FAB_BUTTON_CLASS : 'gap-2'}
          disabled={!canEdit}
        >
          <Plus className="h-4 w-4" />
          {t`New contact`}
        </Button>
      ) : null) : mode === 'customers' ? (
        <Button
          data-tour="projects-primary-action"
          onClick={() => setCreateCustomerOpen(true)}
          size={isMobile ? 'default' : 'sm'}
          className={isMobile ? MOBILE_FAB_BUTTON_CLASS : 'gap-2'}
          disabled={!canEdit}
        >
          <Plus className="h-4 w-4" />
          {t`New customer`}
        </Button>
      ) : mode === 'milestones' ? (
        <Button
          data-tour="projects-primary-action"
          onClick={handleOpenCreateMilestone}
          size={isMobile ? 'default' : 'sm'}
          className={isMobile ? MOBILE_FAB_BUTTON_CLASS : 'gap-2'}
          disabled={!canEdit}
        >
          <Plus className="h-4 w-4" />
          {t`New milestone`}
        </Button>
      ) : (
        <Button
          data-tour="projects-primary-action"
          onClick={() => setCreateProjectOpen(true)}
          size={isMobile ? 'default' : 'sm'}
          className={isMobile ? MOBILE_FAB_BUTTON_CLASS : 'gap-2'}
          disabled={!canEdit}
        >
          <Plus className="h-4 w-4" />
          {t`New project`}
        </Button>
      ),
      onOpenSettings: () => setShowSettings(true),
      onOpenAccountSettings: () => setShowAccountSettings(true),
      settingsDisabled: !canEdit,
    },
    [mode, canEdit, isMobile],
  );

  if (isSuperAdmin && workspacesLoaded && !hasWorkspaces) {
    return <Navigate to="/app/admin" replace />;
  }

  return (
    <>

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
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* The strip scrolls sideways itself, so it has to swallow the
              gesture instead of letting the deck page under the finger. */}
          <div
            data-swipe-ignore
            className="flex shrink-0 items-center gap-1 border-b border-border bg-card pr-1.5"
          >
            <div className="min-w-0 flex-1">
              <MobilePillSubnav
                items={PROJECT_MOBILE_SECTIONS.map((section) => ({
                  id: section.id,
                  label: section.id === 'projects'
                    ? t`Projects`
                    : section.id === 'milestones'
                      ? t`Milestones`
                      : section.id === 'customers'
                        ? t`Customers`
                        : t`Contacts`,
                }))}
                activeId={PROJECT_MOBILE_SECTIONS[mobileSectionIndex].id}
                onChange={(id) => setMode(id as typeof mode)}
                ariaLabel={t`Project sections`}
              />
            </div>
          </div>

          <MobileSwipeDeck
            index={mobileSectionIndex}
            count={PROJECT_MOBILE_SECTIONS.length}
            onIndexChange={(next) => setMode(PROJECT_MOBILE_SECTIONS[next].id)}
          >
            <div className="flex h-full min-h-0 flex-col overflow-hidden">
              <ProjectsMobileList
                projects={tab === 'archived' ? filteredArchivedProjects : filteredActiveProjects}
                customerById={customerById}
                milestones={milestones}
                trackedProjectIdSet={trackedProjectIdSet}
                canEdit={canEdit}
                search={projectSearch}
                onSearchChange={setProjectSearch}
                activeFilterCount={mobileProjectFilterCount}
                onOpenFilters={() => setMobileProjectFiltersOpen(true)}
                onOpenProject={(project) => {
                  setMode('projects');
                  setSelectedProjectId(project.id);
                  setMobileProjectScreenOpen(true);
                }}
                onToggleTracked={(projectId, nextTracked) => {
                  void toggleTrackedProject(projectId, nextTracked);
                }}
                onOpenSettings={openProjectSettings}
                onToggleArchived={handleToggleProjectArchived}
                onRequestDelete={requestDeleteProject}
                showArchived={tab === 'archived'}
              />
            </div>
            <div className="flex h-full min-h-0 flex-col overflow-hidden">
              <MilestonesMobileSection
                milestones={filteredMilestones}
                projectById={projectById}
                customerById={customerById}
                search={milestoneSearch}
                onSearchChange={setMilestoneSearch}
                canEdit={canEdit}
                onOpenProject={handleOpenProjectFromMilestone}
                onEditMilestone={handleOpenMilestoneSettings}
                onRequestDelete={requestDeleteMilestone}
              />
            </div>
            <div className="flex h-full min-h-0 flex-col overflow-hidden">
              <CustomersMobileList
                customers={filteredCustomers}
                search={customerSearch}
                onSearchChange={setCustomerSearch}
                projects={projects}
                onOpenCustomer={(customer) => {
                  setMode('customers');
                  setSelectedCustomerId(customer.id);
                  setMobileCustomerScreenOpen(true);
                }}
              />
            </div>
            <div className="flex h-full min-h-0 flex-col overflow-hidden">
              {renderContactsPeople()}
            </div>
          </MobileSwipeDeck>

          <div
            // Safari reports safe-area-inset-bottom as 0 without
            // viewport-fit=cover, so the clearance has to be a real gap.
            className="flex shrink-0 items-center justify-center gap-1.5 border-t border-border bg-card pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]"
          >
            {PROJECT_MOBILE_SECTIONS.map((section, index) => (
              <span
                key={section.id}
                aria-hidden="true"
                className={cn(
                  'h-1.5 rounded-full transition-all duration-200',
                  index === mobileSectionIndex ? 'w-4 bg-foreground' : 'w-1.5 bg-border',
                )}
              />
            ))}
          </div>
        </div>
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
              {mode === 'contacts' ? renderContactsPeople() : renderProjectsMainPanel()}
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      )}

      {isMobile && (
        <>
          {/* Second level: the project itself, with a back arrow and the swipe
              that goes with it. */}
          <MobileScreenShell
            open={mobileProjectScreenOpen && mode === 'projects' && Boolean(selectedProject)}
            onOpenChange={setMobileProjectScreenOpen}
            title={selectedProject ? formatProjectLabel(selectedProject.name, selectedProject.code) : t`Project`}
            contentClassName="px-0 pt-0"
          >
            {renderProjectsMainPanel()}
          </MobileScreenShell>

          <ProjectsMobileFiltersScreen
            open={mobileProjectFiltersOpen}
            onOpenChange={setMobileProjectFiltersOpen}
            customers={sortedCustomers}
            customerFilterIds={customerFilterIds}
            onToggleCustomer={handleToggleCustomer}
            memberGroups={memberGroups}
            ownerGroupFilterIds={ownerGroupFilterIds}
            onToggleOwnerGroup={handleToggleOwnerGroupFilter}
            groupByCustomer={groupByCustomer}
            onToggleGroupByCustomer={() => setGroupByCustomer((current) => !current)}
            showArchived={tab === 'archived'}
            onToggleShowArchived={() => setTab(tab === 'archived' ? 'active' : 'archived')}
            nameSort={nameSort}
            onToggleNameSort={() => setNameSort(nameSort === 'asc' ? 'desc' : 'asc')}
            onClearAll={() => {
              setCustomerFilterIds([]);
              setOwnerGroupFilterIds([]);
              setGroupByCustomer(false);
              setTab('active');
            }}
          />

          <MobileScreenShell
            open={mobileCustomerScreenOpen && mode === 'customers' && Boolean(selectedCustomer)}
            onOpenChange={setMobileCustomerScreenOpen}
            title={selectedCustomer?.name ?? t`Customer`}
            contentClassName="px-0 pt-0"
          >
            {renderProjectsMainPanel()}
          </MobileScreenShell>
        </>
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
        newProjectStatus={newProjectStatus}
        setNewProjectStatus={setNewProjectStatus}
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
        projectSettingsStatus={projectSettingsStatus}
        setProjectSettingsStatus={setProjectSettingsStatus}
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
        selectedTaskRepeatMeta={selectedTaskRepeatMeta}
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

      {selectedProjectId && (
        <AddTaskDialog
          open={addTaskOpen}
          onOpenChange={setAddTaskOpen}
          initialProjectId={selectedProjectId}
          lockProject
          onCreated={() => {
            void refetchTasks();
          }}
        />
      )}
    </>
  );
};

export default ProjectsPage;
