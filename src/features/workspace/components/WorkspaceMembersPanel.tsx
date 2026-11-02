import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore, WorkspaceRole } from '@/features/auth/store/authStore';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import { SearchInput } from '@/shared/ui/SearchInput';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { cn } from '@/shared/lib/classNames';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { t } from '@lingui/macro';
import { WorkspaceMemberActivityEntry } from '@/shared/domain/workspaceMemberActivity';
import { formatWorkspaceMemberActivity } from '@/shared/lib/workspaceMemberActivity';
import { matchesWorkspaceMemberSearch } from '@/shared/domain/workspaceMemberSearch';
import { splitMembersByAccess } from '@/shared/domain/workspaceMemberAccess';
import { RenamePurgedDialog } from './RenamePurgedDialog';
import { WorkspaceMemberRow, type WorkspaceMemberSummary } from '@/features/workspace/components/WorkspaceMemberRow';
import { WorkspaceLeaveDialogs } from '@/features/workspace/components/WorkspaceLeaveDialogs';
import { useLeaveWorkspace } from '@/features/workspace/hooks/useLeaveWorkspace';
import { WorkspaceInviteSection } from '@/features/workspace/components/WorkspaceInviteSection';
import { useWorkspaceInvites } from '@/features/workspace/hooks/useWorkspaceInvites';
import { useIsDemo } from '@/features/demo/hooks/useIsDemo';
import { useDemoConversion } from '@/features/demo/providers/DemoConversionProvider';

interface WorkspaceMembersPanelProps {
  active?: boolean;
  showTitle?: boolean;
  className?: string;
  accessTab?: 'active' | 'disabled' | 'history';
}

type MemberGroup = {
  id: string;
  name: string;
};

type MemberSortKey = 'member' | 'role' | 'group' | 'status';
type MemberSortDirection = 'asc' | 'desc';

export const WorkspaceMembersPanel: React.FC<WorkspaceMembersPanelProps> = ({
  active = true,
  showTitle = true,
  className,
  accessTab = 'active',
}) => {
  const {
    user,
    workspaces,
    members,
    membersLoading,
    fetchMembers,
    listWorkspaceMemberActivity,
    updateMemberRole,
    updateMemberGroup,
    renamePurgedProfile,
    currentWorkspaceId,
    currentWorkspaceRole,
  } = useAuthStore(useShallow((state) => ({
    user: state.user,
    workspaces: state.workspaces,
    members: state.members,
    membersLoading: state.membersLoading,
    fetchMembers: state.fetchMembers,
    listWorkspaceMemberActivity: state.listWorkspaceMemberActivity,
    updateMemberRole: state.updateMemberRole,
    updateMemberGroup: state.updateMemberGroup,
    renamePurgedProfile: state.renamePurgedProfile,
    currentWorkspaceId: state.currentWorkspaceId,
    currentWorkspaceRole: state.currentWorkspaceRole,
  })));
  const {
    assignees,
    refreshAssignees,
    updateAssignee,
    setWorkspaceId,
    fetchMemberGroups,
  } = usePlannerStore(useShallow((state) => ({
    assignees: state.assignees,
    refreshAssignees: state.refreshAssignees,
    updateAssignee: state.updateAssignee,
    setWorkspaceId: state.setWorkspaceId,
    fetchMemberGroups: state.fetchMemberGroups,
  })));

  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [groups, setGroups] = useState<MemberGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState('');
  const [memberSortKey, setMemberSortKey] = useState<MemberSortKey>('member');
  const [memberSortDirection, setMemberSortDirection] = useState<MemberSortDirection>('asc');
  const [memberActivity, setMemberActivity] = useState<WorkspaceMemberActivityEntry[]>([]);
  const [memberActivityLoading, setMemberActivityLoading] = useState(false);
  const [memberActivityError, setMemberActivityError] = useState('');
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameTargetUserId, setRenameTargetUserId] = useState<string | null>(null);
  const [renameTargetCurrentName, setRenameTargetCurrentName] = useState<string | null>(null);
  const isAdmin = currentWorkspaceRole === 'admin';
  const isDemo = useIsDemo();
  const { open: openDemoConversion } = useDemoConversion();
  const currentUserId = user?.id ?? null;
  const currentWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === currentWorkspaceId) ?? null,
    [currentWorkspaceId, workspaces],
  );
  const isWorkspaceOwner = Boolean(currentUserId && currentWorkspace?.ownerId === currentUserId);
  const canRemoveMembers = isWorkspaceOwner;
  const ownerId = currentWorkspace?.ownerId ?? null;
  // Active members (excluding self) eligible to receive ownership on transfer.
  const transferCandidates = useMemo(
    () => members.filter((member) => member.userId !== currentUserId && member.status === 'ACTIVE'),
    [members, currentUserId],
  );

  useEffect(() => {
    if (active && currentWorkspaceId) {
      fetchMembers(currentWorkspaceId);
      setWorkspaceId(currentWorkspaceId);
      refreshAssignees();
    }
  }, [active, currentWorkspaceId, fetchMembers, refreshAssignees, setWorkspaceId]);

  useEffect(() => {
    if (!active || !currentWorkspaceId) return;
    let isMounted = true;
    setGroupsLoading(true);
    setGroupsError('');
    fetchMemberGroups(currentWorkspaceId)
      .then((result) => {
        if (!isMounted) return;
        if (result.error) {
          setGroupsError(result.error);
          setGroupsLoading(false);
          return;
        }
        setGroups(result.groups as MemberGroup[]);
        setGroupsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [active, currentWorkspaceId, fetchMemberGroups]);

  const loadMemberActivity = useCallback(async () => {
    if (!active || !currentWorkspaceId || !isAdmin) {
      setMemberActivity([]);
      setMemberActivityLoading(false);
      setMemberActivityError('');
      return;
    }

    setMemberActivityLoading(true);
    setMemberActivityError('');
    const { entries, error } = await listWorkspaceMemberActivity({
      workspaceId: currentWorkspaceId,
      limit: 100,
    });
    if (error) {
      setMemberActivityError(error);
      setMemberActivityLoading(false);
      return;
    }

    setMemberActivity(entries);
    setMemberActivityLoading(false);
  }, [active, currentWorkspaceId, isAdmin, listWorkspaceMemberActivity]);

  useEffect(() => {
    if (!active || !isAdmin || !currentWorkspaceId) {
      setMemberActivity([]);
      return;
    }
    void loadMemberActivity();
  }, [active, currentWorkspaceId, isAdmin, loadMemberActivity]);

  const invites = useWorkspaceInvites({
    active,
    isAdmin,
    isDemo,
    currentWorkspaceId,
    setError,
    onInvited: () => void loadMemberActivity(),
    openDemoConversion,
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

  const groupNameById = useMemo(() => (
    new Map(groups.map((group) => [group.id, group.name]))
  ), [groups]);

  const handleMemberSortChange = (key: MemberSortKey) => {
    setMemberSortKey((currentKey) => {
      if (currentKey === key) {
        setMemberSortDirection((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'));
        return currentKey;
      }
      setMemberSortDirection('asc');
      return key;
    });
  };

  const sortedMembers = useMemo(() => {
    const direction = memberSortDirection === 'asc' ? 1 : -1;
    const list = [...members];
    const getSortValue = (member: typeof members[number]) => {
      switch (memberSortKey) {
        case 'role':
          return member.role ?? '';
        case 'group':
          return groupNameById.get(member.groupId ?? '') ?? t`No group`;
        case 'status': {
          const assignee = assigneeByUserId.get(member.userId);
          if (!assignee) return t`Unknown`;
          return assignee.isActive ? t`Active` : t`Disabled`;
        }
        case 'member':
        default:
          return member.email ?? '';
      }
    };
    list.sort((left, right) => {
      const leftValue = getSortValue(left);
      const rightValue = getSortValue(right);
      const compare = leftValue.localeCompare(rightValue, undefined, { sensitivity: 'base' });
      if (compare !== 0) return compare * direction;
      return (left.email ?? '').localeCompare(right.email ?? '', undefined, { sensitivity: 'base' });
    });
    return list;
  }, [assigneeByUserId, groupNameById, memberSortDirection, memberSortKey, members]);

  const {
    active: activeSortedMembers,
    disabled: disabledSortedMembers,
  } = useMemo(
    () => splitMembersByAccess(sortedMembers, assigneeByUserId),
    [assigneeByUserId, sortedMembers],
  );

  const filteredActiveMembers = useMemo(
    () => activeSortedMembers.filter((member) => matchesWorkspaceMemberSearch({
      email: member.email,
      displayName: member.displayName,
      role: member.role,
      groupName: member.groupId ? (groupNameById.get(member.groupId) ?? null) : null,
    }, search)),
    [search, activeSortedMembers, groupNameById],
  );

  const filteredDisabledMembers = useMemo(
    () => disabledSortedMembers.filter((member) => matchesWorkspaceMemberSearch({
      email: member.email,
      displayName: member.displayName,
      role: member.role,
      groupName: member.groupId ? (groupNameById.get(member.groupId) ?? null) : null,
    }, search)),
    [search, disabledSortedMembers, groupNameById],
  );

  const renderSortIcon = (key: MemberSortKey) => {
    if (memberSortKey !== key) {
      return <ChevronsUpDown className="h-3 w-3 text-muted-foreground/70" />;
    }
    return memberSortDirection === 'asc'
      ? <ChevronUp className="h-3 w-3 text-foreground" />
      : <ChevronDown className="h-3 w-3 text-foreground" />;
  };

  const formatHistoryDate = useCallback((isoDate: string) => {
    const parsed = Date.parse(isoDate);
    if (!Number.isFinite(parsed)) return '';
    return new Date(parsed).toLocaleString();
  }, []);

  const handleRoleChange = async (userId: string, nextRole: WorkspaceRole) => {
    if (!isAdmin) return;
    const result = await updateMemberRole(userId, nextRole);
    if (result.error) {
      setError(result.error);
      return;
    }
    void loadMemberActivity();
  };

  const handleGroupChange = async (userId: string, nextGroupId: string) => {
    if (!isAdmin) return;
    const groupId = nextGroupId === 'none' ? null : nextGroupId;
    const result = await updateMemberGroup(userId, groupId);
    if (result.error) {
      setError(result.error);
      return;
    }
    void loadMemberActivity();
  };

  const handleMemberStatusChange = async (assigneeId: string, nextValue: boolean) => {
    const result = await updateAssignee(assigneeId, { isActive: nextValue });
    if (result?.error) {
      setError(result.error);
      return;
    }
    void loadMemberActivity();
  };

  const openRenamePurgedDialog = (member: typeof members[number]) => {
    setRenameTargetUserId(member.userId);
    setRenameTargetCurrentName(member.displayName);
    setRenameDialogOpen(true);
  };

  const handleRenamePurgedSubmit = useCallback(async (userId: string, newName: string) => {
    const result = await renamePurgedProfile(userId, newName);
    if (result.error) {
      return { error: result.error };
    }
    return {};
  }, [renamePurgedProfile]);

  // Each list says what it is: the same "manage roles and status" caption over
  // the history log would describe something the log cannot do.
  const listTitle = accessTab === 'history'
    ? t`Access history`
    : accessTab === 'disabled'
      ? t`Disabled people`
      : t`People access`;
  const listDescription = accessTab === 'history'
    ? t`Who changed roles, groups and access, and when.`
    : accessTab === 'disabled'
      ? t`They keep their tasks and history but cannot open the workspace.`
      : t`Manage team roles, groups, and status.`;

  const leave = useLeaveWorkspace({
    currentWorkspaceId,
    isWorkspaceOwner,
    setError,
    onMemberRemoved: () => void loadMemberActivity(),
  });
  const {
    leaving,
    setRemoveTarget,
    handleLeave,
  } = leave;

  const renderMemberRow = (member: WorkspaceMemberSummary) => (
    <WorkspaceMemberRow
      key={member.userId}
      member={member}
      currentUserId={currentUserId}
      ownerId={ownerId}
      assigneeByUserId={assigneeByUserId}
      isAdmin={isAdmin}
      canRemoveMembers={canRemoveMembers}
      groups={groups}
      groupsLoading={groupsLoading}
      leaving={leaving}
      handleRoleChange={handleRoleChange}
      handleGroupChange={handleGroupChange}
      handleMemberStatusChange={handleMemberStatusChange}
      handleLeave={handleLeave}
      setRemoveTarget={setRemoveTarget}
      openRenamePurgedDialog={openRenamePurgedDialog}
    />
  );

  return (
    <div className={cn('space-y-4', className)}>
      {showTitle && (
        <div>
          <h2 className="text-base font-semibold">{t`Team access`}</h2>
          <p className="text-xs text-muted-foreground">
            {t`Manage team invites, roles, and access.`}
          </p>
        </div>
      )}

      {!isAdmin && (
        <Alert>
          <AlertTitle>{t`Read-only`}</AlertTitle>
          <AlertDescription>{t`You have view access and cannot manage members.`}</AlertDescription>
        </Alert>
      )}

      {/* Lives above the cards: a failed role or status change has to be
          visible on whichever list it happened on, not only where invites are. */}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>{t`Action failed`}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Inviting belongs to the people who are in: it would read as a stray
          control above the disabled list or the history log. */}
      {accessTab === 'active' && (
        <WorkspaceInviteSection
          invites={invites}
          isAdmin={isAdmin}
          groups={groups}
          groupsLoading={groupsLoading}
          groupsError={groupsError}
        />
      )}

      <div className="rounded-lg border bg-background p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">{listTitle}</div>
            <div className="text-xs text-muted-foreground">{listDescription}</div>
          </div>
          {accessTab !== 'history' && (
            <SearchInput
              className="w-full sm:w-[260px]"
              inputClassName="h-9"
              placeholder={t`Search people...`}
              value={search}
              onValueChange={setSearch}
              clearLabel={t`Clear search`}
            />
          )}
        </div>

        <div className="min-w-0">
          {accessTab !== 'history' && (
            <div className="hidden md:grid grid-cols-[1fr,140px,180px,120px,90px] gap-3 px-2 pb-3 text-xs text-muted-foreground">
              <button
                type="button"
                onClick={() => handleMemberSortChange('member')}
                className="inline-flex items-center gap-1 text-left hover:text-foreground"
              >
                <span>{t`Member`}</span>
                {renderSortIcon('member')}
              </button>
              <button
                type="button"
                onClick={() => handleMemberSortChange('role')}
                className="inline-flex items-center gap-1 text-left hover:text-foreground"
              >
                <span>{t`Role`}</span>
                {renderSortIcon('role')}
              </button>
              <button
                type="button"
                onClick={() => handleMemberSortChange('group')}
                className="inline-flex items-center gap-1 text-left hover:text-foreground"
              >
                <span>{t`Group`}</span>
                {renderSortIcon('group')}
              </button>
              <button
                type="button"
                onClick={() => handleMemberSortChange('status')}
                className="inline-flex items-center gap-1 text-left hover:text-foreground"
              >
                <span>{t`Status`}</span>
                {renderSortIcon('status')}
              </button>
              <span className="text-right">{t`Actions`}</span>
            </div>
          )}

          {accessTab === 'active' && (
            <div className="space-y-3">
              {membersLoading && (
                <div className="text-sm text-muted-foreground">{t`Loading members...`}</div>
              )}
              {!membersLoading && filteredActiveMembers.length === 0 && !search.trim() && (
                <div className="text-sm text-muted-foreground">{t`No active members.`}</div>
              )}
              {!membersLoading && filteredActiveMembers.length === 0 && search.trim() && (
                <div className="text-sm text-muted-foreground">{t`No matches.`}</div>
              )}
              {!membersLoading && filteredActiveMembers.length > 0 && (
                <div className="space-y-2">
                  {filteredActiveMembers.map(renderMemberRow)}
                </div>
              )}
            </div>
          )}

          {accessTab === 'disabled' && (
            <div className="space-y-3">
              {membersLoading && (
                <div className="text-sm text-muted-foreground">{t`Loading members...`}</div>
              )}
              {!membersLoading && filteredDisabledMembers.length === 0 && !search.trim() && (
                <div className="text-sm text-muted-foreground">{t`No disabled members.`}</div>
              )}
              {!membersLoading && filteredDisabledMembers.length === 0 && search.trim() && (
                <div className="text-sm text-muted-foreground">{t`No matches.`}</div>
              )}
              {!membersLoading && filteredDisabledMembers.length > 0 && (
                <div className="space-y-2">
                  {filteredDisabledMembers.map(renderMemberRow)}
                </div>
              )}
            </div>
          )}

          {accessTab === 'history' && (
            <div className="space-y-2">
              {memberActivityLoading && (
                <div className="text-sm text-muted-foreground">{t`Loading history...`}</div>
              )}
              {!memberActivityLoading && memberActivityError && (
                <div className="text-sm text-destructive">{memberActivityError}</div>
              )}
              {!memberActivityLoading && !memberActivityError && memberActivity.length === 0 && (
                <div className="text-sm text-muted-foreground">{t`No history yet.`}</div>
              )}
              {!memberActivityLoading && !memberActivityError && memberActivity.length > 0 && (
                <div className="space-y-2">
                  {memberActivity.map((entry) => (
                    <div key={entry.id} className="rounded-md border px-3 py-2">
                      <div className="text-xs text-muted-foreground">
                        {formatHistoryDate(entry.createdAt)}
                      </div>
                      <div className="mt-1 text-sm leading-relaxed">
                        {formatWorkspaceMemberActivity(entry)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <RenamePurgedDialog
        open={renameDialogOpen}
        onOpenChange={(next) => {
          setRenameDialogOpen(next);
          if (!next) {
            setRenameTargetUserId(null);
            setRenameTargetCurrentName(null);
          }
        }}
        userId={renameTargetUserId}
        currentDisplayName={renameTargetCurrentName}
        onSubmit={handleRenamePurgedSubmit}
      />

      <WorkspaceLeaveDialogs leave={leave} transferCandidates={transferCandidates} />
    </div>
  );
};
