import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore, WorkspaceRole } from '@/features/auth/store/authStore';
import { useWorkspaceHeader } from '@/features/workspace/components/WorkspaceLayout';
import { Button } from '@/shared/ui/button';
import { t } from '@lingui/macro';
import { format } from 'date-fns';
import { Plus } from 'lucide-react';
import { WorkspaceMembersPanel } from '@/features/workspace/components/WorkspaceMembersPanel';
import { MembersSidebar } from '@/features/members/components/MembersSidebar';
import { MemberTasksPanel } from '@/features/members/components/MemberTasksPanel';
import { MembersDialogs } from '@/features/members/components/MembersDialogs';
import { MembersGroupPanel } from '@/features/members/components/MembersGroupPanel';
import { hasRichTags, sanitizeTaskDescription } from '@/shared/domain/taskDescription';
import { usePageSeo } from '@/shared/lib/seo/usePageSeo';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { MobilePageSheetLayout } from '@/shared/ui/mobile-page-sheet-layout';
import { MobilePillSubnav, type MobilePillSubnavItem } from '@/shared/ui/mobile-pill-subnav';
import { usePlannerLookupMaps } from '@/features/planner/hooks/usePlannerLookupMaps';
import { useDisplayTaskRows, countTaskUnits, pickNearestRepeatTaskFromToday } from '@/features/planner/hooks/useDisplayTaskRows';
import { Task } from '@/features/planner/types/planner';
import { useTaskScopeFilter } from '@/features/planner/hooks/useTaskScopeFilter';
import { useMembersFilter } from '@/features/members/hooks/useMembersFilter';
import { useMemberGroups } from '@/features/members/hooks/useMemberGroups';
import { useMembersPageMode } from '@/features/members/hooks/useMembersPageMode';
import { useMemberTaskFetcher } from '@/features/members/hooks/useMemberTaskFetcher';
import { useOnboardingTour } from '@/features/onboarding/hooks/useOnboardingTour';

type AccessTab = 'active' | 'disabled' | 'history';

const MembersPage = () => {
  usePageSeo({
    title: 'Motio — Team',
    description: 'Private team workspace in Motio.',
    canonicalPath: '/app/members',
    robots: 'noindex, nofollow',
  });

  const [showSettings, setShowSettings] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [tab, setTab] = useState<'active' | 'disabled'>('active');
  const [mode, setMode] = useState<'tasks' | 'access' | 'groups'>('tasks');
  const [accessTab, setAccessTab] = useState<AccessTab>('active');
  const [accessSearch, setAccessSearch] = useState('');
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [projectFilterIds, setProjectFilterIds] = useState<string[]>([]);
  const {
    taskScope, setTaskScope,
    pastFromDate, setPastFromDate,
    pastToDate, setPastToDate,
    pastSort, setPastSort,
    pageIndex, setPageIndex,
    statusFilterIds, setStatusFilterIds,
  } = useTaskScopeFilter();
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const pageSize = 100;
  const isMobile = useIsMobile();

  const {
    assignees,
    memberGroupAssignments,
    projects,
    statuses,
    taskTypes,
    tags,
    taskCommentCounts,
    loadWorkspaceData,
    refreshTaskCommentCounts,
    fetchAssigneeTaskCounts,
    fetchMemberGroups,
    fetchGroupMembers,
    createMemberGroup,
    updateMemberGroup,
    deleteMemberGroup,
    deleteTasks,
    setHighlightedTaskTarget,
    setPlannerSelectedTaskId,
    setGroupMode,
    setViewMode,
    setCurrentDate,
    requestScrollToDate,
    clearFilters,
  } = usePlannerStore(useShallow((state) => ({
    assignees: state.assignees,
    memberGroupAssignments: state.memberGroupAssignments,
    projects: state.projects,
    statuses: state.statuses,
    taskTypes: state.taskTypes,
    tags: state.tags,
    taskCommentCounts: state.taskCommentCounts,
    loadWorkspaceData: state.loadWorkspaceData,
    refreshTaskCommentCounts: state.refreshTaskCommentCounts,
    fetchAssigneeTaskCounts: state.fetchAssigneeTaskCounts,
    fetchMemberGroups: state.fetchMemberGroups,
    fetchGroupMembers: state.fetchGroupMembers,
    createMemberGroup: state.createMemberGroup,
    updateMemberGroup: state.updateMemberGroup,
    deleteMemberGroup: state.deleteMemberGroup,
    deleteTasks: state.deleteTasks,
    setHighlightedTaskTarget: state.setHighlightedTaskTarget,
    setPlannerSelectedTaskId: state.setSelectedTaskId,
    setGroupMode: state.setGroupMode,
    setViewMode: state.setViewMode,
    setCurrentDate: state.setCurrentDate,
    requestScrollToDate: state.requestScrollToDate,
    clearFilters: state.clearFilters,
  })));

  const {
    user,
    members,
    currentWorkspaceId,
    currentWorkspaceRole,
    isSuperAdmin,
    assignMemberToGroup,
  } = useAuthStore(useShallow((state) => ({
    user: state.user,
    members: state.members,
    currentWorkspaceId: state.currentWorkspaceId,
    currentWorkspaceRole: state.currentWorkspaceRole,
    isSuperAdmin: state.isSuperAdmin,
    assignMemberToGroup: state.updateMemberGroup,
  })));

  const canEdit = currentWorkspaceRole === 'editor' || currentWorkspaceRole === 'admin';
  const isAdmin = currentWorkspaceRole === 'admin';
  const prepareMembersAccess = useCallback(() => {
    setMode('access');
  }, []);

  useOnboardingTour({
    pageId: 'members',
    isAdmin,
    prepareMembersAccess,
  });

  const roleLabels: Record<WorkspaceRole, string> = {
    admin: t`Admin`,
    editor: t`Editor`,
    viewer: t`Viewer`,
  };
  const navigate = useNavigate();

  useEffect(() => {
    if (currentWorkspaceId) {
      loadWorkspaceData(currentWorkspaceId);
    }
  }, [currentWorkspaceId, loadWorkspaceData]);

  useMembersPageMode({
    mode,
    setMode,
    currentWorkspaceId,
    userId: user?.id,
    isAdmin,
  });

  const {
    groups,
    groupsLoading,
    groupsError,
    groupSort,
    setGroupSort,
    groupSearch,
    setGroupSearch,
    selectedGroupId,
    setSelectedGroupId,
    groupMembers,
    groupMembersLoading,
    groupMembersError,
    newGroupName,
    setNewGroupName,
    creatingGroup,
    setCreatingGroup,
    groupActionLoading,
    editingGroupId,
    setEditingGroupId,
    editingGroupName,
    setEditingGroupName,
    selectedGroup,
    sortedGroups,
    handleCreateGroup,
    handleStartEditGroup,
    handleSaveGroupName,
    handleDeleteGroup,
    handleAddMemberToGroup,
    handleRemoveMemberFromGroup,
  } = useMemberGroups({
    currentWorkspaceId,
    isAdmin,
    fetchMemberGroups,
    fetchGroupMembers,
    createMemberGroup,
    updateMemberGroup,
    deleteMemberGroup,
    assignMemberToGroup,
    mode,
  });

  const {
    memberSearch,
    setMemberSearch,
    memberSort,
    setMemberSort,
    memberGroupBy,
    setMemberGroupBy,
    activeMemberGroups,
    disabledMemberGroups,
    activeVisibleAssignees,
    disabledVisibleAssignees,
  } = useMembersFilter({
    assignees,
    memberGroupAssignments,
    groups,
    currentWorkspaceId,
    userId: user?.id,
  });

  const memberSortLabel = memberSort === 'asc' ? t`A-Z` : t`Z-A`;
  const groupSortLabel = groupSort === 'asc' ? t`A-Z` : t`Z-A`;

  useEffect(() => {
    const list = tab === 'active' ? activeVisibleAssignees : disabledVisibleAssignees;
    if (list.length === 0) {
      setSelectedAssigneeId(null);
      return;
    }
    if (!selectedAssigneeId || !list.some((assignee) => assignee.id === selectedAssigneeId)) {
      setSelectedAssigneeId(list[0].id);
    }
  }, [activeVisibleAssignees, disabledVisibleAssignees, selectedAssigneeId, tab]);

  const selectedAssignee = useMemo(
    () => assignees.find((assignee) => assignee.id === selectedAssigneeId) ?? null,
    [assignees, selectedAssigneeId],
  );

  const { statusById, assigneeById, taskTypeById, tagById } = usePlannerLookupMaps({
    statuses, assignees, taskTypes, tags,
  });
  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );
  const assigneeByUserId = useMemo(() => {
    const map = new Map<string, typeof assignees[number]>();
    assignees.forEach((assignee) => {
      if (assignee.userId) {
        map.set(assignee.userId, assignee);
      }
    });
    return map;
  }, [assignees]);

  const {
    assigneeTasks,
    setAssigneeTasks,
    tasksLoading,
    setTasksLoading,
    tasksError,
    setTasksError,
    totalCount,
    setTotalCount,
    memberTaskCounts,
    memberTaskCountsDate,
    fetchAssigneeTasks,
    refreshMemberTaskCounts,
  } = useMemberTaskFetcher({
    currentWorkspaceId,
    selectedAssigneeId,
    mode,
    taskScope,
    pastFromDate,
    pastToDate,
    pastSort,
    statusFilterIds,
    projectFilterIds,
    search,
    pageIndex,
    pageSize,
    fetchAssigneeTaskCounts,
  });

  const assigneeProjectIds = useMemo(() => {
    const ids = new Set<string>();
    assigneeTasks.forEach((task) => {
      if (task.projectId) ids.add(task.projectId);
    });
    return ids;
  }, [assigneeTasks]);

  const projectOptions = useMemo(
    () => [...projects].sort((a, b) => a.name.localeCompare(b.name)),
    [projects],
  );
  const activeAccessCount = useMemo(
    () => members.filter((member) => assigneeByUserId.get(member.userId)?.isActive ?? true).length,
    [assigneeByUserId, members],
  );
  const disabledAccessCount = useMemo(
    () => members.filter((member) => !(assigneeByUserId.get(member.userId)?.isActive ?? true)).length,
    [assigneeByUserId, members],
  );

  useEffect(() => {
    setSelectedTaskIds(new Set());
  }, [selectedAssigneeId, pageIndex, projectFilterIds, search, statusFilterIds, taskScope, pastFromDate, pastToDate, pastSort]);

  useEffect(() => {
    if (!selectedTaskId) return;
    if (!assigneeTasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(null);
    }
  }, [assigneeTasks, selectedTaskId]);

  const displayTaskRows = useDisplayTaskRows(assigneeTasks, taskScope);

  const visibleTaskIds = useMemo(
    () => displayTaskRows.flatMap((row) => row.taskIds),
    [displayTaskRows],
  );

  useEffect(() => {
    if (!currentWorkspaceId || visibleTaskIds.length === 0) {
      return;
    }

    void refreshTaskCommentCounts(currentWorkspaceId, visibleTaskIds);
  }, [currentWorkspaceId, refreshTaskCommentCounts, visibleTaskIds]);

  useEffect(() => {
    if (!currentWorkspaceId || !selectedTaskId) {
      return;
    }

    void refreshTaskCommentCounts(currentWorkspaceId, [selectedTaskId]);
  }, [currentWorkspaceId, refreshTaskCommentCounts, selectedTaskId]);

  const selectedTask = useMemo(
    () => assigneeTasks.find((task) => task.id === selectedTaskId) ?? null,
    [assigneeTasks, selectedTaskId],
  );
  const selectedTaskProject = useMemo(
    () => projects.find((project) => project.id === selectedTask?.projectId) ?? null,
    [projects, selectedTask?.projectId],
  );
  const selectedTaskTags = useMemo(() => (
    selectedTask?.tagIds
      .map((tagId) => tagById.get(tagId))
      .filter((tag): tag is NonNullable<typeof tag> => tag != null) ?? []
  ), [selectedTask?.tagIds, tagById]);
  const selectedTaskDescription = useMemo(() => {
    if (!selectedTask?.description) return '';
    if (!hasRichTags(selectedTask.description)) return selectedTask.description;
    return sanitizeTaskDescription(selectedTask.description);
  }, [selectedTask?.description]);
  const selectedTaskCommentCount = selectedTask ? taskCommentCounts[selectedTask.id] : undefined;

  const allVisibleSelected = visibleTaskIds.length > 0 && visibleTaskIds.every((id) => selectedTaskIds.has(id));
  const someVisibleSelected = visibleTaskIds.some((id) => selectedTaskIds.has(id));
  const selectedCount = selectedTaskIds.size;
  const totalPages = taskScope === 'past'
    ? Math.max(1, Math.ceil(totalCount / pageSize))
    : 1;
  const displayTotalCount = taskScope === 'current'
    ? countTaskUnits(assigneeTasks)
    : totalCount;

  const statusFilterLabel = statusFilterIds.length === 0
    ? t`All statuses`
    : t`${statusFilterIds.length} selected`;

  const projectFilterLabel = projectFilterIds.length === 0
    ? t`All projects`
    : t`${projectFilterIds.length} selected`;

  const handleOpenTaskInTimeline = useCallback(() => {
    if (!selectedTask || !selectedAssigneeId) return;
    const timelineTask = pickNearestRepeatTaskFromToday(selectedTask, assigneeTasks);
    setPlannerSelectedTaskId(null);
    setHighlightedTaskTarget(timelineTask.id, selectedAssigneeId);
    clearFilters();
    if (user?.id && typeof window !== 'undefined') {
      window.localStorage.removeItem(`planner-filters-${user.id}`);
    }
    setGroupMode('assignee');
    setViewMode('day');
    setCurrentDate(timelineTask.startDate);
    requestScrollToDate(timelineTask.startDate);
    setSelectedTaskId(null);
    navigate('/app');
  }, [
    assigneeTasks,
    clearFilters,
    navigate,
    requestScrollToDate,
    selectedAssigneeId,
    selectedTask,
    setGroupMode,
    setHighlightedTaskTarget,
    setPlannerSelectedTaskId,
    setCurrentDate,
    setSelectedTaskId,
    setViewMode,
    user?.id,
  ]);

  const handleToggleStatus = (statusId: string) => {
    setStatusFilterIds((current) => (
      current.includes(statusId)
        ? current.filter((id) => id !== statusId)
        : [...current, statusId]
    ));
    setPageIndex(1);
  };

  const handleToggleProject = (projectId: string) => {
    setProjectFilterIds((current) => (
      current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [...current, projectId]
    ));
    setPageIndex(1);
  };

  const setStatusPreset = (mode: 'all' | 'open' | 'done') => {
    if (mode === 'all') {
      setStatusFilterIds([]);
      setPageIndex(1);
      return;
    }
    const targetIds = statuses
      .filter((status) => (mode === 'done'
        ? (status.isFinal || status.isCancelled)
        : (!status.isFinal && !status.isCancelled)))
      .map((status) => status.id);
    setStatusFilterIds(targetIds);
    setPageIndex(1);
  };

  const handleToggleAll = (value: boolean | 'indeterminate') => {
    if (value === true) {
      setSelectedTaskIds(new Set(visibleTaskIds));
    } else {
      setSelectedTaskIds(new Set());
    }
  };

  const handleToggleTask = (taskIds: string[], value: boolean | 'indeterminate') => {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (value === true) {
        taskIds.forEach((taskId) => next.add(taskId));
      } else {
        taskIds.forEach((taskId) => next.delete(taskId));
      }
      return next;
    });
  };

  const handleDeleteSelected = useCallback(async () => {
    if (!selectedCount || tasksLoading) return;
    setTasksLoading(true);
    setTasksError('');
    const ids = Array.from(selectedTaskIds);
    const result = await deleteTasks(ids);
    if (result?.error) {
      setTasksError(result.error);
      setTasksLoading(false);
      return;
    }
    setAssigneeTasks((current) => current.filter((task) => !selectedTaskIds.has(task.id)));
    setTotalCount((current) => Math.max(0, current - ids.length));
    setSelectedTaskIds(new Set());
    await refreshMemberTaskCounts();
    setTasksLoading(false);
  }, [deleteTasks, refreshMemberTaskCounts, selectedCount, selectedTaskIds, tasksLoading]);

  const handleGroupMemberClick = useCallback((userId: string) => {
    const assignee = assigneeByUserId.get(userId);
    if (!assignee) return;
    setTab(assignee.isActive ? 'active' : 'disabled');
    setSelectedAssigneeId(assignee.id);
    setMode('tasks');
  }, [assigneeByUserId, setMode, setSelectedAssigneeId, setTab]);

  const mobileSheetLabel = mode === 'access'
    ? t`Access`
    : mode === 'groups'
      ? t`Groups`
      : t`People`;
  const mobileSummary = mode === 'access'
    ? accessTab === 'history'
      ? t`History`
      : accessTab === 'disabled'
        ? t`Disabled people`
        : t`Active people`
    : mode === 'groups'
      ? (selectedGroup?.name ?? t`Select a group`)
      : (selectedAssignee?.name ?? t`Select a person`);

  const renderMembersSidebar = (closeOnSelect = false) => (
    <MembersSidebar
      className={closeOnSelect ? 'w-full border-r-0' : undefined}
      mode={mode}
      onModeChange={setMode}
      hideModeSelector={isMobile}
      isAdmin={isAdmin}
      tab={tab}
      onTabChange={setTab}
      accessTab={accessTab}
      onAccessTabChange={(nextTab) => {
        setAccessTab(nextTab);
        if (closeOnSelect) setMobileSidebarOpen(false);
      }}
      accessSearch={accessSearch}
      onAccessSearchChange={setAccessSearch}
      activeAccessCount={activeAccessCount}
      disabledAccessCount={disabledAccessCount}
      memberSearch={memberSearch}
      onMemberSearchChange={setMemberSearch}
      memberSort={memberSort}
      memberSortLabel={memberSortLabel}
      onToggleMemberSort={() => setMemberSort((current) => (current === 'asc' ? 'desc' : 'asc'))}
      memberGroupBy={memberGroupBy}
      onToggleMemberGroupBy={() => setMemberGroupBy((current) => (current === 'group' ? 'none' : 'group'))}
      activeVisibleAssignees={activeVisibleAssignees}
      disabledVisibleAssignees={disabledVisibleAssignees}
      activeMemberGroups={activeMemberGroups}
      disabledMemberGroups={disabledMemberGroups}
      selectedAssigneeId={selectedAssigneeId}
      onSelectAssignee={(assigneeId) => {
        setSelectedAssigneeId(assigneeId);
        if (closeOnSelect) setMobileSidebarOpen(false);
      }}
      memberTaskCountsDate={memberTaskCountsDate}
      memberTaskCounts={memberTaskCounts}
      groupSearch={groupSearch}
      onGroupSearchChange={setGroupSearch}
      groupSort={groupSort}
      groupSortLabel={groupSortLabel}
      onToggleGroupSort={() => setGroupSort((current) => (current === 'asc' ? 'desc' : 'asc'))}
      groupsError={groupsError}
      creatingGroup={creatingGroup}
      groupsLoading={groupsLoading}
      sortedGroups={sortedGroups}
      selectedGroupId={selectedGroupId}
      onSelectGroup={(groupId) => {
        setSelectedGroupId(groupId);
        if (closeOnSelect) setMobileSidebarOpen(false);
      }}
      onStartEditGroup={handleStartEditGroup}
      onDeleteGroup={(group) => {
        void handleDeleteGroup(group);
      }}
    />
  );

  const renderMembersContent = () => (
    <section className="flex-1 overflow-hidden flex flex-col">
      {mode === 'access' && (
        <div className={`flex-1 overflow-auto ${isMobile ? 'px-4 py-3' : 'px-6 py-4'}`}>
          <WorkspaceMembersPanel
            accessTab={accessTab}
            accessSearch={accessSearch}
          />
        </div>
      )}

      {mode === 'groups' && (
        <MembersGroupPanel
          isMobile={isMobile}
          isAdmin={isAdmin}
          roleLabels={roleLabels}
          selectedGroup={selectedGroup}
          selectedGroupId={selectedGroupId}
          editingGroupId={editingGroupId}
          editingGroupName={editingGroupName}
          onEditingGroupNameChange={setEditingGroupName}
          onCancelEdit={() => { setEditingGroupId(null); setEditingGroupName(''); }}
          onSaveGroupName={handleSaveGroupName}
          groupActionLoading={groupActionLoading}
          groupMembers={groupMembers}
          groupMembersLoading={groupMembersLoading}
          groupMembersError={groupMembersError}
          members={members}
          assigneeByUserId={assigneeByUserId}
          onAddMember={handleAddMemberToGroup}
          onRemoveMember={handleRemoveMemberFromGroup}
          onGroupMemberClick={handleGroupMemberClick}
        />
      )}

      {mode === 'tasks' && (
        <MemberTasksPanel
          selectedAssignee={selectedAssignee}
          taskScope={taskScope}
          onChangeTaskScope={(scope) => {
            setTaskScope(scope);
            setPageIndex(1);
          }}
          memberTaskCountsDate={memberTaskCountsDate}
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
          projectFilterLabel={projectFilterLabel}
          projectOptions={projectOptions}
          projectFilterIds={projectFilterIds}
          onToggleProject={handleToggleProject}
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
            setProjectFilterIds([]);
            setPastFromDate('');
            setPastToDate('');
            setPageIndex(1);
          }}
          onRefresh={() => {
            if (selectedAssigneeId) {
              void fetchAssigneeTasks(selectedAssigneeId);
            }
            void refreshMemberTaskCounts();
          }}
          selectedAssigneeId={selectedAssigneeId}
          tasksLoading={tasksLoading}
          selectedCount={selectedCount}
          onDeleteSelected={() => {
            void handleDeleteSelected();
          }}
          tasksError={tasksError}
          displayTaskRows={displayTaskRows}
          allVisibleSelected={allVisibleSelected}
          someVisibleSelected={someVisibleSelected}
          onToggleAll={handleToggleAll}
          statusById={statusById}
          projectById={projectById}
          selectedTaskIds={selectedTaskIds}
          onSelectTask={setSelectedTaskId}
          onToggleTask={handleToggleTask}
          taskScopePageSize={pageSize}
          displayTotalCount={displayTotalCount}
          pageIndex={pageIndex}
          totalPages={totalPages}
          onPrevPage={() => setPageIndex((current) => Math.max(1, current - 1))}
          onNextPage={() => setPageIndex((current) => Math.min(totalPages, current + 1))}
        />
      )}
    </section>
  );

  useWorkspaceHeader(
    {
      primaryAction: mode === 'groups' && isAdmin ? (
        <Button size="sm" className="gap-2" onClick={() => setCreatingGroup(true)}>
          <Plus className="h-4 w-4" />
          {t`New group`}
        </Button>
      ) : null,
      onOpenSettings: () => setShowSettings(true),
      onOpenAccountSettings: () => setShowAccountSettings(true),
      settingsDisabled: !canEdit,
    },
    [mode, isAdmin, canEdit],
  );

  if (isSuperAdmin) {
    return <Navigate to="/app/admin/users" replace />;
  }

  return (
    <>

      {isMobile ? (
        <>
          {(() => {
            const subnavItems: MobilePillSubnavItem[] = [
              { id: 'tasks', label: t`People` },
              ...(isAdmin ? [{ id: 'access', label: t`Access` }] : []),
              { id: 'groups', label: t`Groups` },
            ];
            return (
              <div className="border-b border-border bg-card">
                <MobilePillSubnav
                  items={subnavItems}
                  activeId={mode}
                  onChange={(id) => setMode(id as 'tasks' | 'access' | 'groups')}
                  ariaLabel={t`People sections`}
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
            sheetContent={renderMembersSidebar(true)}
          >
            {renderMembersContent()}
          </MobilePageSheetLayout>
        </>
      ) : (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {renderMembersSidebar()}
          {renderMembersContent()}
        </div>
      )}

      <MembersDialogs
        creatingGroup={creatingGroup}
        setCreatingGroup={setCreatingGroup}
        newGroupName={newGroupName}
        setNewGroupName={setNewGroupName}
        isAdmin={isAdmin}
        groupActionLoading={groupActionLoading}
        groupsError={groupsError}
        handleCreateGroup={handleCreateGroup}
        selectedTaskId={selectedTaskId}
        setSelectedTaskId={setSelectedTaskId}
        selectedTask={selectedTask}
        selectedTaskProject={selectedTaskProject}
        statusById={statusById}
        assigneeById={assigneeById}
        taskTypeById={taskTypeById}
        selectedTaskTags={selectedTaskTags}
        selectedTaskDescription={selectedTaskDescription}
        selectedTaskCommentCount={selectedTaskCommentCount}
        handleOpenTaskInTimeline={handleOpenTaskInTimeline}
        showSettings={showSettings}
        setShowSettings={setShowSettings}
        showAccountSettings={showAccountSettings}
        setShowAccountSettings={setShowAccountSettings}
      />
    </>
  );
};

export default MembersPage;
