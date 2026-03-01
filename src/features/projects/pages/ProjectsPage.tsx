import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { ProjectsSidebar } from '@/features/projects/components/ProjectsSidebar';
import { ProjectsDialogs } from '@/features/projects/components/ProjectsDialogs';
import { ProjectsMainPanel } from '@/features/projects/components/ProjectsMainPanel';
import { useProjectsViewPreferences } from '@/features/projects/hooks/useProjectsViewPreferences';
import { useProjectsPageEffects } from '@/features/projects/hooks/useProjectsPageEffects';
import { useProjectTasksQuery } from '@/features/projects/hooks/useProjectTasksQuery';
import { WorkspaceSwitcher } from '@/features/workspace/components/WorkspaceSwitcher';
import { WorkspaceNav } from '@/features/workspace/components/WorkspaceNav';
import { InviteNotifications } from '@/features/auth/components/InviteNotifications';
import { Button } from '@/shared/ui/button';
import { t } from '@lingui/macro';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/shared/ui/resizable';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { sortProjectsByTracking } from '@/shared/lib/projectSorting';
import { format, parseISO } from 'date-fns';
import {
  Settings,
  User,
  Plus,
} from 'lucide-react';
import { Customer, Milestone, Project, Task } from '@/features/planner/types/planner';
import { hasRichTags, sanitizeTaskDescription } from '@/shared/domain/taskDescription';
import { buildRepeatSeriesRows } from '@/shared/domain/repeatSeriesRows';
import { useLocaleStore } from '@/shared/store/localeStore';
import { resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';
import type { RepeatCadence } from '@/shared/domain/repeatSeries';
import {
  buildCustomerProjectCounts,
  buildGroupedMilestones,
  filterAndSortMilestones,
  filterCustomersBySearch,
  filterProjectsByCustomerAndSearch,
  groupProjectsForSidebar,
  sortCustomersByName,
  splitMilestonesByDate,
} from '@/features/projects/lib/projectsSelectors';
import { usePageSeo } from '@/shared/lib/seo/usePageSeo';

type DisplayTaskRow = {
  key: string;
  task: Task;
  repeatMeta: {
    cadence: RepeatCadence;
    remaining: number;
    total: number;
  } | null;
};

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
  const [projectSearch, setProjectSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [statusFilterIds, setStatusFilterIds] = useState<string[]>([]);
  const [assigneeFilterIds, setAssigneeFilterIds] = useState<string[]>([]);
  const [customerFilterIds, setCustomerFilterIds] = useState<string[]>([]);
  const [mode, setMode] = useState<'projects' | 'milestones' | 'customers'>('projects');
  const [milestoneSearch, setMilestoneSearch] = useState('');
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [createProjectConfirmOpen, setCreateProjectConfirmOpen] = useState(false);
  const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false);
  const [milestoneDialogDate, setMilestoneDialogDate] = useState<string | null>(null);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);
  const [projectSettingsTarget, setProjectSettingsTarget] = useState<Project | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectCode, setNewProjectCode] = useState('');
  const [newProjectColor, setNewProjectColor] = useState('#3b82f6');
  const [newProjectCustomerId, setNewProjectCustomerId] = useState<string | null>(null);
  const [projectSettingsName, setProjectSettingsName] = useState('');
  const [projectSettingsCode, setProjectSettingsCode] = useState('');
  const [projectSettingsColor, setProjectSettingsColor] = useState('#3b82f6');
  const [projectSettingsCustomerId, setProjectSettingsCustomerId] = useState<string | null>(null);
  const [projectSettingsConfirmOpen, setProjectSettingsConfirmOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [createCustomerOpen, setCreateCustomerOpen] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [editingCustomerName, setEditingCustomerName] = useState('');
  const [editingCustomerOriginalName, setEditingCustomerOriginalName] = useState('');
  const [renameCustomerOpen, setRenameCustomerOpen] = useState(false);
  const [renameCustomerConfirmOpen, setRenameCustomerConfirmOpen] = useState(false);
  const [deleteProjectTarget, setDeleteProjectTarget] = useState<Project | null>(null);
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [deleteMilestoneTarget, setDeleteMilestoneTarget] = useState<Milestone | null>(null);
  const [deleteMilestoneOpen, setDeleteMilestoneOpen] = useState(false);
  const [deleteCustomerTarget, setDeleteCustomerTarget] = useState<Customer | null>(null);
  const [deleteCustomerOpen, setDeleteCustomerOpen] = useState(false);

  const {
    projects,
    milestones,
    trackedProjectIds,
    customers,
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

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const {
    projectTasks,
    tasksLoading,
    tasksError,
    refetchTasks,
  } = useProjectTasksQuery({
    workspaceId: currentWorkspaceId,
    projectId: selectedProjectId,
  });

  const statusById = useMemo(
    () => new Map(statuses.map((status) => [status.id, status])),
    [statuses],
  );
  const assigneeById = useMemo(
    () => new Map(assignees.map((assignee) => [assignee.id, assignee])),
    [assignees],
  );
  const taskTypeById = useMemo(
    () => new Map(taskTypes.map((type) => [type.id, type])),
    [taskTypes],
  );
  const tagById = useMemo(
    () => new Map(tags.map((tag) => [tag.id, tag])),
    [tags],
  );

  const projectAssigneeIds = useMemo(() => {
    const ids = new Set<string>();
    projectTasks.forEach((task) => {
      task.assigneeIds.forEach((id) => ids.add(id));
    });
    return ids;
  }, [projectTasks]);

  const assigneeOptions = useMemo(
    () => assignees.filter((assignee) => projectAssigneeIds.has(assignee.id)),
    [assignees, projectAssigneeIds],
  );

  const customerProjectCounts = useMemo(
    () => buildCustomerProjectCounts(projects),
    [projects],
  );

  const filteredActiveProjects = useMemo(
    () => filterProjectsByCustomerAndSearch(activeProjects, customerFilterIds, projectSearch),
    [activeProjects, customerFilterIds, projectSearch],
  );

  const filteredArchivedProjects = useMemo(
    () => filterProjectsByCustomerAndSearch(archivedProjects, customerFilterIds, projectSearch),
    [archivedProjects, customerFilterIds, projectSearch],
  );

  const trackedProjectIdSet = useMemo(() => new Set(trackedProjectIds), [trackedProjectIds]);
  const todayMilestoneKey = format(new Date(), 'yyyy-MM-dd');

  const filteredMilestones = useMemo(
    () => filterAndSortMilestones({
      milestones,
      projectById,
      customerById,
      trackedProjectIdSet,
      milestoneSearch,
      nameSort,
    }),
    [customerById, milestoneSearch, milestones, nameSort, projectById, trackedProjectIdSet],
  );
  const { active: filteredActiveMilestones, past: filteredPastMilestones } = useMemo(
    () => splitMilestonesByDate(filteredMilestones, todayMilestoneKey),
    [filteredMilestones, todayMilestoneKey],
  );
  const visibleMilestones = milestoneTab === 'active' ? filteredActiveMilestones : filteredPastMilestones;
  const groupedMilestones = useMemo(
    () => buildGroupedMilestones({
      visibleMilestones,
      milestoneGroupBy,
      projectById,
      projects,
      sortedCustomers,
      trackedProjectIds,
      nameSort,
      dateLocale,
      labels: {
        unknownProject: t`Unknown project`,
        noCustomer: t`No customer`,
      },
    }),
    [dateLocale, milestoneGroupBy, nameSort, projectById, projects, sortedCustomers, trackedProjectIds, visibleMilestones],
  );
  const selectedMilestone = useMemo(
    () => milestones.find((milestone) => milestone.id === selectedMilestoneId) ?? null,
    [milestones, selectedMilestoneId],
  );
  const selectedMilestoneProject = useMemo(
    () => (selectedMilestone ? projectById.get(selectedMilestone.projectId) ?? null : null),
    [projectById, selectedMilestone],
  );
  const selectedMilestoneCustomer = useMemo(() => (
    selectedMilestoneProject?.customerId ? customerById.get(selectedMilestoneProject.customerId) ?? null : null
  ), [customerById, selectedMilestoneProject?.customerId]);
  const milestoneGroupLabel = useMemo(() => {
    if (milestoneGroupBy === 'project') return t`Project`;
    if (milestoneGroupBy === 'customer') return t`Customer`;
    return t`Month`;
  }, [milestoneGroupBy]);

  const selectedTask = useMemo(
    () => projectTasks.find((task) => task.id === selectedTaskId) ?? null,
    [projectTasks, selectedTaskId],
  );

  const selectedTaskProject = useMemo(
    () => projects.find((project) => project.id === selectedTask?.projectId) ?? null,
    [projects, selectedTask?.projectId],
  );
  const selectedCustomer = useMemo(
    () => (selectedCustomerId ? customerById.get(selectedCustomerId) ?? null : null),
    [customerById, selectedCustomerId],
  );
  const selectedCustomerProjects = useMemo(() => {
    if (!selectedCustomerId) return [];
    return sortProjectsByTracking(
      projects.filter((project) => project.customerId === selectedCustomerId),
      trackedProjectIds,
    );
  }, [projects, selectedCustomerId, trackedProjectIds]);
  const selectedTaskCustomer = useMemo(() => (
    selectedTaskProject?.customerId ? customerById.get(selectedTaskProject.customerId) ?? null : null
  ), [customerById, selectedTaskProject?.customerId]);

  const selectedTaskTags = useMemo(() => (
    selectedTask?.tagIds.map((tagId) => tagById.get(tagId)).filter(Boolean) ?? []
  ), [selectedTask?.tagIds, tagById]);

  const selectedTaskDescription = useMemo(() => {
    if (!selectedTask?.description) return '';
    if (!hasRichTags(selectedTask.description)) return selectedTask.description;
    return sanitizeTaskDescription(selectedTask.description);
  }, [selectedTask?.description]);

  const navigate = useNavigate();

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

  const filteredTasks = useMemo(() => (
    projectTasks.filter((task) => {
      if (search.trim()) {
        const query = search.trim().toLowerCase();
        if (!task.title.toLowerCase().includes(query)) return false;
      }
      if (statusFilterIds.length > 0 && !statusFilterIds.includes(task.statusId)) {
        return false;
      }
      if (assigneeFilterIds.length > 0) {
        if (!task.assigneeIds.some((id) => assigneeFilterIds.includes(id))) return false;
      }
      return true;
    })
  ), [assigneeFilterIds, projectTasks, search, statusFilterIds]);

  const displayTaskRows = useMemo<DisplayTaskRow[]>(() => (
    buildRepeatSeriesRows(filteredTasks).map((row) => ({
      key: row.key,
      task: row.task,
      repeatMeta: row.repeatMeta
        ? {
          cadence: row.repeatMeta.cadence,
          remaining: row.repeatMeta.remaining,
          total: row.repeatMeta.total,
        }
        : null,
    }))
  ), [filteredTasks]);

  const statusFilterLabel = statusFilterIds.length === 0
    ? t`All statuses`
    : t`${statusFilterIds.length} selected`;

  const assigneeFilterLabel = assigneeFilterIds.length === 0
    ? t`All assignees`
    : t`${assigneeFilterIds.length} selected`;

  const customerFilterLabel = customerFilterIds.length === 0
    ? t`All`
    : t`${customerFilterIds.length} selected`;

  const nameSortLabel = nameSort === 'asc' ? t`A-Z` : t`Z-A`;

  const handleToggleStatus = (statusId: string) => {
    setStatusFilterIds((current) => (
      current.includes(statusId)
        ? current.filter((id) => id !== statusId)
        : [...current, statusId]
    ));
  };

  const handleToggleAssignee = (assigneeId: string) => {
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

  const resetCreateProjectForm = useCallback(() => {
    setNewProjectName('');
    setNewProjectCode('');
    setNewProjectColor('#3b82f6');
    setNewProjectCustomerId(null);
    setEditingCustomerId(null);
    setEditingCustomerName('');
  }, []);

  const handleCreateProject = useCallback(async () => {
    if (!canEdit || !newProjectName.trim()) return;
    await addProject({
      name: newProjectName.trim(),
      code: newProjectCode.trim() ? newProjectCode.trim() : null,
      color: newProjectColor,
      archived: false,
      customerId: newProjectCustomerId,
    });
    setCreateProjectOpen(false);
    resetCreateProjectForm();
  }, [
    addProject,
    canEdit,
    newProjectCode,
    newProjectColor,
    newProjectCustomerId,
    newProjectName,
    resetCreateProjectForm,
  ]);

  const createCustomerByName = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!canEdit || !trimmed) return null;
    const normalized = trimmed.toLowerCase();
    const existing = customers.find((customer) => customer.name.trim().toLowerCase() === normalized);
    if (existing) return existing;
    return addCustomer({ name: trimmed });
  }, [addCustomer, canEdit, customers]);

  const handleAddCustomerFromTab = useCallback(async () => {
    if (!newCustomerName.trim()) return;
    const created = await createCustomerByName(newCustomerName);
    if (created) {
      setSelectedCustomerId(created.id);
    }
    setNewCustomerName('');
    setCreateCustomerOpen(false);
  }, [createCustomerByName, newCustomerName]);

  const startCustomerEdit = useCallback((customerId: string, customerName: string) => {
    if (!canEdit) return;
    setEditingCustomerId(customerId);
    setEditingCustomerName(customerName);
    setEditingCustomerOriginalName(customerName);
    setRenameCustomerOpen(true);
  }, [canEdit]);

  const commitCustomerEdit = useCallback(async (customerId: string) => {
    if (!canEdit) return;
    const nextName = editingCustomerName.trim();
    if (!nextName) {
      setEditingCustomerId(null);
      setEditingCustomerName('');
      setEditingCustomerOriginalName('');
      return;
    }
    setMutationError('');
    const result = await updateCustomer(customerId, { name: nextName });
    if (result?.error) {
      setMutationError(result.error);
      return;
    }
    setEditingCustomerId(null);
    setEditingCustomerName('');
    setEditingCustomerOriginalName('');
  }, [canEdit, editingCustomerName, updateCustomer]);

  const cancelCustomerEdit = useCallback(() => {
    setEditingCustomerId(null);
    setEditingCustomerName('');
    setEditingCustomerOriginalName('');
  }, []);
  const handleRenameCustomer = useCallback(async () => {
    if (!editingCustomerId) return;
    await commitCustomerEdit(editingCustomerId);
    setRenameCustomerOpen(false);
  }, [commitCustomerEdit, editingCustomerId]);
  const requestCloseRenameCustomer = useCallback(() => {
    if (
      editingCustomerId
      && editingCustomerName.trim()
      && editingCustomerName.trim() !== editingCustomerOriginalName.trim()
    ) {
      setRenameCustomerConfirmOpen(true);
      return;
    }
    setRenameCustomerOpen(false);
    cancelCustomerEdit();
  }, [cancelCustomerEdit, editingCustomerId, editingCustomerName, editingCustomerOriginalName]);

  const openProjectSettings = useCallback((project: Project) => {
    if (!canEdit) return;
    setProjectSettingsTarget(project);
    setProjectSettingsName(project.name);
    setProjectSettingsCode(project.code ?? '');
    setProjectSettingsColor(project.color);
    setProjectSettingsCustomerId(project.customerId ?? null);
    setProjectSettingsOpen(true);
  }, [canEdit]);

  const handleSaveProjectSettings = useCallback(async () => {
    if (!canEdit || !projectSettingsTarget) return;
    const nextName = projectSettingsName.trim();
    if (!nextName) return;
    const nextCode = projectSettingsCode.trim();
    const normalizedCode = nextCode ? nextCode : null;
    const updates: Partial<Project> = {};
    if (nextName !== projectSettingsTarget.name) updates.name = nextName;
    if ((projectSettingsTarget.code ?? null) !== normalizedCode) updates.code = normalizedCode;
    if (projectSettingsColor !== projectSettingsTarget.color) updates.color = projectSettingsColor;
    if (projectSettingsCustomerId !== projectSettingsTarget.customerId) {
      updates.customerId = projectSettingsCustomerId;
    }
    if (Object.keys(updates).length > 0) {
      setMutationError('');
      const result = await updateProject(projectSettingsTarget.id, updates);
      if (result?.error) {
        setMutationError(result.error);
        return;
      }
    }
    setProjectSettingsOpen(false);
  }, [
    canEdit,
    projectSettingsCode,
    projectSettingsColor,
    projectSettingsCustomerId,
    projectSettingsName,
    projectSettingsTarget,
    updateProject,
  ]);

  const projectSettingsHasUnsavedChanges = useMemo(() => {
    if (!projectSettingsTarget) return false;
    const nextName = projectSettingsName.trim();
    const nextCode = projectSettingsCode.trim();
    const normalizedCode = nextCode ? nextCode : null;

    if (nextName !== projectSettingsTarget.name.trim()) return true;
    if ((projectSettingsTarget.code ?? null) !== normalizedCode) return true;
    if (projectSettingsColor !== projectSettingsTarget.color) return true;
    if (projectSettingsCustomerId !== projectSettingsTarget.customerId) return true;

    return false;
  }, [
    projectSettingsCode,
    projectSettingsColor,
    projectSettingsCustomerId,
    projectSettingsName,
    projectSettingsTarget,
  ]);

  const requestCloseProjectSettings = useCallback(() => {
    if (projectSettingsHasUnsavedChanges) {
      setProjectSettingsConfirmOpen(true);
      return;
    }
    setProjectSettingsOpen(false);
  }, [projectSettingsHasUnsavedChanges]);

  const createProjectHasUnsavedChanges = useMemo(() => (
    newProjectName.trim().length > 0
    || newProjectCode.trim().length > 0
    || newProjectColor !== '#3b82f6'
    || newProjectCustomerId !== null
  ), [newProjectCode, newProjectColor, newProjectCustomerId, newProjectName]);

  const requestCloseCreateProject = useCallback(() => {
    if (createProjectHasUnsavedChanges) {
      setCreateProjectConfirmOpen(true);
      return;
    }
    setCreateProjectOpen(false);
  }, [createProjectHasUnsavedChanges]);

  const requestDeleteProject = useCallback((project: Project) => {
    if (!canEdit) return;
    setDeleteProjectTarget(project);
    setDeleteProjectOpen(true);
  }, [canEdit]);

  const handleConfirmDeleteProject = useCallback(async () => {
    if (!deleteProjectTarget) return;
    setMutationError('');
    const result = await deleteProject(deleteProjectTarget.id);
    if (result?.error) {
      setMutationError(result.error);
      return;
    }
    setDeleteProjectOpen(false);
    setDeleteProjectTarget(null);
  }, [deleteProject, deleteProjectTarget]);

  const handleToggleProjectArchived = useCallback(async (project: Project) => {
    setMutationError('');
    const result = await updateProject(project.id, { archived: !project.archived });
    if (result?.error) {
      setMutationError(result.error);
    }
  }, [updateProject]);

  const formatMilestoneDate = useCallback((date: string) => (
    format(parseISO(date), 'dd MMM yyyy', { locale: dateLocale })
  ), [dateLocale]);

  const handleCycleMilestoneGroup = useCallback(() => {
    setMilestoneGroupBy((current) => {
      if (current === 'project') return 'customer';
      if (current === 'customer') return 'month';
      return 'project';
    });
  }, [setMilestoneGroupBy]);

  const handleOpenProjectFromMilestone = useCallback((milestone: Milestone) => {
    const project = projectById.get(milestone.projectId);
    if (!project) return;
    setMode('projects');
    setTab(project.archived ? 'archived' : 'active');
    setSelectedProjectId(project.id);
  }, [projectById]);

  const handleOpenCreateMilestone = useCallback(() => {
    setEditingMilestone(null);
    setMilestoneDialogDate(selectedMilestone?.date ?? format(new Date(), 'yyyy-MM-dd'));
    setMilestoneDialogOpen(true);
  }, [selectedMilestone?.date]);

  const handleOpenMilestoneSettings = useCallback((milestone: Milestone) => {
    setEditingMilestone(milestone);
    setMilestoneDialogDate(null);
    setMilestoneDialogOpen(true);
  }, []);

  const handleMilestoneDialogOpenChange = useCallback((open: boolean) => {
    setMilestoneDialogOpen(open);
    if (!open) {
      setEditingMilestone(null);
      setMilestoneDialogDate(null);
    }
  }, []);

  const requestDeleteMilestone = useCallback((milestone: Milestone) => {
    if (!canEdit) return;
    setDeleteMilestoneTarget(milestone);
    setDeleteMilestoneOpen(true);
  }, [canEdit]);

  const handleConfirmDeleteMilestone = useCallback(async () => {
    if (!deleteMilestoneTarget) return;
    setMutationError('');
    const result = await deleteMilestone(deleteMilestoneTarget.id);
    if (result?.error) {
      setMutationError(result.error);
      return;
    }
    if (selectedMilestoneId === deleteMilestoneTarget.id) {
      setSelectedMilestoneId(null);
    }
    setDeleteMilestoneOpen(false);
    setDeleteMilestoneTarget(null);
  }, [deleteMilestone, deleteMilestoneTarget, selectedMilestoneId]);

  const requestDeleteCustomer = useCallback((customer: Customer) => {
    if (!canEdit) return;
    setDeleteCustomerTarget(customer);
    setDeleteCustomerOpen(true);
  }, [canEdit]);

  const handleConfirmDeleteCustomer = useCallback(async () => {
    if (!deleteCustomerTarget) return;
    setMutationError('');
    const result = await deleteCustomer(deleteCustomerTarget.id);
    if (result?.error) {
      setMutationError(result.error);
      return;
    }
    if (selectedCustomerId === deleteCustomerTarget.id) {
      setSelectedCustomerId(null);
    }
    setDeleteCustomerOpen(false);
    setDeleteCustomerTarget(null);
  }, [deleteCustomer, deleteCustomerTarget, selectedCustomerId]);

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

  const handleOpenProjectFromCustomer = useCallback((project: Project) => {
    setMode('projects');
    setTab(project.archived ? 'archived' : 'active');
    setSelectedProjectId(project.id);
  }, []);

  if (isSuperAdmin) {
    return <Navigate to="/app/admin/users" replace />;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <WorkspaceSwitcher />
          <WorkspaceNav />
        </div>
        <div className="flex items-center gap-2">
          {mode === 'customers' ? (
            <Button
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
              onClick={() => setCreateProjectOpen(true)}
              size="sm"
              className="gap-2"
              disabled={!canEdit}
            >
              <Plus className="h-4 w-4" />
              {t`New project`}
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowSettings(true)}
            className="h-9 w-9"
            disabled={!canEdit}
          >
            <Settings className="h-4 w-4" />
          </Button>
          <InviteNotifications />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowAccountSettings(true)}
            className="h-9 w-9"
          >
            <User className="h-4 w-4" />
          </Button>
        </div>
      </header>

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

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <ResizablePanelGroup
          direction="horizontal"
          autoSaveId="projects-layout-split"
          className="flex-1 min-h-0"
        >
          <ResizablePanel defaultSize={28} minSize={18} maxSize={42} className="min-w-[260px]">
            <ProjectsSidebar
              mode={mode}
              onModeChange={setMode}
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
              onSelectCustomer={setSelectedCustomerId}
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
              onSelectMilestone={setSelectedMilestoneId}
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
              onSelectProject={setSelectedProjectId}
              onToggleTrackedProject={(projectId, nextTracked) => {
                void toggleTrackedProject(projectId, nextTracked);
              }}
              onOpenProjectSettings={openProjectSettings}
              onRequestDeleteProject={requestDeleteProject}
              onToggleProjectArchived={handleToggleProjectArchived}
              groupProjects={groupedProjects}
            />
          </ResizablePanel>
          <ResizableHandle withHandle className="bg-border/70" />
          <ResizablePanel defaultSize={72} minSize={58}>
            <ProjectsMainPanel
              mode={mode}
              selectedProject={selectedProject}
              customerById={customerById}
              search={search}
              onSearchChange={setSearch}
              statusFilterLabel={statusFilterLabel}
              setStatusPreset={setStatusPreset}
              statuses={statuses}
              statusFilterIds={statusFilterIds}
              onToggleStatus={handleToggleStatus}
              assigneeFilterLabel={assigneeFilterLabel}
              assigneeOptions={assigneeOptions}
              assigneeFilterIds={assigneeFilterIds}
              onToggleAssignee={handleToggleAssignee}
              onClearFilters={() => {
                setSearch('');
                setStatusFilterIds([]);
                setAssigneeFilterIds([]);
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
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

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
        handleSaveProjectSettings={handleSaveProjectSettings}
        projectSettingsConfirmOpen={projectSettingsConfirmOpen}
        setProjectSettingsConfirmOpen={setProjectSettingsConfirmOpen}
        milestoneDialogOpen={milestoneDialogOpen}
        handleMilestoneDialogOpenChange={handleMilestoneDialogOpenChange}
        milestoneDialogDate={milestoneDialogDate}
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
