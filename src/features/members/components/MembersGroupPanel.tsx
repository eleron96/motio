import React, { useMemo, useState } from 'react';
import { t } from '@lingui/macro';
import { Eye, EyeOff, MoreHorizontal, UserPlus } from 'lucide-react';
import { WorkspaceRole } from '@/features/auth/store/authStore';
import { Assignee } from '@/features/planner/types/planner';
import { PlannerGroup, PlannerGroupMember } from '@/features/planner/store/plannerStore.contract';
import { AvailableGroupMember, buildAvailableGroupMembers } from '@/features/members/lib/memberSelectors';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Switch } from '@/shared/ui/switch';
import { SearchInput } from '@/shared/ui/SearchInput';
import { MobileScreenShell } from '@/shared/ui/mobile-screen-shell';
import { MobileListGroup, MobileListRow } from '@/shared/ui/mobile-list';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';

interface MemberRef {
  userId: string;
  email: string;
  displayName: string | null;
}

interface MembersGroupPanelProps {
  isMobile: boolean;
  isAdmin: boolean;
  roleLabels: Record<WorkspaceRole, string>;
  selectedGroup: PlannerGroup | null;
  selectedGroupId: string | null;
  editingGroupId: string | null;
  editingGroupName: string;
  onEditingGroupNameChange: (name: string) => void;
  onCancelEdit: () => void;
  onSaveGroupName: () => void;
  groupActionLoading: boolean;
  groupMembers: PlannerGroupMember[];
  groupMembersLoading: boolean;
  groupMembersError: string;
  members: MemberRef[];
  assigneeByUserId: Map<string, Assignee>;
  onAddMember: (userId: string) => Promise<void>;
  /** Opens the group picker for someone already in this group. */
  onMoveMember: (member: PlannerGroupMember) => void;
  /** Asks to take them out; the confirmation lives with the page. */
  onRemoveMember: (member: PlannerGroupMember) => void;
  onGroupMemberClick: (userId: string) => void;
  /** True when there is somewhere else to move people to. */
  hasOtherGroups: boolean;
}

export const MembersGroupPanel: React.FC<MembersGroupPanelProps> = ({
  isMobile,
  isAdmin,
  roleLabels,
  selectedGroup,
  selectedGroupId,
  editingGroupId,
  editingGroupName,
  onEditingGroupNameChange,
  onCancelEdit,
  onSaveGroupName,
  groupActionLoading,
  groupMembers,
  groupMembersLoading,
  groupMembersError,
  members,
  assigneeByUserId,
  onAddMember,
  onMoveMember,
  onRemoveMember,
  onGroupMemberClick,
  hasOtherGroups,
}) => {
  const [addMemberPopoverOpen, setAddMemberPopoverOpen] = useState(false);
  const [addMemberScreenOpen, setAddMemberScreenOpen] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [showDisabledAddMembers, setShowDisabledAddMembers] = useState(false);

  const { availableMembers, hiddenDisabledCount } = useMemo(() => {
    if (!selectedGroupId) return { availableMembers: [] as AvailableGroupMember[], hiddenDisabledCount: 0 };
    return buildAvailableGroupMembers({
      members,
      groupMembers,
      assigneeByUserId,
      search: addMemberSearch,
      includeDisabled: showDisabledAddMembers,
    });
  }, [addMemberSearch, assigneeByUserId, groupMembers, members, selectedGroupId, showDisabledAddMembers]);

  const addMemberSearchQuery = addMemberSearch.trim();
  const addMemberEmptyState = useMemo(() => {
    if (availableMembers.length > 0) return null;
    if (hiddenDisabledCount > 0) {
      return {
        title: addMemberSearchQuery
          ? t`No active members match the search.`
          : t`Only disabled people are available.`,
        hint: t`Show disabled people to add them.`,
      };
    }
    return {
      title: addMemberSearchQuery
        ? t`No members match the search.`
        : t`No available members.`,
      hint: null,
    };
  }, [addMemberSearchQuery, availableMembers.length, hiddenDisabledCount]);

  return (
    <div className={`flex-1 overflow-auto ${isMobile ? 'px-4 py-3' : 'px-6 py-4'}`}>
      {!selectedGroup && (
        <div className="text-sm text-muted-foreground">
          {t`Select a group to see members.`}
        </div>
      )}

      {selectedGroup && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {editingGroupId === selectedGroup.id ? (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  className={`w-full sm:w-[240px] ${isMobile ? 'h-11 text-base' : ''}`}
                  value={editingGroupName}
                  onChange={(event) => onEditingGroupNameChange(event.target.value)}
                  disabled={!isAdmin || groupActionLoading}
                />
                <Button
                  size="sm"
                  className={isMobile ? 'h-11 px-5' : undefined}
                  onClick={onSaveGroupName}
                  disabled={!isAdmin || groupActionLoading || !editingGroupName.trim()}
                >
                  {t`Save`}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className={isMobile ? 'h-11 px-5' : undefined}
                  onClick={onCancelEdit}
                  disabled={groupActionLoading}
                >
                  {t`Cancel`}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                {/* The group's name is the screen's title on a phone. */}
                {!isMobile && (
                  <div className="text-lg font-semibold">{selectedGroup.name}</div>
                )}
                {isAdmin && isMobile && (
                  // A popover with its own scroller is unreachable with a
                  // finger; on a phone this list gets a screen of its own.
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-11 gap-1.5"
                    disabled={groupActionLoading}
                    onClick={() => setAddMemberScreenOpen(true)}
                  >
                    <UserPlus className="h-4 w-4" />
                    {t`Add member`}
                  </Button>
                )}
                {isAdmin && !isMobile && (
                  <Popover open={addMemberPopoverOpen} onOpenChange={(open) => {
                    setAddMemberPopoverOpen(open);
                    if (!open) {
                      setAddMemberSearch('');
                      setShowDisabledAddMembers(false);
                    }
                  }}>
                    <PopoverTrigger asChild>
                      <Button size="sm" variant="outline" className="gap-1.5" disabled={groupActionLoading}>
                        <UserPlus className="h-4 w-4" />
                        {t`Add member`}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-2" align="start">
                      <div className="mb-2 flex items-center gap-2">
                        <Input
                          placeholder={t`Search members...`}
                          value={addMemberSearch}
                          onChange={(e) => setAddMemberSearch(e.target.value)}
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant={showDisabledAddMembers ? 'secondary' : 'ghost'}
                          className="shrink-0"
                          onClick={() => setShowDisabledAddMembers((current) => !current)}
                          aria-pressed={showDisabledAddMembers}
                          aria-label={showDisabledAddMembers ? t`Hide disabled people` : t`Show disabled people`}
                          title={showDisabledAddMembers ? t`Hide disabled people` : t`Show disabled people`}
                        >
                          {showDisabledAddMembers ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <div className="max-h-[200px] overflow-auto space-y-0.5">
                        {addMemberEmptyState ? (
                          <div className="space-y-1 px-2 py-1.5 text-sm text-muted-foreground">
                            <div>{addMemberEmptyState.title}</div>
                            {addMemberEmptyState.hint && (
                              <div className="text-xs">{addMemberEmptyState.hint}</div>
                            )}
                          </div>
                        ) : (
                          availableMembers.map((m) => (
                            <button
                              key={m.userId}
                              type="button"
                              className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60 transition-colors"
                              disabled={groupActionLoading}
                              onClick={() => {
                                void onAddMember(m.userId);
                                setAddMemberPopoverOpen(false);
                                setAddMemberSearch('');
                              }}
                            >
                              <div className="flex items-center gap-2">
                                <div className="min-w-0 flex-1 font-medium truncate">{m.displayName || m.email}</div>
                                {!m.isActive && (
                                  <Badge variant="secondary" className="text-[10px]">{t`Disabled`}</Badge>
                                )}
                              </div>
                              {m.displayName && (
                                <div className="text-xs text-muted-foreground truncate">{m.email}</div>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            )}
          </div>

          {groupMembersLoading && (
            <div className="text-sm text-muted-foreground">{t`Loading members...`}</div>
          )}
          {!groupMembersLoading && groupMembersError && (
            <div className="text-sm text-destructive">{groupMembersError}</div>
          )}
          {!groupMembersLoading && !groupMembersError && (
            <>
              {groupMembers.length === 0 ? (
                <div className="text-sm text-muted-foreground">{t`No members in this group.`}</div>
              ) : (
                <div className="space-y-2">
                  {groupMembers.map((member) => {
                    const assignee = assigneeByUserId.get(member.userId);
                    const isActive = assignee?.isActive ?? true;
                    return (
                      <div
                        key={member.userId}
                        className={`flex items-center gap-2 rounded-lg border px-3 transition-colors hover:bg-muted/40 ${
                          isMobile ? 'min-h-14 py-2.5' : 'py-2'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onGroupMemberClick(member.userId)}
                          className="flex-1 text-left min-w-0"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium leading-snug break-words line-clamp-2">
                              {member.displayName || member.email}
                            </span>
                            {!isActive && (
                              <Badge variant="secondary" className="text-[10px]">{t`Disabled`}</Badge>
                            )}
                            <Badge variant="outline" className="text-[10px]">
                              {roleLabels[member.role] ?? member.role}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground leading-snug break-words line-clamp-2">
                            {member.displayName ? member.email : t`View tasks`}
                          </div>
                        </button>
                        {isAdmin && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className={`shrink-0 p-0 text-muted-foreground hover:text-foreground ${isMobile ? 'h-11 w-11' : 'h-8 w-8'}`}
                                disabled={groupActionLoading}
                                aria-label={t`Member actions`}
                                data-testid={`group-member-actions-${member.userId}`}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onSelect={() => onMoveMember(member)}
                                disabled={groupActionLoading || !hasOtherGroups}
                              >
                                {t`Move to another group`}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => onRemoveMember(member)}
                                disabled={groupActionLoading}
                                className="text-destructive focus:text-destructive"
                              >
                                {t`Remove from group`}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {isMobile && (
        <MobileScreenShell
          open={addMemberScreenOpen}
          onOpenChange={(next) => {
            setAddMemberScreenOpen(next);
            if (!next) {
              setAddMemberSearch('');
              setShowDisabledAddMembers(false);
            }
          }}
          title={t`Add member`}
          toolbar={(
            <SearchInput
              value={addMemberSearch}
              onValueChange={setAddMemberSearch}
              placeholder={t`Search members...`}
              className="w-full"
              inputClassName="h-11 rounded-xl text-sm"
              clearLabel={t`Clear search`}
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
            />
          )}
        >
          <div className="space-y-3">
            <MobileListGroup>
              <MobileListRow
                title={t`Show disabled people`}
                right={(
                  <Switch
                    size="touch"
                    checked={showDisabledAddMembers}
                    onCheckedChange={setShowDisabledAddMembers}
                    aria-label={t`Show disabled people`}
                  />
                )}
              />
            </MobileListGroup>

            {addMemberEmptyState ? (
              <div className="space-y-1 px-1.5 py-6 text-sm text-muted-foreground">
                <div>{addMemberEmptyState.title}</div>
                {addMemberEmptyState.hint && (
                  <div className="text-xs">{addMemberEmptyState.hint}</div>
                )}
              </div>
            ) : (
              <MobileListGroup>
                {availableMembers.map((member) => (
                  <MobileListRow
                    key={member.userId}
                    title={member.displayName || member.email}
                    subtitle={member.displayName ? member.email : undefined}
                    value={member.isActive ? undefined : t`Disabled`}
                    disabled={groupActionLoading}
                    onClick={() => {
                      void onAddMember(member.userId);
                      setAddMemberScreenOpen(false);
                      setAddMemberSearch('');
                    }}
                  />
                ))}
              </MobileListGroup>
            )}
          </div>
        </MobileScreenShell>
      )}
    </div>
  );
};
