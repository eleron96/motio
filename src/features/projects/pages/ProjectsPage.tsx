import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { ProjectsDialogs } from '@/features/projects/components/ProjectsDialogs';
import { ProjectsMainPanel } from '@/features/projects/components/ProjectsMainPanel';
import { ProjectsDesktopSidebar } from '@/features/projects/components/ProjectsDesktopSidebar';
import { ProjectsMobileView } from '@/features/projects/components/ProjectsMobileView';
import { ProjectsModeTabs } from '@/features/projects/components/ProjectsModeTabs';
import { ProjectsPrimaryAction } from '@/features/projects/components/ProjectsPrimaryAction';
import { ContactsPeoplePanel } from '@/features/projects/components/ContactsPeoplePanel';
import { AddTaskDialog } from '@/features/planner/components/AddTaskDialog';
import { useProjectsViewPreferences } from '@/features/projects/hooks/useProjectsViewPreferences';
import { useProjectsPageEffects } from '@/features/projects/hooks/useProjectsPageEffects';
import { usePlannerLookupMaps } from '@/features/planner/hooks/usePlannerLookupMaps';
import { useProjectSelection } from '@/features/projects/hooks/useProjectSelection';
import { useMilestoneActions } from '@/features/projects/hooks/useMilestoneActions';
import { useProjectMutations } from '@/features/projects/hooks/useProjectMutations';
import { useCustomerActions } from '@/features/projects/hooks/useCustomerActions';
import { useProjectCreateForm } from '@/features/projects/hooks/useProjectCreateForm';
import { useProjectGroupSync } from '@/features/projects/hooks/useProjectGroupSync';
import { useProjectRecordActions } from '@/features/projects/hooks/useProjectRecordActions';
import { useProjectTasksView } from '@/features/projects/hooks/useProjectTasksView';
import { useContactsDirectory } from '@/features/projects/hooks/useContactsDirectory';
import { useProjectsLists } from '@/features/projects/hooks/useProjectsLists';
import { useMilestoneDeepLink } from '@/features/projects/hooks/useMilestoneDeepLink';
import { useOpenProjectTaskInTimeline } from '@/features/projects/hooks/useOpenProjectTaskInTimeline';
import { useWorkspaceHeader } from '@/features/workspace/components/WorkspaceLayout';
import { Button } from '@/shared/ui/button';
import { t } from '@lingui/macro';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/shared/ui/resizable';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { Milestone, Project } from '@/features/planner/types/planner';
import { useLocaleStore } from '@/shared/store/localeStore';
import { resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';
import { usePageSeo } from '@/shared/lib/seo/usePageSeo';
import { useIsMobile } from '@/shared/hooks/use-mobile';

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
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  // Two levels on a phone: the deck of lists, and the detail pushed on top.
  const [mobileProjectScreenOpen, setMobileProjectScreenOpen] = useState(false);
  const [mobileProjectFiltersOpen, setMobileProjectFiltersOpen] = useState(false);
  const [mobileCustomerScreenOpen, setMobileCustomerScreenOpen] = useState(false);
  // Bumped to ask the contacts panel to open its new-contact form; the button
  // itself belongs to the page header so it floats like every other one.
  const [contactCreateRequest, setContactCreateRequest] = useState(0);
  const isMobile = useIsMobile();

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
    addCustomer,
    updateCustomer,
    deleteCustomer,
    deleteProject,
    deleteMilestone,
    toggleTrackedProject,
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
    addCustomer: state.addCustomer,
    updateCustomer: state.updateCustomer,
    deleteCustomer: state.deleteCustomer,
    deleteProject: state.deleteProject,
    deleteMilestone: state.deleteMilestone,
    toggleTrackedProject: state.toggleTrackedProject,
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
  // Sort, tab, mode, selection and filters, kept per user across reloads.
  const preferences = useProjectsViewPreferences({
    currentWorkspaceId,
    userId: user?.id,
  });
  const {
    tab,
    setTab,
    mode,
    setMode,
    selectedProjectId,
    setSelectedProjectId,
    selectedCustomerId,
    setSelectedCustomerId,
  } = preferences;

  useEffect(() => {
    if (currentWorkspaceId) {
      loadWorkspaceData(currentWorkspaceId);
    }
  }, [currentWorkspaceId, loadWorkspaceData]);

  useMilestoneDeepLink({ milestones, preferences, setSelectedMilestoneId });

  const { addProjectWithGroupSync, updateProjectWithGroupSync } = useProjectGroupSync();

  const projectMutations = useProjectMutations({
    canEdit,
    updateProject: updateProjectWithGroupSync,
    deleteProject,
    setMutationError,
  });
  const {
    projectSettingsOpen,
    setProjectSettingsTarget,
    setProjectSettingsConfirmOpen,
    deleteProjectTarget,
    openProjectSettings,
    requestDeleteProject,
    handleToggleProjectArchived,
  } = projectMutations;

  const customerActions = useCustomerActions({
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
    setCreateCustomerOpen,
    setEditingCustomerId,
    setEditingCustomerName,
    deleteCustomerTarget,
    startCustomerEdit,
    requestDeleteCustomer,
  } = customerActions;

  const createProjectForm = useProjectCreateForm({
    canEdit,
    addProject: addProjectWithGroupSync,
    setEditingCustomerId,
    setEditingCustomerName,
  });
  const {
    createProjectOpen,
    setCreateProjectOpen,
    setCreateProjectConfirmOpen,
    resetCreateProjectForm,
  } = createProjectForm;

  const lists = useProjectsLists({ preferences, dateLocale });
  const {
    activeProjects,
    archivedProjects,
    filteredActiveProjects,
    filteredArchivedProjects,
    filteredCustomers,
    visibleMilestones,
    customerById,
    projectById,
    trackedProjectIdSet,
    formatMilestoneDate,
  } = lists;

  const {
    contactEntries,
    companyBuckets,
    effectiveCompanyKey,
    companyFilteredEntries,
    contactSearch,
    handleContactSearchChange,
    setSelectedCompanyKey,
    selectedCompanyBucket,
    contactsPanelTitle,
  } = useContactsDirectory({ customerContacts, projectMemberRows, customerById });

  const { statusById, assigneeById, taskTypeById, tagById } = usePlannerLookupMaps({
    statuses, assignees, taskTypes, tags,
  });

  const projectTasksView = useProjectTasksView({
    workspaceId: currentWorkspaceId,
    projectId: selectedProjectId,
    assigneeById,
  });
  const { projectTasks, displayTaskRows, projectMembers, refetchTasks } = projectTasksView;

  const projectMilestones = useMemo(() => (
    selectedProjectId
      ? milestones.filter((milestone) => milestone.projectId === selectedProjectId)
      : []
  ), [milestones, selectedProjectId]);

  const today = useMemo(() => new Date(), []);

  const {
    handleAddCustomerContact,
    handleDeleteCustomerContact,
    handleUpdateCustomerContact,
    handleUpdateExternalPerson,
    handleDeleteExternalPerson,
    handleAddProjectMember,
    handleUpdateExternalMember,
    handleRemoveProjectMember,
    handleUpdateAssigneeContact,
    handleAddProjectActivity,
    handleUpdateProjectActivity,
    handleDeleteProjectActivity,
    handleSetProjectActivityPinned,
    formatActivityTimestamp,
    handleSaveProjectStatus,
  } = useProjectRecordActions({ setMutationError, dateLocale });

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

  const milestoneActions = useMilestoneActions({
    canEdit,
    selectedMilestone,
    selectedMilestoneId,
    setSelectedMilestoneId,
    deleteMilestone,
    setMutationError,
  });
  const {
    deleteMilestoneTarget,
    handleOpenCreateMilestone,
    handleOpenCreateMilestoneForProject,
    handleOpenMilestoneSettings,
    requestDeleteMilestone,
  } = milestoneActions;

  const handleOpenTaskInTimeline = useOpenProjectTaskInTimeline({ selectedTask, setSelectedTaskId });

  const selectedTaskRepeatMeta = useMemo(() => {
    if (!selectedTaskId) return null;
    const row = displayTaskRows.find((entry) => entry.taskIds.includes(selectedTaskId));
    return row?.repeatMeta ?? null;
  }, [displayTaskRows, selectedTaskId]);

  const handleOpenProjectFromMilestone = useCallback((milestone: Milestone) => {
    const project = projectById.get(milestone.projectId);
    if (!project) return;
    setMode('projects');
    setTab(project.archived ? 'archived' : 'active');
    setSelectedProjectId(project.id);
  }, [projectById, setMode, setSelectedProjectId, setTab]);

  const handleOpenProjectFromCustomer = useCallback((project: Project) => {
    setMode('projects');
    setTab(project.archived ? 'archived' : 'active');
    setSelectedProjectId(project.id);
  }, [setMode, setSelectedProjectId, setTab]);

  const handleToggleTrackedProject = (projectId: string, nextTracked: boolean) => {
    void toggleTrackedProject(projectId, nextTracked);
  };

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

  const contactsPanel = (
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
      {...projectTasksView.panelProps}
      onAddTask={selectedProjectId ? () => setAddTaskOpen(true) : undefined}
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
      onToggleProjectTracked={handleToggleTrackedProject}
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
      // The desktop contacts tab has its own "Add contact" inside the panel.
      primaryAction: mode === 'contacts' && !isMobile ? null : (
        <ProjectsPrimaryAction
          mode={mode}
          isMobile={isMobile}
          canEdit={canEdit}
          onNewContact={() => setContactCreateRequest((current) => current + 1)}
          onNewCustomer={() => setCreateCustomerOpen(true)}
          onNewMilestone={handleOpenCreateMilestone}
          onNewProject={() => setCreateProjectOpen(true)}
        />
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
        <ProjectsMobileView
          lists={lists}
          preferences={preferences}
          canEdit={canEdit}
          projects={projects}
          milestones={milestones}
          memberGroups={memberGroups}
          selectedProject={selectedProject}
          selectedCustomer={selectedCustomer}
          projectScreenOpen={mobileProjectScreenOpen}
          onProjectScreenOpenChange={setMobileProjectScreenOpen}
          filtersScreenOpen={mobileProjectFiltersOpen}
          onFiltersScreenOpenChange={setMobileProjectFiltersOpen}
          customerScreenOpen={mobileCustomerScreenOpen}
          onCustomerScreenOpenChange={setMobileCustomerScreenOpen}
          contactsPanel={contactsPanel}
          renderMainPanel={renderProjectsMainPanel}
          onToggleTracked={handleToggleTrackedProject}
          onOpenProjectSettings={openProjectSettings}
          onToggleProjectArchived={handleToggleProjectArchived}
          onRequestDeleteProject={requestDeleteProject}
          onOpenProjectFromMilestone={handleOpenProjectFromMilestone}
          onOpenMilestoneSettings={handleOpenMilestoneSettings}
          onRequestDeleteMilestone={requestDeleteMilestone}
        />
      ) : (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <ResizablePanelGroup
            direction="horizontal"
            autoSaveId="projects-layout-split"
            className="flex-1 min-h-0"
          >
            <ResizablePanel defaultSize={28} minSize={18} maxSize={42} className="min-w-[260px]">
              <ProjectsDesktopSidebar
                lists={lists}
                preferences={preferences}
                modeTabs={<ProjectsModeTabs mode={mode} onModeChange={setMode} />}
                canEdit={canEdit}
                milestones={milestones}
                memberGroups={memberGroups}
                selectedMilestoneId={selectedMilestoneId}
                onSelectMilestone={(milestoneId) => {
                  setSelectedMilestoneId(milestoneId);
                }}
                contacts={{
                  companyBuckets,
                  contactSearch,
                  onContactSearchChange: handleContactSearchChange,
                  selectedCompanyKey: effectiveCompanyKey,
                  onSelectCompany: (key) => {
                    setSelectedCompanyKey(key);
                  },
                }}
                onOpenProjectSettings={openProjectSettings}
                onToggleProjectArchived={handleToggleProjectArchived}
                onRequestDeleteProject={requestDeleteProject}
                onToggleTrackedProject={handleToggleTrackedProject}
                onStartCustomerEdit={startCustomerEdit}
                onRequestDeleteCustomer={requestDeleteCustomer}
                onOpenMilestoneSettings={handleOpenMilestoneSettings}
                onOpenProjectFromMilestone={handleOpenProjectFromMilestone}
                onRequestDeleteMilestone={requestDeleteMilestone}
              />
            </ResizablePanel>
            <ResizableHandle withHandle className="bg-border/70" />
            <ResizablePanel defaultSize={72} minSize={58}>
              {mode === 'contacts' ? contactsPanel : renderProjectsMainPanel()}
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      )}

      <ProjectsDialogs
        {...projectMutations}
        {...customerActions}
        {...createProjectForm}
        {...milestoneActions}
        canEdit={canEdit}
        showSettings={showSettings}
        setShowSettings={setShowSettings}
        showAccountSettings={showAccountSettings}
        setShowAccountSettings={setShowAccountSettings}
        memberGroups={memberGroups}
        customers={customers}
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
        deleteProjectLabel={deleteProjectLabel}
        deleteMilestoneLabel={deleteMilestoneLabel}
        deleteCustomerLabel={deleteCustomerLabel}
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
