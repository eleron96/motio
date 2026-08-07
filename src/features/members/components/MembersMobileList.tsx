import React from 'react';
import { t } from '@lingui/macro';
import { MoreHorizontal } from 'lucide-react';
import { Assignee } from '@/features/planner/types/planner';
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

interface MembersMobileListProps {
  /** Which list this deck page holds. */
  mode: 'tasks' | 'groups';
  isAdmin: boolean;
  groupActionLoading: boolean;

  tab: 'active' | 'disabled';
  onTabChange: (tab: 'active' | 'disabled') => void;
  memberSearch: string;
  onMemberSearchChange: (value: string) => void;
  activeVisibleAssignees: Assignee[];
  disabledVisibleAssignees: Assignee[];
  onOpenAssignee: (assigneeId: string) => void;
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
  onOpenGroup: (groupId: string) => void;
  onRenameGroup: (group: GroupRecord) => void;
  onDeleteGroup: (group: GroupRecord) => void;
}

/**
 * The list itself, living in the swipe deck rather than behind a button.
 *
 * A phone shows one thing at a time: this page is the list of people (or of
 * groups), and tapping a row walks into it. The rows carry a chevron because
 * they lead somewhere, and the row menu hangs beside the row — a row is itself
 * a button, and nesting one button in another is invalid markup whose taps
 * land on the wrong target.
 */
export const MembersMobileList: React.FC<MembersMobileListProps> = ({
  mode,
  isAdmin,
  groupActionLoading,
  tab,
  onTabChange,
  memberSearch,
  onMemberSearchChange,
  activeVisibleAssignees,
  disabledVisibleAssignees,
  onOpenAssignee,
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
  onOpenGroup,
  onRenameGroup,
  onDeleteGroup,
}) => {
  const listingPeople = mode === 'tasks';
  const people = tab === 'active' ? activeVisibleAssignees : disabledVisibleAssignees;

  const renderRowMenu = (label: string, testId: string, items: React.ReactNode) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          data-testid={testId}
          className="absolute right-1.5 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-muted/60"
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{items}</DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2.5 border-b border-border bg-card px-3.5 py-2.5">
        {listingPeople ? (
          <>
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
            {/* The strip is a control, not a page: swiping it must not flip the
                deck under the finger. */}
            <div data-swipe-ignore>
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
          </>
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
        )}
      </div>

      {/* overflow-x-hidden is not decoration: with only overflow-y set, CSS
          computes overflow-x as `auto` too, and the deck then reads this list
          as a horizontal scroller and hands it every sideways gesture. */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3.5 py-3">
        {listingPeople ? (
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
                      chevron
                      onClick={() => onOpenAssignee(assignee.id)}
                      className={canManageGroup ? 'pr-24' : undefined}
                    />
                    {canManageGroup && renderRowMenu(
                      t`Member actions`,
                      `assignee-actions-${assignee.id}`,
                      (
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
                      ),
                    )}
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
                      chevron
                      onClick={() => onOpenGroup(group.id)}
                      className={isAdmin ? 'pr-20' : undefined}
                    />
                    {isAdmin && renderRowMenu(
                      t`Group actions`,
                      `group-actions-${group.id}`,
                      (
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
                      ),
                    )}
                  </div>
                ))}
              </MobileListGroup>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
