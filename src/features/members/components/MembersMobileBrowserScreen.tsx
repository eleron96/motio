import React from 'react';
import { t } from '@lingui/macro';
import { MoreHorizontal } from 'lucide-react';
import { Assignee } from '@/features/planner/types/planner';
import { MobileScreenShell } from '@/shared/ui/mobile-screen-shell';
import { MobileListGroup, MobileListRow } from '@/shared/ui/mobile-list';
import { SearchInput } from '@/shared/ui/SearchInput';
import { SegmentedControl, SegmentedControlItem } from '@/shared/ui/segmented-control';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';

type GroupRecord = {
  id: string;
  name: string;
};

interface MembersMobileBrowserScreenProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which list the screen opens on — the page's current section. */
  mode: 'tasks' | 'groups';
  isAdmin: boolean;
  groupActionLoading: boolean;

  tab: 'active' | 'disabled';
  onTabChange: (tab: 'active' | 'disabled') => void;
  memberSearch: string;
  onMemberSearchChange: (value: string) => void;
  activeVisibleAssignees: Assignee[];
  disabledVisibleAssignees: Assignee[];
  selectedAssigneeId: string | null;
  onSelectAssignee: (assigneeId: string) => void;
  memberTaskCounts: Record<string, number>;
  memberTaskCountsDate: string | null;
  groupIdByUserId: Map<string, string | null>;
  groupNameById: Map<string, string>;
  onAssignAssigneeGroup: (assignee: Assignee) => void;
  onClearAssigneeGroup: (assignee: Assignee) => void;

  groupSearch: string;
  onGroupSearchChange: (value: string) => void;
  sortedGroups: GroupRecord[];
  groupsLoading: boolean;
  groupsError: string;
  selectedGroupId: string | null;
  onSelectGroup: (groupId: string) => void;
  onRenameGroup: (group: GroupRecord) => void;
  onDeleteGroup: (group: GroupRecord) => void;
}

/**
 * Picking a person or a group on a phone.
 *
 * A full screen rather than the desktop sidebar squeezed into a drawer: the
 * rows are thumb-sized, the search sits under the header where the keyboard
 * cannot bury it, and swiping right goes back the way the platform trains you
 * to expect. Row actions that used to hide behind a right-click — renaming and
 * deleting a group — are reachable here, since a phone has no right-click.
 */
export const MembersMobileBrowserScreen: React.FC<MembersMobileBrowserScreenProps> = ({
  open,
  onOpenChange,
  mode,
  isAdmin,
  groupActionLoading,
  tab,
  onTabChange,
  memberSearch,
  onMemberSearchChange,
  activeVisibleAssignees,
  disabledVisibleAssignees,
  selectedAssigneeId,
  onSelectAssignee,
  memberTaskCounts,
  memberTaskCountsDate,
  groupIdByUserId,
  groupNameById,
  onAssignAssigneeGroup,
  onClearAssigneeGroup,
  groupSearch,
  onGroupSearchChange,
  sortedGroups,
  groupsLoading,
  groupsError,
  selectedGroupId,
  onSelectGroup,
  onRenameGroup,
  onDeleteGroup,
}) => {
  const browsingPeople = mode === 'tasks';
  const people = tab === 'active' ? activeVisibleAssignees : disabledVisibleAssignees;

  const toolbar = browsingPeople ? (
    <div className="space-y-2.5">
      <SearchInput
        value={memberSearch}
        onValueChange={onMemberSearchChange}
        placeholder={t`Search people...`}
        className="w-full"
        inputClassName="h-11 rounded-xl text-sm"
        clearLabel={t`Clear search`}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
      />
      <SegmentedControl surface="filled" className="w-full">
        <SegmentedControlItem
          size="touch"
          fullWidth
          active={tab === 'active'}
          onClick={() => onTabChange('active')}
        >
          {t`Active`}
        </SegmentedControlItem>
        <SegmentedControlItem
          size="touch"
          fullWidth
          active={tab === 'disabled'}
          onClick={() => onTabChange('disabled')}
        >
          {t`Disabled`}
        </SegmentedControlItem>
      </SegmentedControl>
    </div>
  ) : (
    <SearchInput
      value={groupSearch}
      onValueChange={onGroupSearchChange}
      placeholder={t`Search groups...`}
      className="w-full"
      inputClassName="h-11 rounded-xl text-sm"
      clearLabel={t`Clear search`}
      autoComplete="off"
      spellCheck={false}
      enterKeyHint="search"
    />
  );

  // The trigger sits beside the row, not inside it: a row is itself a button,
  // and nesting one in another is invalid markup whose taps land on the wrong
  // target. z-[70] keeps the menu above this screen (z-[60]).
  const renderRowMenu = (label: string, items: React.ReactNode) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="absolute right-1.5 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-muted/60"
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[70]">
        {items}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <MobileScreenShell
      open={open}
      onOpenChange={onOpenChange}
      title={browsingPeople ? t`People` : t`Groups`}
      toolbar={toolbar}
    >
      {browsingPeople ? (
        people.length === 0 ? (
          <p className="px-1.5 py-6 text-sm text-muted-foreground">
            {tab === 'active' ? t`No active members.` : t`No disabled members.`}
          </p>
        ) : (
          <MobileListGroup>
            {people.map((assignee) => {
              const userId = assignee.userId ?? null;
              const canManageGroup = isAdmin && Boolean(userId);
              const currentGroupId = userId ? (groupIdByUserId.get(userId) ?? null) : null;
              const currentGroupName = currentGroupId
                ? (groupNameById.get(currentGroupId) ?? null)
                : null;
              const count = memberTaskCountsDate ? (memberTaskCounts[assignee.id] ?? 0) : null;

              return (
                <div key={assignee.id} className="relative">
                  <MobileListRow
                    title={assignee.name}
                    subtitle={userId ? (currentGroupName ?? t`No group`) : undefined}
                    value={count !== null ? count : undefined}
                    selected={selectedAssigneeId === assignee.id}
                    onClick={() => onSelectAssignee(assignee.id)}
                    className={canManageGroup ? 'pr-14' : undefined}
                  />
                  {canManageGroup && renderRowMenu(t`Member actions`, (
                    <>
                      <DropdownMenuItem
                        onSelect={() => onAssignAssigneeGroup(assignee)}
                        disabled={groupActionLoading}
                      >
                        {currentGroupId ? t`Change group` : t`Assign a group`}
                      </DropdownMenuItem>
                      {currentGroupId && (
                        <DropdownMenuItem
                          onSelect={() => onClearAssigneeGroup(assignee)}
                          disabled={groupActionLoading}
                          className="text-destructive focus:text-destructive"
                        >
                          {t`Remove from group`}
                        </DropdownMenuItem>
                      )}
                    </>
                  ))}
                </div>
              );
            })}
          </MobileListGroup>
        )
      ) : (
        <div className="space-y-3">
          {groupsError && (
            <p className="px-1.5 text-sm text-destructive">{groupsError}</p>
          )}
          {groupsLoading && (
            <p className="px-1.5 py-6 text-sm text-muted-foreground">{t`Loading groups...`}</p>
          )}
          {!groupsLoading && sortedGroups.length === 0 && (
            <p className="px-1.5 py-6 text-sm text-muted-foreground">{t`No groups yet.`}</p>
          )}
          {!groupsLoading && sortedGroups.length > 0 && (
            <MobileListGroup>
              {sortedGroups.map((group) => (
                <div key={group.id} className="relative">
                  <MobileListRow
                    title={group.name}
                    selected={selectedGroupId === group.id}
                    onClick={() => onSelectGroup(group.id)}
                    className={isAdmin ? 'pr-14' : undefined}
                  />
                  {isAdmin && renderRowMenu(t`Group actions`, (
                    <>
                      <DropdownMenuItem
                        onSelect={() => onRenameGroup(group)}
                        disabled={groupActionLoading}
                      >
                        {t`Rename`}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => onDeleteGroup(group)}
                        disabled={groupActionLoading}
                        className="text-destructive focus:text-destructive"
                      >
                        {t`Delete`}
                      </DropdownMenuItem>
                    </>
                  ))}
                </div>
              ))}
            </MobileListGroup>
          )}
        </div>
      )}
    </MobileScreenShell>
  );
};
