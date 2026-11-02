import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore, WorkspaceRole } from '@/features/auth/store/authStore';
import { useWorkspaceHeader } from '@/features/workspace/components/WorkspaceLayout';
import { Button } from '@/shared/ui/button';
import { t } from '@lingui/macro';
import { Plus } from 'lucide-react';
import { MembersSidebar } from '@/features/members/components/MembersSidebar';
import { MemberTasksPanel } from '@/features/members/components/MemberTasksPanel';
import { MembersDialogs } from '@/features/members/components/MembersDialogs';
import { MembersGroupPanel } from '@/features/members/components/MembersGroupPanel';
import { usePageSeo } from '@/shared/lib/seo/usePageSeo';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { type MembersMobileListProps } from '@/features/members/components/MembersMobileList';
import { MembersMobileDeck } from '@/features/members/components/MembersMobileDeck';
import { MobileScreenShell } from '@/shared/ui/mobile-screen-shell';
import { MOBILE_FAB_BUTTON_CLASS } from '@/shared/ui/mobile-fab';
import { usePlannerLookupMaps } from '@/features/planner/hooks/usePlannerLookupMaps';
import { useMembersFilter } from '@/features/members/hooks/useMembersFilter';
import { useMemberGroups } from '@/features/members/hooks/useMemberGroups';
import { useMembersPageMode } from '@/features/members/hooks/useMembersPageMode';
import { useMemberTasksView } from '@/features/members/hooks/useMemberTasksView';
import { useMemberGroupFlow } from '@/features/members/hooks/useMemberGroupFlow';
import { MemberGroupDialogs } from '@/features/members/components/MemberGroupDialogs';

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
  // Two levels on a phone: the deck of lists, and the detail pushed on top.
  const [memberDetailOpen, setMemberDetailOpen] = useState(false);
  const [groupDetailOpen, setGroupDetailOpen] = useState(false);
  const isMobile = useIsMobile();

  const {
    assignees,
    memberGroupAssignments,
    statuses,
    taskTypes,
    tags,
    loadWorkspaceData,
    fetchMemberGroups,
    fetchGroupMembers,
    createMemberGroup,
    updateMemberGroup,
    deleteMemberGroup,
  } = usePlannerStore(useShallow((state) => ({
    assignees: state.assignees,
    memberGroupAssignments: state.memberGroupAssignments,
    statuses: state.statuses,
    taskTypes: state.taskTypes,
    tags: state.tags,
    loadWorkspaceData: state.loadWorkspaceData,
    fetchMemberGroups: state.fetchMemberGroups,
    fetchGroupMembers: state.fetchGroupMembers,
    createMemberGroup: state.createMemberGroup,
    updateMemberGroup: state.updateMemberGroup,
    deleteMemberGroup: state.deleteMemberGroup,
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

  const roleLabels: Record<WorkspaceRole, string> = {
    admin: t`Admin`,
    editor: t`Editor`,
    viewer: t`Viewer`,
  };

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

  const groupFlow = useMemberGroupFlow({
    groupIdByUserId,
    groupNameById,
    selectedGroupId,
    selectedGroupName: selectedGroup?.name ?? null,
    handleAssignMemberToGroup,
    handleDeleteGroup,
  });
  const {
    openAssigneeGroupDialog,
    requestAssigneeGroupRemoval,
    openGroupMemberMoveDialog,
    requestGroupMemberRemoval,
    requestGroupDeletion,
  } = groupFlow;

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
  const assigneeByUserId = useMemo(() => {
    const map = new Map<string, typeof assignees[number]>();
    assignees.forEach((assignee) => {
      if (assignee.userId) {
        map.set(assignee.userId, assignee);
      }
    });
    return map;
  }, [assignees]);

  const memberTasks = useMemberTasksView({
    currentWorkspaceId,
    selectedAssigneeId,
    mode,
    statusById,
    tagById,
  });
  const {
    memberTaskCounts,
    memberTaskCountsDate,
    selectedTaskId,
    setSelectedTaskId,
    selectedTaskSubtasks,
    selectedTask,
    selectedTaskProject,
    selectedTaskTags,
    selectedTaskDescription,
    selectedTaskCommentCount,
    handleOpenTaskInTimeline,
  } = memberTasks;

  const handleGroupMemberClick = useCallback((userId: string) => {
    const assignee = assigneeByUserId.get(userId);
    if (!assignee) return;
    setTab(assignee.isActive ? 'active' : 'disabled');
    setSelectedAssigneeId(assignee.id);
    setMode('tasks');
  }, [assigneeByUserId, setMode, setSelectedAssigneeId, setTab]);

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
    <MemberTasksPanel selectedAssignee={selectedAssignee} {...memberTasks.panelProps} />
  );

  const renderMembersContent = () => (
    <section className="flex-1 overflow-hidden flex flex-col">
      {mode === 'groups' ? renderGroupsPanel() : renderTasksPanel()}
    </section>
  );

  useWorkspaceHeader(
    {
      primaryAction: mode === 'groups' && isAdmin ? (
        <Button
          size={isMobile ? 'default' : 'sm'}
          className={isMobile ? MOBILE_FAB_BUTTON_CLASS : 'gap-2'}
          onClick={() => setCreatingGroup(true)}
        >
          <Plus className="h-4 w-4" />
          {t`New group`}
        </Button>
      ) : null,
      onOpenSettings: () => setShowSettings(true),
      onOpenAccountSettings: () => setShowAccountSettings(true),
      settingsDisabled: !canEdit,
    },
    [mode, isAdmin, canEdit, isMobile],
  );

  const mobileListProps: Omit<MembersMobileListProps, 'mode'> = {
    isAdmin,
    groupActionLoading,
    tab,
    onTabChange: setTab,
    memberSearch,
    onMemberSearchChange: setMemberSearch,
    activeVisibleAssignees,
    disabledVisibleAssignees,
    onOpenAssignee: (assigneeId) => {
      setSelectedAssigneeId(assigneeId);
      setMemberDetailOpen(true);
    },
    memberTaskCounts,
    memberTaskCountsDate,
    groupIdByUserId,
    groupNameById,
    onAssignAssigneeGroup: openAssigneeGroupDialog,
    onClearAssigneeGroup: requestAssigneeGroupRemoval,
    groupSearch,
    onGroupSearchChange: setGroupSearch,
    sortedGroups,
    groupsLoading,
    groupsError,
    onOpenGroup: (groupId) => {
      setSelectedGroupId(groupId);
      setGroupDetailOpen(true);
    },
    onRenameGroup: (group) => {
      setSelectedGroupId(group.id);
      handleStartEditGroup(group);
      setGroupDetailOpen(true);
    },
    onDeleteGroup: requestGroupDeletion,
  };

  if (isSuperAdmin && workspacesLoaded && !hasWorkspaces) {
    return <Navigate to="/app/admin" replace />;
  }

  return (
    <>
      {isMobile ? (
        <MembersMobileDeck mode={mode} onModeChange={setMode} listProps={mobileListProps} />
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
        selectedTaskSubtasks={selectedTaskSubtasks}
        handleOpenTaskInTimeline={handleOpenTaskInTimeline}
        showSettings={showSettings}
        setShowSettings={setShowSettings}
        showAccountSettings={showAccountSettings}
        setShowAccountSettings={setShowAccountSettings}
      />

      {isMobile && (
        <>
          {/* Second level: the person and their tasks, the group and its
              people. Both come with a back arrow and the swipe-right that goes
              with it. */}
          <MobileScreenShell
            open={memberDetailOpen}
            onOpenChange={setMemberDetailOpen}
            title={selectedAssignee?.name ?? t`Person`}
            contentClassName="px-0 pt-0"
          >
            {renderTasksPanel()}
          </MobileScreenShell>

          <MobileScreenShell
            open={groupDetailOpen}
            onOpenChange={setGroupDetailOpen}
            title={selectedGroup?.name ?? t`Group`}
            contentClassName="px-0 pt-0"
          >
            {renderGroupsPanel()}
          </MobileScreenShell>
        </>
      )}

      <MemberGroupDialogs
        flow={groupFlow}
        groups={groups}
        loading={groupActionLoading}
        isMobile={isMobile}
      />
    </>
  );
};

export default MembersPage;
