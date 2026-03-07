import React from 'react';
import { t } from '@lingui/macro';
import { ArrowDownAZ, ArrowDownZA, Layers } from 'lucide-react';
import { Assignee } from '@/features/planner/types/planner';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/shared/ui/context-menu';
import { Input } from '@/shared/ui/input';
import { ScrollArea } from '@/shared/ui/scroll-area';
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
        <div className="inline-flex items-center gap-2 rounded-lg bg-muted/60 p-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onModeChange('tasks')}
            className={cn(
              'h-7 px-3 text-xs rounded-md',
              mode === 'tasks' && 'bg-foreground text-background shadow-sm'
            )}
          >
            {t`People`}
          </Button>
          {isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onModeChange('access')}
              className={cn(
                'h-7 px-3 text-xs rounded-md',
                mode === 'access' && 'bg-foreground text-background shadow-sm'
              )}
            >
              {t`Access`}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onModeChange('groups')}
            className={cn(
              'h-7 px-3 text-xs rounded-md',
              mode === 'groups' && 'bg-foreground text-background shadow-sm'
            )}
          >
            {t`Groups`}
          </Button>
        </div>
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
                          <button
                            key={assignee.id}
                            type="button"
                            onClick={() => onSelectAssignee(assignee.id)}
                            className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                              selectedAssigneeId === assignee.id ? 'border-foreground/60 bg-muted/60' : 'border-border hover:bg-muted/40'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium leading-snug break-words line-clamp-2">
                                {assignee.name}
                              </span>
                              {count !== null && (
                                <Badge variant="secondary" className="ml-auto text-[10px]">
                                  {count}
                                </Badge>
                              )}
                            </div>
                          </button>
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
                          <button
                            key={assignee.id}
                            type="button"
                            onClick={() => onSelectAssignee(assignee.id)}
                            className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                              selectedAssigneeId === assignee.id ? 'border-foreground/60 bg-muted/60' : 'border-border hover:bg-muted/40'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium leading-snug break-words line-clamp-2">
                                {assignee.name}
                              </span>
                              <Badge variant="secondary" className="text-[10px]">{t`Disabled`}</Badge>
                              {count !== null && (
                                <Badge variant="secondary" className="ml-auto text-[10px]">
                                  {count}
                                </Badge>
                              )}
                            </div>
                          </button>
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
                <button
                  key={item.value}
                  type="button"
                  onClick={() => onAccessTabChange(item.value)}
                  className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                    accessTab === item.value
                      ? 'border-foreground/60 bg-muted/60'
                      : 'border-border hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{item.label}</span>
                    {typeof item.count === 'number' && (
                      <Badge variant="secondary" className="ml-auto text-[10px]">
                        {item.count}
                      </Badge>
                    )}
                  </div>
                </button>
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
                      <button
                        type="button"
                        onClick={() => onSelectGroup(group.id)}
                        onContextMenu={() => onSelectGroup(group.id)}
                        className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                          selectedGroupId === group.id ? 'border-foreground/60 bg-muted/60' : 'border-border hover:bg-muted/40'
                        }`}
                      >
                        <div className="text-sm font-medium leading-snug break-words line-clamp-2">{group.name}</div>
                      </button>
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
