import React from 'react';
import { t } from '@lingui/macro';
import { ArrowDownAZ, ArrowDownZA, Layers } from 'lucide-react';
import { Assignee } from '@/features/planner/types/planner';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/shared/ui/context-menu';
import { Input } from '@/shared/ui/input';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { SegmentedControl, SegmentedControlItem } from '@/shared/ui/segmented-control';
import { SelectableListItem } from '@/shared/ui/selectable-list-item';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { cn } from '@/shared/lib/classNames';

type Mode = 'tasks' | 'access' | 'groups';
type Tab = 'active' | 'disabled';
type AccessTab = 'active' | 'disabled' | 'history';

type MemberGroupBucket = {
  id: string;
  name: string | null;
  members: Assignee[];
};

type GroupRecord = {
  id: string;
  workspace_id: string;
  name: string;
  created_at: string;
};

type MembersSidebarProps = {
  className?: string;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  isAdmin: boolean;
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  accessTab: AccessTab;
  onAccessTabChange: (tab: AccessTab) => void;
  accessSearch: string;
  onAccessSearchChange: (value: string) => void;
  activeAccessCount: number;
  disabledAccessCount: number;
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
};

export const MembersSidebar = ({
  className,
  mode,
  onModeChange,
  isAdmin,
  tab,
  onTabChange,
  accessTab,
  onAccessTabChange,
  accessSearch,
  onAccessSearchChange,
  activeAccessCount,
  disabledAccessCount,
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
  return (
    <aside className={cn('w-80 min-w-0 min-h-0 border-r border-border bg-card flex flex-col', className)}>
      <div className="px-4 py-3 border-b border-border">
        <SegmentedControl surface="filled">
          <SegmentedControlItem
            active={mode === 'tasks'}
            onClick={() => onModeChange('tasks')}
          >
            {t`People`}
          </SegmentedControlItem>
          {isAdmin && (
            <SegmentedControlItem
              active={mode === 'access'}
              onClick={() => onModeChange('access')}
            >
              {t`Access`}
            </SegmentedControlItem>
          )}
          <SegmentedControlItem
            active={mode === 'groups'}
            onClick={() => onModeChange('groups')}
          >
            {t`Groups`}
          </SegmentedControlItem>
        </SegmentedControl>
      </div>

      {mode === 'tasks' && (
        <Tabs
          value={tab}
          onValueChange={(value) => onTabChange(value as Tab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="px-4 py-3 border-b border-border">
            <div className="grid grid-cols-[1fr_auto] items-center gap-2">
              <Input
                className="h-8"
                placeholder={t`Search people...`}
                value={memberSearch}
                onChange={(event) => onMemberSearchChange(event.target.value)}
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
                      {group.members.map((assignee) => {
                        const count = memberTaskCountsDate
                          ? (memberTaskCounts[assignee.id] ?? 0)
                          : null;
                        return (
                          <SelectableListItem
                            key={assignee.id}
                            selected={selectedAssigneeId === assignee.id}
                            onClick={() => onSelectAssignee(assignee.id)}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium leading-snug break-words line-clamp-2">
                                {assignee.name}
                              </span>
                              {count !== null && (
                                <Badge variant="secondary" size="xs" className="ml-auto">
                                  {count}
                                </Badge>
                              )}
                            </div>
                          </SelectableListItem>
                        );
                      })}
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
                      {group.members.map((assignee) => {
                        const count = memberTaskCountsDate
                          ? (memberTaskCounts[assignee.id] ?? 0)
                          : null;
                        return (
                          <SelectableListItem
                            key={assignee.id}
                            selected={selectedAssigneeId === assignee.id}
                            onClick={() => onSelectAssignee(assignee.id)}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium leading-snug break-words line-clamp-2">
                                {assignee.name}
                              </span>
                              <Badge variant="secondary" size="xs">{t`Disabled`}</Badge>
                              {count !== null && (
                                <Badge variant="secondary" size="xs" className="ml-auto">
                                  {count}
                                </Badge>
                              )}
                            </div>
                          </SelectableListItem>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      )}

      {mode === 'access' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="px-4 py-3 border-b border-border space-y-3">
            <div className="space-y-2">
              {[
                {
                  value: 'active' as const,
                  label: t`Active`,
                  count: activeAccessCount,
                },
                {
                  value: 'disabled' as const,
                  label: t`Disabled`,
                  count: disabledAccessCount,
                },
                {
                  value: 'history' as const,
                  label: t`History`,
                },
              ].map((item) => (
                <SelectableListItem
                  key={item.value}
                  selected={accessTab === item.value}
                  size="lg"
                  onClick={() => onAccessTabChange(item.value)}
                  className="box-border"
                >
                  <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                    <span className="min-w-0 text-sm font-medium">{item.label}</span>
                    {typeof item.count === 'number' && (
                      <Badge variant="secondary" size="xs" className="h-5 min-w-6 justify-center px-1.5 tabular-nums">
                        {item.count}
                      </Badge>
                    )}
                    {typeof item.count !== 'number' && (
                      <span className="h-5 w-6" aria-hidden="true" />
                    )}
                  </div>
                </SelectableListItem>
              ))}
            </div>

            {accessTab !== 'history' && (
              <Input
                className="h-8"
                placeholder={t`Search people...`}
                value={accessSearch}
                onChange={(event) => onAccessSearchChange(event.target.value)}
              />
            )}
          </div>
        </div>
      )}

      {mode === 'groups' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="px-4 py-3 border-b border-border space-y-2">
            <div className="grid grid-cols-[1fr_auto] items-center gap-2">
              <Input
                className="h-8"
                placeholder={t`Search groups...`}
                value={groupSearch}
                onChange={(event) => onGroupSearchChange(event.target.value)}
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
