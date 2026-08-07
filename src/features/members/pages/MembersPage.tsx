import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore, WorkspaceRole } from '@/features/auth/store/authStore';
import { useWorkspaceHeader } from '@/features/workspace/components/WorkspaceLayout';
import { Button } from '@/shared/ui/button';
import { t } from '@lingui/macro';
import { PanelLeft, Plus } from 'lucide-react';
import { MembersSidebar } from '@/features/members/components/MembersSidebar';
import { MemberTasksPanel } from '@/features/members/components/MemberTasksPanel';
import { MembersDialogs } from '@/features/members/components/MembersDialogs';
import { MembersGroupPanel } from '@/features/members/components/MembersGroupPanel';
import { AssignGroupDialog } from '@/features/members/components/AssignGroupDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog';
import type { PlannerGroupMember } from '@/features/planner/store/plannerStore.contract';
import { hasRichTags, sanitizeTaskDescription } from '@/shared/domain/taskDescription';
import { usePageSeo } from '@/shared/lib/seo/usePageSeo';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { MobilePillSubnav, type MobilePillSubnavItem } from '@/shared/ui/mobile-pill-subnav';
import { MobileSwipeDeck } from '@/shared/ui/mobile-swipe-deck';
import { MembersMobileBrowserScreen } from '@/features/members/components/MembersMobileBrowserScreen';
import { cn } from '@/shared/lib/classNames';
import { usePlannerLookupMaps } from '@/features/planner/hooks/usePlannerLookupMaps';
import { useDisplayTaskRows, countTaskUnits, pickNearestRepeatTaskFromToday } from '@/features/planner/hooks/useDisplayTaskRows';
import { Assignee } from '@/features/planner/types/planner';
import { useTaskScopeFilter } from '@/features/planner/hooks/useTaskScopeFilter';
import { useMembersFilter } from '@/features/members/hooks/useMembersFilter';
import { useMemberGroups } from '@/features/members/hooks/useMemberGroups';
import { useMembersPageMode } from '@/features/members/hooks/useMembersPageMode';
import { useMemberTaskFetcher } from '@/features/members/hooks/useMemberTaskFetcher';
import { useOnboardingTour } from '@/features/onboarding/hooks/useOnboardingTour';

/**
 * Order of the phone sections. The pill strip, the swipe deck and the dots all
 * read from this one list, so they cannot disagree about what comes next.
 */
const MOBILE_SECTIONS: Array<{ id: 'tasks' | 'groups' }> = [
  { id: 'tasks' },
  { id: 'groups' },
];

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
  const [mode, setMode] = useState<'tasks' | 'groups'>('tasks');
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
  const [mobileBrowserOpen, setMobileBrowserOpen] = useState(false);
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
    workspacesLoaded,
    hasWorkspaces,
    assignMemberToGroup,
  } = useAuthStore(useShallow((state) => ({
    user: state.user,
    members: state.members,
    currentWorkspaceId: state.currentWorkspaceId,
    currentWorkspaceRole: state.currentWorkspaceRole,
    isSuperAdmin: state.isSuperAdmin,
    workspacesLoaded: state.workspacesLoaded,
    hasWorkspaces: state.workspaces.length > 0,
    assignMemberToGroup: state.updateMemberGroup,
  })));

  const canEdit = currentWorkspaceRole === 'editor' || currentWorkspaceRole === 'admin';
  const isAdmin = currentWorkspaceRole === 'admin';

  useOnboardingTour({
    pageId: 'members',
    isAdmin,
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
    handleAssignMemberToGroup,
    handleAddMemberToGroup,
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
    groupIdByUserId,
    groupNameById,
  } = useMembersFilter({
    assignees,
    memberGroupAssignments,
    groups,
    currentWorkspaceId,
    userId: user?.id,
  });

  const memberSortLabel = memberSort === 'asc' ? t`A-Z` : t`Z-A`;
  const groupSortLabel = groupSort === 'asc' ? t`A-Z` : t`Z-A`;

  // Assigning a group is one flow with two entry points — the people list and a
  // group's own member list — so both dialogs live here rather than in either.
  const [groupAssignTarget, setGroupAssignTarget] = useState<{
    userId: string;
    name: string;
    currentGroupId: string | null;
  } | null>(null);
  const [groupRemoveTarget, setGroupRemoveTarget] = useState<{
    userId: string;
    name: string;
    groupName: string | null;
  } | null>(null);

  const openAssigneeGroupDialog = useCallback((assignee: Assignee) => {
    if (!assignee.userId) return;
    setGroupAssignTarget({
      userId: assignee.userId,
      name: assignee.name,
      currentGroupId: groupIdByUserId.get(assignee.userId) ?? null,
    });
  }, [groupIdByUserId]);

  const requestAssigneeGroupRemoval = useCallback((assignee: Assignee) => {
    if (!assignee.userId) return;
    const currentGroupId = groupIdByUserId.get(assignee.userId) ?? null;
    setGroupRemoveTarget({
      userId: assignee.userId,
      name: assignee.name,
      groupName: currentGroupId ? (groupNameById.get(currentGroupId) ?? null) : null,
    });
  }, [groupIdByUserId, groupNameById]);

  const openGroupMemberMoveDialog = useCallback((member: PlannerGroupMember) => {
    setGroupAssignTarget({
      userId: member.userId,
      name: member.displayName || member.email,
      currentGroupId: selectedGroupId,
    });
  }, [selectedGroupId]);

  const requestGroupMemberRemoval = useCallback((member: PlannerGroupMember) => {
    setGroupRemoveTarget({
      userId: member.userId,
      name: member.displayName || member.email,
      groupName: selectedGroup?.name ?? null,
    });
  }, [selectedGroup?.name]);

  const handleGroupSelected = useCallback((groupId: string) => {
    if (!groupAssignTarget) return;
    void handleAssignMemberToGroup(groupAssignTarget.userId, groupId);
    setGroupAssignTarget(null);
  }, [groupAssignTarget, handleAssignMemberToGroup]);

  const confirmGroupRemoval = useCallback(() => {
    if (!groupRemoveTarget) return;
    void handleAssignMemberToGroup(groupRemoveTarget.userId, null);
    setGroupRemoveTarget(null);
  }, [groupRemoveTarget, handleAssignMemberToGroup]);

  const [groupDeleteTarget, setGroupDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const requestGroupDeletion = useCallback((group: { id: string; name: string }) => {
    setGroupDeleteTarget(group);
  }, []);

  const confirmGroupDeletion = useCallback(() => {
    if (!groupDeleteTarget) return;
    void handleDeleteGroup(groupDeleteTarget);
    setGroupDeleteTarget(null);
  }, [groupDeleteTarget, handleDeleteGroup]);

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

  const projectOptions = useMemo(
    () => [...projects].sort((a, b) => a.name.localeCompare(b.name)),
    [projects],
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

  const mobileSectionIndex = Math.max(
    0,
    MOBILE_SECTIONS.findIndex((section) => section.id === mode),
  );
  const mobileSheetLabel = mode === 'groups' ? t`Groups` : t`People`;
  const mobileSummary = mode === 'groups'
    ? (selectedGroup?.name ?? t`Select a group`)
    : (selectedAssignee?.name ?? t`Select a person`);

  const renderMembersSidebar = () => (
    <MembersSidebar
      mode={mode}
      onModeChange={setMode}
      isAdmin={isAdmin}
      tab={tab}
      onTabChange={setTab}
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
      onSelectAssignee={setSelectedAssigneeId}
      memberTaskCountsDate={memberTaskCountsDate}
      memberTaskCounts={memberTaskCounts}
      groupIdByUserId={groupIdByUserId}
      groupNameById={groupNameById}
      onAssignAssigneeGroup={openAssigneeGroupDialog}
      onClearAssigneeGroup={requestAssigneeGroupRemoval}
      groupActionLoading={groupActionLoading}
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
      onSelectGroup={setSelectedGroupId}
      onStartEditGroup={handleStartEditGroup}
      onDeleteGroup={requestGroupDeletion}
    />
  );

  const renderGroupsPanel = () => (
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
      onMoveMember={openGroupMemberMoveDialog}
      onRemoveMember={requestGroupMemberRemoval}
      onGroupMemberClick={handleGroupMemberClick}
      hasOtherGroups={groups.length > 1}
    />
  );

  const renderTasksPanel = () => (
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
  );

  const renderMembersContent = () => (
    <section className="flex-1 overflow-hidden flex flex-col">
      {mode === 'groups' ? renderGroupsPanel() : renderTasksPanel()}
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

  if (isSuperAdmin && workspacesLoaded && !hasWorkspaces) {
    return <Navigate to="/app/admin" replace />;
  }

  return (
    <>

      {isMobile ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* The strip scrolls sideways itself, so it must swallow the gesture
              instead of letting the deck page under the finger. */}
          <div data-swipe-ignore className="shrink-0 border-b border-border bg-card">
            <MobilePillSubnav
              items={MOBILE_SECTIONS.map((section) => ({
                id: section.id,
                label: section.id === 'tasks' ? t`People` : t`Groups`,
              })) as MobilePillSubnavItem[]}
              activeId={mode}
              onChange={(id) => setMode(id as 'tasks' | 'groups')}
              ariaLabel={t`People sections`}
            />
          </div>

          <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2.5">
            <Button
              type="button"
              variant="outline"
              className="h-10 shrink-0 gap-2"
              onClick={() => setMobileBrowserOpen(true)}
            >
              <PanelLeft className="h-4 w-4" />
              {mobileSheetLabel}
            </Button>
            <div className="min-w-0 truncate text-xs text-muted-foreground">{mobileSummary}</div>
          </div>

          <MobileSwipeDeck
            index={mobileSectionIndex}
            count={MOBILE_SECTIONS.length}
            onIndexChange={(next) => setMode(MOBILE_SECTIONS[next].id)}
          >
            {MOBILE_SECTIONS.map((section) => (
              <div key={section.id} className="flex h-full min-h-0 flex-col overflow-hidden">
                {section.id === 'tasks' ? renderTasksPanel() : renderGroupsPanel()}
              </div>
            ))}
          </MobileSwipeDeck>

          <div
            // Safari reports safe-area-inset-bottom as 0 without
            // viewport-fit=cover, so the clearance has to be a real gap.
            className="flex shrink-0 items-center justify-center gap-1.5 border-t border-border bg-card pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]"
          >
            {MOBILE_SECTIONS.map((section, index) => (
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

      {isMobile && (
        <MembersMobileBrowserScreen
          open={mobileBrowserOpen}
          onOpenChange={setMobileBrowserOpen}
          mode={mode}
          isAdmin={isAdmin}
          groupActionLoading={groupActionLoading}
          tab={tab}
          onTabChange={setTab}
          memberSearch={memberSearch}
          onMemberSearchChange={setMemberSearch}
          activeVisibleAssignees={activeVisibleAssignees}
          disabledVisibleAssignees={disabledVisibleAssignees}
          selectedAssigneeId={selectedAssigneeId}
          onSelectAssignee={(assigneeId) => {
            setSelectedAssigneeId(assigneeId);
            setMobileBrowserOpen(false);
          }}
          memberTaskCounts={memberTaskCounts}
          memberTaskCountsDate={memberTaskCountsDate}
          groupIdByUserId={groupIdByUserId}
          groupNameById={groupNameById}
          // Every action closes the browser first: the dialogs it leads to sit
          // below this screen in the stack, and the job is done once picked.
          onAssignAssigneeGroup={(assignee) => {
            setMobileBrowserOpen(false);
            openAssigneeGroupDialog(assignee);
          }}
          onClearAssigneeGroup={(assignee) => {
            setMobileBrowserOpen(false);
            requestAssigneeGroupRemoval(assignee);
          }}
          groupSearch={groupSearch}
          onGroupSearchChange={setGroupSearch}
          sortedGroups={sortedGroups}
          groupsLoading={groupsLoading}
          groupsError={groupsError}
          selectedGroupId={selectedGroupId}
          onSelectGroup={(groupId) => {
            setSelectedGroupId(groupId);
            setMobileBrowserOpen(false);
          }}
          onRenameGroup={(group) => {
            setMobileBrowserOpen(false);
            setSelectedGroupId(group.id);
            handleStartEditGroup(group);
          }}
          onDeleteGroup={(group) => {
            setMobileBrowserOpen(false);
            requestGroupDeletion(group);
          }}
        />
      )}

      <AssignGroupDialog
        open={groupAssignTarget !== null}
        onOpenChange={(next) => {
          if (!next) setGroupAssignTarget(null);
        }}
        memberName={groupAssignTarget?.name ?? ''}
        groups={groups}
        currentGroupId={groupAssignTarget?.currentGroupId ?? null}
        onSelect={handleGroupSelected}
        loading={groupActionLoading}
        isMobile={isMobile}
      />

      <AlertDialog
        open={groupRemoveTarget !== null}
        onOpenChange={(next) => {
          if (!next) setGroupRemoveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Remove from group?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {groupRemoveTarget?.groupName
                ? t`${groupRemoveTarget.name} leaves "${groupRemoveTarget.groupName}" and ends up without a group. Their tasks are not affected.`
                : t`They end up without a group. Their tasks are not affected.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                confirmGroupRemoval();
              }}
            >
              {t`Remove`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={groupDeleteTarget !== null}
        onOpenChange={(next) => {
          if (!next) setGroupDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Delete group?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {t`"${groupDeleteTarget?.name ?? ''}" disappears from the workspace. The people in it stay, just without a group.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                confirmGroupDeletion();
              }}
            >
              {t`Delete`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default MembersPage;
