import React from 'react';
import { t } from '@lingui/macro';
import { ArrowDownAZ, ArrowDownZA, ChevronDown, Layers, MoreHorizontal, Search } from 'lucide-react';
import { Assignee } from '@/features/planner/types/planner';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/shared/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { SearchInput } from '@/shared/ui/SearchInput';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { SegmentedControl, SegmentedControlItem } from '@/shared/ui/segmented-control';
import { SelectableListItem } from '@/shared/ui/selectable-list-item';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { cn } from '@/shared/lib/classNames';

type Mode = 'tasks' | 'groups';
type Tab = 'active' | 'disabled';

type MemberGroupBucket = {
  id: string;
  name: string | null;
  members: Assignee[];
};

type GroupRecord = {
  id: string;
  name: string;
};

type MembersSidebarProps = {
  className?: string;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  isAdmin: boolean;
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  memberSearch: string;
  onMemberSearchChange: (value: string) => void;
  memberSort: 'asc' | 'desc';
  memberSortLabel: string;
  onToggleMemberSort: () => void;
  memberGroupBy: 'none' | 'group';
  onToggleMemberGroupBy: () => void;
  activeVisibleAssignees: Assignee[];
  disabledVisibleAssignees: Assignee[];
  activeMemberGroups: MemberGroupBucket[];
  disabledMemberGroups: MemberGroupBucket[];
  selectedAssigneeId: string | null;
  onSelectAssignee: (assigneeId: string) => void;
  memberTaskCountsDate: string | null;
  memberTaskCounts: Record<string, number>;
  /** userId -> the group they are in, for the caption under each name. */
  groupIdByUserId: Map<string, string | null>;
  groupNameById: Map<string, string>;
  onAssignAssigneeGroup: (assignee: Assignee) => void;
  onClearAssigneeGroup: (assignee: Assignee) => void;
  groupActionLoading: boolean;
  groupSearch: string;
  onGroupSearchChange: (value: string) => void;
  groupSort: 'asc' | 'desc';
  groupSortLabel: string;
  onToggleGroupSort: () => void;
  groupsError: string;
  creatingGroup: boolean;
  groupsLoading: boolean;
  sortedGroups: GroupRecord[];
  selectedGroupId: string | null;
  onSelectGroup: (groupId: string) => void;
  onStartEditGroup: (group: GroupRecord) => void;
  onDeleteGroup: (group: GroupRecord) => void;
  hideModeSelector?: boolean;
};

export const MembersSidebar = ({
  className,
  mode,
  onModeChange,
  isAdmin,
  hideModeSelector = false,
  tab,
  onTabChange,
  memberSearch,
  onMemberSearchChange,
  memberSort,
  memberSortLabel,
  onToggleMemberSort,
  memberGroupBy,
  onToggleMemberGroupBy,
  activeVisibleAssignees,
  disabledVisibleAssignees,
  activeMemberGroups,
  disabledMemberGroups,
  selectedAssigneeId,
  onSelectAssignee,
  memberTaskCountsDate,
  memberTaskCounts,
  groupIdByUserId,
  groupNameById,
  onAssignAssigneeGroup,
  onClearAssigneeGroup,
  groupActionLoading,
  groupSearch,
  onGroupSearchChange,
  groupSort,
  groupSortLabel,
  onToggleGroupSort,
  groupsError,
  creatingGroup,
  groupsLoading,
  sortedGroups,
  selectedGroupId,
  onSelectGroup,
  onStartEditGroup,
  onDeleteGroup,
}: MembersSidebarProps) => {
  const [mobileFiltersOpen, setMobileFiltersOpen] = React.useState(false);
  const compactFilters = hideModeSelector;
  const hasActiveTaskFilters = memberSearch.trim().length > 0
    || memberSort !== 'asc'
    || memberGroupBy !== 'none';

  const renderAssigneeRow = (assignee: Assignee, options: { showDisabledBadge?: boolean } = {}) => {
    const count = memberTaskCountsDate ? (memberTaskCounts[assignee.id] ?? 0) : null;
    // Group membership hangs off the workspace account: people added by name
    // only have nothing to assign a group to.
    const userId = assignee.userId ?? null;
    const canManageGroup = isAdmin && Boolean(userId);
    const currentGroupId = userId ? (groupIdByUserId.get(userId) ?? null) : null;
    const currentGroupName = currentGroupId ? (groupNameById.get(currentGroupId) ?? null) : null;
    // With the list already bucketed by group, the caption would repeat the
    // heading right above it.
    const showGroupCaption = Boolean(userId) && memberGroupBy !== 'group';

    const menuItems = (
      <>
        <ContextMenuItem onSelect={() => onAssignAssigneeGroup(assignee)} disabled={groupActionLoading}>
          {currentGroupId ? t`Change group` : t`Assign a group`}
        </ContextMenuItem>
        {currentGroupId && (
          <ContextMenuItem
            onSelect={() => onClearAssigneeGroup(assignee)}
            disabled={groupActionLoading}
            className="text-destructive focus:text-destructive"
          >
            {t`Remove from group`}
          </ContextMenuItem>
        )}
      </>
    );

    const row = (
      <div className="relative">
        <SelectableListItem
          selected={selectedAssigneeId === assignee.id}
          onClick={() => onSelectAssignee(assignee.id)}
          className={cn(canManageGroup && 'pr-11')}
        >
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium leading-snug break-words line-clamp-2">
                {assignee.name}
              </span>
              {showGroupCaption && (
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {currentGroupName ?? t`No group`}
                </span>
              )}
            </span>
            {options.showDisabledBadge && (
              <Badge variant="secondary" size="xs">{t`Disabled`}</Badge>
            )}
            {count !== null && (
              <Badge variant="secondary" size="xs" className="ml-auto">
                {count}
              </Badge>
            )}
          </div>
        </SelectableListItem>

        {canManageGroup && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground',
                  compactFilters ? 'h-9 w-9' : 'h-7 w-7',
                )}
                aria-label={t`Member actions`}
                data-testid={`assignee-actions-${assignee.id}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
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
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    );

    if (!canManageGroup) {
      return <React.Fragment key={assignee.id}>{row}</React.Fragment>;
    }

    return (
      <ContextMenu key={assignee.id}>
        <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
        <ContextMenuContent>{menuItems}</ContextMenuContent>
      </ContextMenu>
    );
  };

  return (
    <aside className={cn('w-80 min-w-0 min-h-0 border-r border-border bg-card flex flex-col', className)}>
      {hideModeSelector ? null : (
        <div className="px-4 py-3 border-b border-border">
          <SegmentedControl surface="filled">
            <SegmentedControlItem
              active={mode === 'tasks'}
              onClick={() => onModeChange('tasks')}
              data-tour="members-people-tab"
            >
              {t`People`}
            </SegmentedControlItem>
            <SegmentedControlItem
              active={mode === 'groups'}
              onClick={() => onModeChange('groups')}
              data-tour="members-groups-tab"
            >
              {t`Groups`}
            </SegmentedControlItem>
          </SegmentedControl>
        </div>
      )}

      {mode === 'tasks' && (
        <Tabs
          value={tab}
          onValueChange={(value) => onTabChange(value as Tab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          {compactFilters ? (
            <div className="border-b border-border">
              <button
                type="button"
                onClick={() => setMobileFiltersOpen((open) => !open)}
                aria-expanded={mobileFiltersOpen}
                className="flex w-full items-center justify-between px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/40"
              >
                <span className="inline-flex items-center gap-2">
                  <Search className="h-3.5 w-3.5" />
                  {t`Search & filters`}
                  {hasActiveTaskFilters && !mobileFiltersOpen ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                  ) : null}
                </span>
                <ChevronDown
                  className={cn('h-4 w-4 transition-transform', mobileFiltersOpen && 'rotate-180')}
                />
              </button>
            </div>
          ) : null}
          <div
            className={cn(
              compactFilters
                ? mobileFiltersOpen
                  ? 'px-4 pb-3 pt-1 border-b border-border'
                  : 'hidden'
                : 'px-4 py-3 border-b border-border',
            )}
          >
            <div className="grid grid-cols-[1fr_auto] items-center gap-2">
              <SearchInput
                inputClassName="h-8"
                placeholder={t`Search people...`}
                value={memberSearch}
                onValueChange={onMemberSearchChange}
                clearLabel={t`Clear search`}
              />
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-2 px-2"
                  onClick={onToggleMemberSort}
                >
                  {memberSort === 'asc' ? (
                    <ArrowDownAZ className="h-4 w-4" />
                  ) : (
                    <ArrowDownZA className="h-4 w-4" />
                  )}
                  <span className="text-xs text-muted-foreground">{memberSortLabel}</span>
                </Button>
                <Button
                  variant={memberGroupBy === 'group' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 px-2"
                  onClick={onToggleMemberGroupBy}
                  aria-pressed={memberGroupBy === 'group'}
                  title={t`Group by group`}
                >
                  <Layers className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          {/* Group changes start here too, so a failed one has to be readable
              here — not only on the Groups tab where the error used to live. */}
          {groupsError && (
            <div className="px-4 pt-2 text-xs text-destructive">{groupsError}</div>
          )}

          <TabsList className="mx-4 mt-2 grid grid-cols-2">
            <TabsTrigger value="active">{t`Active`}</TabsTrigger>
            <TabsTrigger value="disabled">{t`Disabled`}</TabsTrigger>
          </TabsList>
          <TabsContent value="active" className="flex-1 min-h-0 overflow-hidden">
            <ScrollArea className="h-full px-4 py-3">
              {activeVisibleAssignees.length === 0 && (
                <div className="text-sm text-muted-foreground">{t`No active members.`}</div>
              )}
              {activeVisibleAssignees.length > 0 && (
                <div className="space-y-3">
                  {activeMemberGroups.map((group) => (
                    <div key={group.id} className="space-y-2">
                      {memberGroupBy === 'group' && (
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">
                          {group.name}
                        </div>
                      )}
                      {group.members.map((assignee) => renderAssigneeRow(assignee))}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
          <TabsContent value="disabled" className="flex-1 min-h-0 overflow-hidden">
            <ScrollArea className="h-full px-4 py-3">
              {disabledVisibleAssignees.length === 0 && (
                <div className="text-sm text-muted-foreground">{t`No disabled members.`}</div>
              )}
              {disabledVisibleAssignees.length > 0 && (
                <div className="space-y-3">
                  {disabledMemberGroups.map((group) => (
                    <div key={group.id} className="space-y-2">
                      {memberGroupBy === 'group' && (
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">
                          {group.name}
                        </div>
                      )}
                      {group.members.map((assignee) => (
                        renderAssigneeRow(assignee, { showDisabledBadge: true })
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      )}

      {mode === 'groups' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="px-4 py-3 border-b border-border space-y-2">
            <div className="grid grid-cols-[1fr_auto] items-center gap-2">
              <SearchInput
                inputClassName="h-8"
                placeholder={t`Search groups...`}
                value={groupSearch}
                onValueChange={onGroupSearchChange}
                clearLabel={t`Clear search`}
              />
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-2 px-2"
                  onClick={onToggleGroupSort}
                >
                  {groupSort === 'asc' ? (
                    <ArrowDownAZ className="h-4 w-4" />
                  ) : (
                    <ArrowDownZA className="h-4 w-4" />
                  )}
                  <span className="text-xs text-muted-foreground">{groupSortLabel}</span>
                </Button>
              </div>
            </div>
            {groupsError && !creatingGroup && (
              <div className="text-xs text-destructive">{groupsError}</div>
            )}
          </div>
          <ScrollArea className="h-full px-4 py-3">
            {groupsLoading && (
              <div className="text-sm text-muted-foreground">{t`Loading groups...`}</div>
            )}
            {!groupsLoading && sortedGroups.length === 0 && (
              <div className="text-sm text-muted-foreground">{t`No groups yet.`}</div>
            )}
            {!groupsLoading && sortedGroups.length > 0 && (
              <div className="space-y-2">
                {sortedGroups.map((group) => (
                  <ContextMenu key={group.id}>
                    <ContextMenuTrigger asChild>
                      <SelectableListItem
                        selected={selectedGroupId === group.id}
                        onClick={() => onSelectGroup(group.id)}
                        onContextMenu={() => onSelectGroup(group.id)}
                      >
                        <div className="text-sm font-medium leading-snug break-words line-clamp-2">{group.name}</div>
                      </SelectableListItem>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem
                        disabled={!isAdmin}
                        onSelect={() => {
                          onSelectGroup(group.id);
                          onStartEditGroup(group);
                        }}
                      >
                        {t`Rename`}
                      </ContextMenuItem>
                      <ContextMenuItem
                        disabled={!isAdmin}
                        onSelect={() => onDeleteGroup(group)}
                        className="text-destructive focus:text-destructive"
                      >
                        {t`Delete`}
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </aside>
  );
};
