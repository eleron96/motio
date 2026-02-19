import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore, WorkspaceRole } from '@/features/auth/store/authStore';
import { WorkspaceSwitcher } from '@/features/workspace/components/WorkspaceSwitcher';
import { WorkspaceNav } from '@/features/workspace/components/WorkspaceNav';
import { SettingsPanel } from '@/features/workspace/components/SettingsPanel';
import { AccountSettingsDialog } from '@/features/auth/components/AccountSettingsDialog';
import { InviteNotifications } from '@/features/auth/components/InviteNotifications';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { Badge } from '@/shared/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Checkbox } from '@/shared/ui/checkbox';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/shared/ui/context-menu';
import { supabase } from '@/shared/lib/supabaseClient';
import { t } from '@lingui/macro';
import { formatStatusLabel } from '@/shared/lib/statusLabels';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { cn } from '@/shared/lib/classNames';
import { addYears, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { Settings, User, RefreshCcw, ArrowDownAZ, ArrowDownZA, Layers, Plus } from 'lucide-react';
import { Task } from '@/features/planner/types/planner';
import { WorkspaceMembersPanel } from '@/features/workspace/components/WorkspaceMembersPanel';
import DOMPurify from 'dompurify';
import { compareNames } from '@/shared/lib/nameSorting';
import { Label } from '@/shared/ui/label';

type TaskRow = {
  id: string;
  title: string;
  project_id: string | null;
  assignee_id: string | null;
  assignee_ids: string[] | null;
  start_date: string;
  end_date: string;
  status_id: string;
  type_id: string;
  priority: string | null;
  tag_ids: string[] | null;
  description: string | null;
  repeat_id: string | null;
};

type AssigneeUniqueTaskCountRow = {
  assignee_id: string | null;
  total: number | string | null;
};

type MemberGroup = {
  id: string;
  workspace_id: string;
  name: string;
  created_at: string;
};

type GroupMemberRow = {
  user_id: string;
  role: WorkspaceRole;
  profiles: { email: string; display_name: string | null } | null;
};

type GroupMember = {
  userId: string;
  role: WorkspaceRole;
  email: string;
  displayName: string | null;
};

type DisplayTaskRow = {
  key: string;
  task: Task;
  taskIds: string[];
  repeatMeta: {
    label: string;
    remaining: number;
    total: number;
  } | null;
};

const normalizeAssigneeIds = (assigneeIds: string[] | null | undefined, legacyId: string | null | undefined) => {
  const combined = [
    ...(assigneeIds ?? []),
    ...(legacyId ? [legacyId] : []),
  ];
  return Array.from(new Set(combined.filter(Boolean)));
};

const mapTaskRow = (row: TaskRow): Task => ({
  id: row.id,
  title: row.title,
  projectId: row.project_id,
  assigneeIds: normalizeAssigneeIds(row.assignee_ids, row.assignee_id),
  startDate: row.start_date,
  endDate: row.end_date,
  statusId: row.status_id,
  typeId: row.type_id,
  priority: row.priority as Task['priority'],
  tagIds: row.tag_ids ?? [],
  description: row.description,
  repeatId: row.repeat_id ?? null,
});

const hasRichTags = (value: string) => (
  /<\/?(b|strong|i|em|u|s|strike|ul|ol|li|blockquote|br|div|p|span|img)\b/i.test(value)
);

const sanitizeDescription = (value: string) => (
  DOMPurify.sanitize(value, {
    ALLOWED_TAGS: [
      'b',
      'strong',
      'i',
      'em',
      'u',
      's',
      'strike',
      'ul',
      'ol',
      'li',
      'blockquote',
      'br',
      'div',
      'p',
      'span',
      'img',
    ],
    ALLOWED_ATTR: ['src', 'alt', 'style', 'width', 'height'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|data:image\/)|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
  })
);

const inferRepeatLabel = (tasks: Task[]) => {
  if (tasks.length < 2) return 'Повторяющаяся';
  const sorted = [...tasks].sort((left, right) => left.startDate.localeCompare(right.startDate));
  const first = parseISO(sorted[0].startDate);
  const second = parseISO(sorted[1].startDate);
  const diffDays = Math.abs(differenceInCalendarDays(second, first));
  if (diffDays === 1) return 'Ежедневная';
  if (diffDays === 7) return 'Еженедельная';
  if (diffDays >= 28 && diffDays <= 31) return 'Ежемесячная';
  if (diffDays >= 364 && diffDays <= 366) return 'Ежегодная';
  return 'Повторяющаяся';
};

const countTaskUnits = (tasks: Task[]) => {
  const units = new Set<string>();
  tasks.forEach((task) => {
    units.add(task.repeatId ? `r:${task.repeatId}` : `t:${task.id}`);
  });
  return units.size;
};

const MembersPage = () => {
  const [showSettings, setShowSettings] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [tab, setTab] = useState<'active' | 'disabled'>('active');
  const [mode, setMode] = useState<'tasks' | 'access' | 'groups'>('tasks');
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string | null>(null);
  const [assigneeTasks, setAssigneeTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState('');
  const [search, setSearch] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [memberSort, setMemberSort] = useState<'asc' | 'desc'>('asc');
  const [memberGroupBy, setMemberGroupBy] = useState<'none' | 'group'>('none');
  const [statusFilterIds, setStatusFilterIds] = useState<string[]>([]);
  const [projectFilterIds, setProjectFilterIds] = useState<string[]>([]);
  const [taskScope, setTaskScope] = useState<'current' | 'past'>('current');
  const [pastFromDate, setPastFromDate] = useState('');
  const [pastToDate, setPastToDate] = useState('');
  const [pastSort, setPastSort] = useState<'start_desc' | 'start_asc' | 'end_desc' | 'end_asc' | 'title_asc' | 'title_desc'>('end_desc');
  const [pageIndex, setPageIndex] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [groups, setGroups] = useState<MemberGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState('');
  const [groupSort, setGroupSort] = useState<'asc' | 'desc'>('asc');
  const [groupSearch, setGroupSearch] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [groupMembersLoading, setGroupMembersLoading] = useState(false);
  const [groupMembersError, setGroupMembersError] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupActionLoading, setGroupActionLoading] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  const [memberTaskCounts, setMemberTaskCounts] = useState<Record<string, number>>({});
  const [memberTaskCountsDate, setMemberTaskCountsDate] = useState<string | null>(null);
  const pageSize = 100;

  const {
    assignees,
    memberGroupAssignments,
    projects,
    statuses,
    taskTypes,
    tags,
    loadWorkspaceData,
    refreshMemberGroups,
    deleteTasks,
    setHighlightedTaskId,
    setViewMode,
    setCurrentDate,
    requestScrollToDate,
    clearFilters,
  } = usePlannerStore();

  const {
    user,
    currentWorkspaceId,
    currentWorkspaceRole,
    isSuperAdmin,
  } = useAuthStore();

  const canEdit = currentWorkspaceRole === 'editor' || currentWorkspaceRole === 'admin';
  const isAdmin = currentWorkspaceRole === 'admin';
  const roleLabels: Record<WorkspaceRole, string> = {
    admin: t`Admin`,
    editor: t`Editor`,
    viewer: t`Viewer`,
  };
  const memberSortLabel = memberSort === 'asc' ? t`A-Z` : t`Z-A`;
  const groupSortLabel = groupSort === 'asc' ? t`A-Z` : t`Z-A`;
  const navigate = useNavigate();
  const modeToggle = (
    <div className="inline-flex items-center gap-2 rounded-lg bg-muted/60 p-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setMode('tasks')}
        className={cn(
          'h-7 px-3 text-xs rounded-md',
          mode === 'tasks' && 'bg-foreground text-background shadow-sm'
        )}
      >
        {t`Tasks`}
      </Button>
      {isAdmin && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setMode('access')}
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
        onClick={() => setMode('groups')}
        className={cn(
          'h-7 px-3 text-xs rounded-md',
          mode === 'groups' && 'bg-foreground text-background shadow-sm'
        )}
      >
        {t`Groups`}
      </Button>
    </div>
  );
  const scopeToggle = (
    <div className="inline-flex items-center gap-2 rounded-lg bg-muted/60 p-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setTaskScope('current');
          setPageIndex(1);
        }}
        className={cn(
          'h-7 px-3 text-xs rounded-md',
          taskScope === 'current' && 'bg-foreground text-background shadow-sm'
        )}
      >
        {t`Current`}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setTaskScope('past');
          setPageIndex(1);
        }}
        className={cn(
          'h-7 px-3 text-xs rounded-md',
          taskScope === 'past' && 'bg-foreground text-background shadow-sm'
        )}
      >
        {t`Past`}
      </Button>
    </div>
  );
  const modeStorageKey = currentWorkspaceId
    ? `members-mode-${currentWorkspaceId}`
    : user?.id
    ? `members-mode-user-${user.id}`
    : 'members-mode';
  const tasksViewPrefsStorageKey = currentWorkspaceId
    ? `members-tasks-view-prefs-${currentWorkspaceId}`
    : user?.id
    ? `members-tasks-view-prefs-user-${user.id}`
    : 'members-tasks-view-prefs';
  const modeHydratedRef = useRef(false);
  const tasksViewPrefsHydratedRef = useRef(false);

  useEffect(() => {
    if (currentWorkspaceId) {
      loadWorkspaceData(currentWorkspaceId);
    }
  }, [currentWorkspaceId, loadWorkspaceData]);

  useEffect(() => {
    if (currentWorkspaceId) return;
    setMemberTaskCounts({});
    setMemberTaskCountsDate(null);
  }, [currentWorkspaceId]);

  useEffect(() => {
    modeHydratedRef.current = false;
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(modeStorageKey);
    if (saved === 'tasks' || saved === 'groups' || (saved === 'access' && isAdmin)) {
      setMode(saved);
    } else if (saved === 'access' && !isAdmin) {
      setMode('tasks');
    }
    modeHydratedRef.current = true;
  }, [isAdmin, modeStorageKey]);

  useEffect(() => {
    if (mode !== 'access') return;
    if (!isAdmin) {
      setMode('tasks');
    }
  }, [isAdmin, mode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!modeHydratedRef.current) return;
    window.localStorage.setItem(modeStorageKey, mode);
  }, [mode, modeStorageKey]);

  useEffect(() => {
    tasksViewPrefsHydratedRef.current = false;
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(tasksViewPrefsStorageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<{
          memberSort: 'asc' | 'desc';
          memberGroupBy: 'none' | 'group';
        }>;
        if (parsed.memberSort === 'asc' || parsed.memberSort === 'desc') {
          setMemberSort(parsed.memberSort);
        }
        if (parsed.memberGroupBy === 'none' || parsed.memberGroupBy === 'group') {
          setMemberGroupBy(parsed.memberGroupBy);
        }
      } catch {
        // Ignore invalid localStorage payload and keep defaults.
      }
    }
    tasksViewPrefsHydratedRef.current = true;
  }, [tasksViewPrefsStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!tasksViewPrefsHydratedRef.current) return;
    window.localStorage.setItem(tasksViewPrefsStorageKey, JSON.stringify({
      memberSort,
      memberGroupBy,
    }));
  }, [memberGroupBy, memberSort, tasksViewPrefsStorageKey]);

  const activeAssignees = useMemo(
    () => [...assignees].filter((assignee) => assignee.isActive).sort((a, b) => a.name.localeCompare(b.name)),
    [assignees],
  );
  const disabledAssignees = useMemo(
    () => [...assignees].filter((assignee) => !assignee.isActive).sort((a, b) => a.name.localeCompare(b.name)),
    [assignees],
  );
  const groupNameById = useMemo(
    () => new Map(groups.map((group) => [group.id, group.name])),
    [groups],
  );
  const groupIdByUserId = useMemo(
    () => new Map(memberGroupAssignments.map((assignment) => [assignment.userId, assignment.groupId])),
    [memberGroupAssignments],
  );

  const normalizedMemberSearch = memberSearch.trim().toLowerCase();
  const buildMemberGroups = useMemo(() => {
    return (list: typeof assignees) => {
      const filtered = normalizedMemberSearch
        ? list.filter((assignee) => assignee.name.toLowerCase().includes(normalizedMemberSearch))
        : list;
      const sorted = [...filtered].sort((a, b) => compareNames(a.name, b.name, memberSort));
      if (memberGroupBy === 'none') {
        return [{ id: 'all', name: null, members: sorted }];
      }
      const buckets = new Map<string, typeof assignees>();
      sorted.forEach((assignee) => {
        const groupId = assignee.userId ? groupIdByUserId.get(assignee.userId) ?? 'none' : 'none';
        const key = groupId ?? 'none';
        const groupList = buckets.get(key) ?? [];
        groupList.push(assignee);
        buckets.set(key, groupList);
      });
      const groupsList = Array.from(buckets.entries()).map(([id, members]) => ({
        id,
        name: id === 'none' ? t`No group` : groupNameById.get(id) ?? t`No group`,
        members,
      }));
      groupsList.sort((left, right) => compareNames(left.name ?? '', right.name ?? '', 'asc'));
      return groupsList;
    };
  }, [groupIdByUserId, groupNameById, memberGroupBy, memberSort, normalizedMemberSearch]);

  const activeMemberGroups = useMemo(
    () => buildMemberGroups(activeAssignees),
    [activeAssignees, buildMemberGroups],
  );
  const disabledMemberGroups = useMemo(
    () => buildMemberGroups(disabledAssignees),
    [disabledAssignees, buildMemberGroups],
  );
  const activeVisibleAssignees = useMemo(
    () => activeMemberGroups.flatMap((group) => group.members),
    [activeMemberGroups],
  );
  const disabledVisibleAssignees = useMemo(
    () => disabledMemberGroups.flatMap((group) => group.members),
    [disabledMemberGroups],
  );

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

  const statusById = useMemo(
    () => new Map(statuses.map((status) => [status.id, status])),
    [statuses],
  );
  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );
  const assigneeById = useMemo(
    () => new Map(assignees.map((assignee) => [assignee.id, assignee])),
    [assignees],
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
  const taskTypeById = useMemo(
    () => new Map(taskTypes.map((type) => [type.id, type])),
    [taskTypes],
  );
  const tagById = useMemo(
    () => new Map(tags.map((tag) => [tag.id, tag])),
    [tags],
  );

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
  const normalizedGroupSearch = groupSearch.trim().toLowerCase();
  const sortedGroups = useMemo(() => {
    const filtered = normalizedGroupSearch
      ? groups.filter((group) => group.name.toLowerCase().includes(normalizedGroupSearch))
      : groups;
    return [...filtered].sort((a, b) => compareNames(a.name, b.name, groupSort));
  }, [groups, groupSort, normalizedGroupSearch]);

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  );

  const refreshMemberTaskCounts = useCallback(async () => {
    if (!currentWorkspaceId) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    const countsEnd = format(addYears(parseISO(today), 10), 'yyyy-MM-dd');
    const { data, error } = await supabase.rpc('assignee_unique_task_counts', {
      p_workspace_id: currentWorkspaceId,
      p_start_date: today,
      p_end_date: countsEnd,
    });

    if (error) {
      console.error(error);
      return;
    }

    const nextCounts: Record<string, number> = {};
    ((data ?? []) as AssigneeUniqueTaskCountRow[]).forEach((row) => {
      if (!row.assignee_id) return;
      const value = typeof row.total === 'string' ? Number(row.total) : (row.total ?? 0);
      nextCounts[row.assignee_id] = value;
    });
    setMemberTaskCounts(nextCounts);
    setMemberTaskCountsDate(today);
  }, [currentWorkspaceId]);

  const fetchGroups = useCallback(async () => {
    if (!currentWorkspaceId) return;
    setGroupsLoading(true);
    setGroupsError('');
    const { data, error } = await supabase
      .from('member_groups')
      .select('id, workspace_id, name, created_at')
      .eq('workspace_id', currentWorkspaceId)
      .order('name', { ascending: true });

    if (error) {
      setGroupsError(error.message);
      setGroupsLoading(false);
      return;
    }

    setGroups((data ?? []) as MemberGroup[]);
    setGroupsLoading(false);
  }, [currentWorkspaceId]);

  const fetchGroupMembers = useCallback(async (groupId: string) => {
    if (!currentWorkspaceId) return;
    setGroupMembersLoading(true);
    setGroupMembersError('');
    const { data, error } = await supabase
      .from('workspace_members')
      .select('user_id, role, profiles(email, display_name)')
      .eq('workspace_id', currentWorkspaceId)
      .eq('group_id', groupId);

    if (error) {
      setGroupMembersError(error.message);
      setGroupMembersLoading(false);
      return;
    }

    const rows = (data ?? []) as GroupMemberRow[];
    const members = rows.map((row) => ({
      userId: row.user_id,
      role: row.role,
      email: row.profiles?.email ?? t`unknown`,
      displayName: row.profiles?.display_name ?? null,
    }));
    members.sort((a, b) => {
      const left = (a.displayName || a.email).toLowerCase();
      const right = (b.displayName || b.email).toLowerCase();
      return left.localeCompare(right);
    });
    setGroupMembers(members);
    setGroupMembersLoading(false);
  }, [currentWorkspaceId]);

  useEffect(() => {
    if (currentWorkspaceId) {
      fetchGroups();
    }
  }, [currentWorkspaceId, fetchGroups]);

  useEffect(() => {
    if (groups.length === 0) {
      setSelectedGroupId(null);
      return;
    }
    if (!selectedGroupId || !groups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(groups[0].id);
    }
  }, [groups, selectedGroupId]);

  useEffect(() => {
    if (mode !== 'groups') return;
    if (!selectedGroupId) {
      setGroupMembers([]);
      return;
    }
    fetchGroupMembers(selectedGroupId);
  }, [fetchGroupMembers, mode, selectedGroupId]);

  useEffect(() => {
    if (mode !== 'tasks' || !currentWorkspaceId) return;
    void refreshMemberTaskCounts();
  }, [currentWorkspaceId, mode, refreshMemberTaskCounts]);

  useEffect(() => {
    if (!selectedGroupId || selectedGroupId !== editingGroupId) {
      setEditingGroupId(null);
      setEditingGroupName('');
    }
  }, [editingGroupId, selectedGroupId]);

  const fetchAssigneeTasks = useCallback(async (assigneeId: string) => {
    if (!currentWorkspaceId) return;
    setTasksLoading(true);
    setTasksError('');
    const offset = (pageIndex - 1) * pageSize;
    let query = supabase
      .from('tasks')
      .select([
        'id',
        'title',
        'project_id',
        'assignee_id',
        'assignee_ids',
        'start_date',
        'end_date',
        'status_id',
        'type_id',
        'priority',
        'tag_ids',
        'description',
        'repeat_id',
      ].join(','), { count: 'exact' })
      .eq('workspace_id', currentWorkspaceId)
      .or(`assignee_id.eq.${assigneeId},assignee_ids.cs.{${assigneeId}}`);

    const today = format(new Date(), 'yyyy-MM-dd');
    if (taskScope === 'current') {
      query = query.gte('end_date', today);
    } else {
      query = query.lt('end_date', today);
      if (pastFromDate) {
        query = query.gte('end_date', pastFromDate);
      }
      if (pastToDate) {
        query = query.lte('start_date', pastToDate);
      }
    }

    if (statusFilterIds.length > 0) {
      query = query.in('status_id', statusFilterIds);
    }
    if (projectFilterIds.length > 0) {
      query = query.in('project_id', projectFilterIds);
    }
    if (search.trim()) {
      query = query.ilike('title', `%${search.trim()}%`);
    }

    let sortedQuery = query;
    if (taskScope === 'past') {
      switch (pastSort) {
        case 'start_asc':
          sortedQuery = sortedQuery.order('start_date', { ascending: true });
          break;
        case 'start_desc':
          sortedQuery = sortedQuery.order('start_date', { ascending: false });
          break;
        case 'end_asc':
          sortedQuery = sortedQuery.order('end_date', { ascending: true });
          break;
        case 'end_desc':
          sortedQuery = sortedQuery.order('end_date', { ascending: false });
          break;
        case 'title_asc':
          sortedQuery = sortedQuery.order('title', { ascending: true });
          break;
        case 'title_desc':
          sortedQuery = sortedQuery.order('title', { ascending: false });
          break;
        default:
          sortedQuery = sortedQuery.order('end_date', { ascending: false });
      }
    } else {
      sortedQuery = sortedQuery.order('start_date', { ascending: true });
    }

    const { data, error, count } = taskScope === 'current'
      ? await sortedQuery
      : await sortedQuery.range(offset, offset + pageSize - 1);
    if (error) {
      setTasksError(error.message);
      setTasksLoading(false);
      return;
    }
    const mapped = (data ?? []).map((row) => mapTaskRow(row as TaskRow));
    setAssigneeTasks(mapped);
    setTotalCount(taskScope === 'current'
      ? mapped.length
      : (typeof count === 'number' ? count : 0));
    if (
      taskScope === 'current'
      && statusFilterIds.length === 0
      && projectFilterIds.length === 0
      && !search.trim()
    ) {
      setMemberTaskCounts((current) => ({
        ...current,
        [assigneeId]: countTaskUnits(mapped),
      }));
      if (!memberTaskCountsDate) {
        setMemberTaskCountsDate(format(new Date(), 'yyyy-MM-dd'));
      }
    }
    setTasksLoading(false);
  }, [currentWorkspaceId, memberTaskCountsDate, pageIndex, pageSize, projectFilterIds, search, statusFilterIds, taskScope, pastFromDate, pastToDate, pastSort]);

  useEffect(() => {
    if (!selectedAssigneeId) {
      setAssigneeTasks([]);
      setTotalCount(0);
      return;
    }
    fetchAssigneeTasks(selectedAssigneeId);
  }, [fetchAssigneeTasks, selectedAssigneeId]);

  useEffect(() => {
    setSelectedTaskIds(new Set());
  }, [selectedAssigneeId, pageIndex, projectFilterIds, search, statusFilterIds, taskScope, pastFromDate, pastToDate, pastSort]);

  useEffect(() => {
    if (!selectedTaskId) return;
    if (!assigneeTasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(null);
    }
  }, [assigneeTasks, selectedTaskId]);

  const displayTaskRows = useMemo<DisplayTaskRow[]>(() => {
    if (taskScope !== 'current') {
      return assigneeTasks.map((task) => ({
        key: task.id,
        task,
        taskIds: [task.id],
        repeatMeta: null,
      }));
    }

    const repeatBuckets = new Map<string, Task[]>();
    const rows: DisplayTaskRow[] = [];

    assigneeTasks.forEach((task) => {
      if (!task.repeatId) {
        rows.push({
          key: task.id,
          task,
          taskIds: [task.id],
          repeatMeta: null,
        });
        return;
      }
      const bucket = repeatBuckets.get(task.repeatId) ?? [];
      bucket.push(task);
      repeatBuckets.set(task.repeatId, bucket);
    });

    repeatBuckets.forEach((tasks, repeatId) => {
      const sorted = [...tasks].sort((left, right) => left.startDate.localeCompare(right.startDate));
      const representative = sorted[0];
      rows.push({
        key: `repeat:${repeatId}`,
        task: representative,
        taskIds: sorted.map((item) => item.id),
        repeatMeta: {
          label: inferRepeatLabel(sorted),
          remaining: Math.max(0, sorted.length - 1),
          total: sorted.length,
        },
      });
    });

    rows.sort((left, right) => {
      const byStart = left.task.startDate.localeCompare(right.task.startDate);
      if (byStart !== 0) return byStart;
      const byEnd = left.task.endDate.localeCompare(right.task.endDate);
      if (byEnd !== 0) return byEnd;
      return left.task.title.localeCompare(right.task.title);
    });

    return rows;
  }, [assigneeTasks, taskScope]);

  const visibleTaskIds = useMemo(
    () => displayTaskRows.flatMap((row) => row.taskIds),
    [displayTaskRows],
  );

  const selectedTask = useMemo(
    () => assigneeTasks.find((task) => task.id === selectedTaskId) ?? null,
    [assigneeTasks, selectedTaskId],
  );
  const selectedTaskProject = useMemo(
    () => projects.find((project) => project.id === selectedTask?.projectId) ?? null,
    [projects, selectedTask?.projectId],
  );
  const selectedTaskTags = useMemo(() => (
    selectedTask?.tagIds.map((tagId) => tagById.get(tagId)).filter(Boolean) ?? []
  ), [selectedTask?.tagIds, tagById]);
  const selectedTaskDescription = useMemo(() => {
    if (!selectedTask?.description) return '';
    if (!hasRichTags(selectedTask.description)) return selectedTask.description;
    return sanitizeDescription(selectedTask.description);
  }, [selectedTask?.description]);

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
    if (!selectedTask) return;
    setHighlightedTaskId(selectedTask.id);
    clearFilters();
    if (user?.id && typeof window !== 'undefined') {
      window.localStorage.removeItem(`planner-filters-${user.id}`);
    }
    setViewMode('week');
    setCurrentDate(selectedTask.startDate);
    requestScrollToDate(selectedTask.startDate);
    setSelectedTaskId(null);
    navigate('/');
  }, [
    clearFilters,
    navigate,
    requestScrollToDate,
    selectedTask,
    setHighlightedTaskId,
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

  const handleCreateGroup = useCallback(async () => {
    if (!currentWorkspaceId || !isAdmin) return;
    const trimmedName = newGroupName.trim();
    if (!trimmedName) return;
    setGroupActionLoading(true);
    setGroupsError('');
    const { data, error } = await supabase
      .from('member_groups')
      .insert({ workspace_id: currentWorkspaceId, name: trimmedName })
      .select('id')
      .single();

    if (error) {
      setGroupsError(error.message);
      setGroupActionLoading(false);
      return;
    }

    setNewGroupName('');
    setCreatingGroup(false);
    await fetchGroups();
    await refreshMemberGroups();
    if (data?.id) {
      setSelectedGroupId(data.id);
    }
    setGroupActionLoading(false);
  }, [currentWorkspaceId, fetchGroups, isAdmin, newGroupName, refreshMemberGroups]);

  const handleStartEditGroup = useCallback((group: MemberGroup) => {
    setEditingGroupId(group.id);
    setEditingGroupName(group.name);
  }, []);

  const handleSaveGroupName = useCallback(async () => {
    if (!currentWorkspaceId || !editingGroupId || !isAdmin) return;
    const trimmedName = editingGroupName.trim();
    if (!trimmedName) return;
    setGroupActionLoading(true);
    setGroupsError('');
    const { error } = await supabase
      .from('member_groups')
      .update({ name: trimmedName })
      .eq('id', editingGroupId)
      .eq('workspace_id', currentWorkspaceId);

    if (error) {
      setGroupsError(error.message);
      setGroupActionLoading(false);
      return;
    }

    await fetchGroups();
    await refreshMemberGroups();
    setEditingGroupId(null);
    setEditingGroupName('');
    setGroupActionLoading(false);
  }, [currentWorkspaceId, editingGroupId, editingGroupName, fetchGroups, isAdmin, refreshMemberGroups]);

  const handleDeleteGroup = useCallback(async (group?: MemberGroup) => {
    if (!currentWorkspaceId || !isAdmin) return;
    const targetGroupId = group?.id ?? selectedGroupId;
    if (!targetGroupId) return;
    if (typeof window !== 'undefined') {
      const groupName = group?.name ?? selectedGroup?.name ?? 'this group';
      const confirmed = window.confirm(`Delete "${groupName}"?`);
      if (!confirmed) return;
    }
    setGroupActionLoading(true);
    setGroupsError('');
    const { error } = await supabase
      .from('member_groups')
      .delete()
      .eq('id', targetGroupId)
      .eq('workspace_id', currentWorkspaceId);

    if (error) {
      setGroupsError(error.message);
      setGroupActionLoading(false);
      return;
    }

    await fetchGroups();
    await refreshMemberGroups();
    setGroupActionLoading(false);
  }, [currentWorkspaceId, fetchGroups, isAdmin, refreshMemberGroups, selectedGroup?.name, selectedGroupId]);

  const handleGroupMemberClick = useCallback((userId: string) => {
    const assignee = assigneeByUserId.get(userId);
    if (!assignee) return;
    setTab(assignee.isActive ? 'active' : 'disabled');
    setSelectedAssigneeId(assignee.id);
    setMode('tasks');
  }, [assigneeByUserId, setMode, setSelectedAssigneeId, setTab]);

  if (isSuperAdmin) {
    return <Navigate to="/admin/users" replace />;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <WorkspaceSwitcher />
          <WorkspaceNav />
        </div>
        <div className="flex items-center gap-2">
          {mode === 'groups' && isAdmin && (
            <Button size="sm" className="gap-2" onClick={() => setCreatingGroup(true)}>
              <Plus className="h-4 w-4" />
              {t`New group`}
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowSettings(true)}
            className="h-9 w-9"
            disabled={!canEdit}
          >
            <Settings className="h-4 w-4" />
          </Button>
          <InviteNotifications />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowAccountSettings(true)}
            className="h-9 w-9"
          >
            <User className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <aside className="w-80 min-w-0 min-h-0 border-r border-border bg-card flex flex-col">
          <div className="px-4 py-3 border-b border-border">
            {modeToggle}
          </div>

          {mode === 'tasks' && (
            <Tabs
              value={tab}
              onValueChange={(value) => setTab(value as 'active' | 'disabled')}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="px-4 py-3 border-b border-border">
                <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                  <Input
                    className="h-8"
                    placeholder={t`Search members...`}
                    value={memberSearch}
                    onChange={(event) => setMemberSearch(event.target.value)}
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-2 px-2"
                      onClick={() => setMemberSort((current) => (current === 'asc' ? 'desc' : 'asc'))}
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
                      onClick={() => setMemberGroupBy((current) => (current === 'group' ? 'none' : 'group'))}
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
                                onClick={() => setSelectedAssigneeId(assignee.id)}
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
                                onClick={() => setSelectedAssigneeId(assignee.id)}
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

          {mode === 'groups' && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="px-4 py-3 border-b border-border space-y-2">
                <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                  <Input
                    className="h-8"
                    placeholder={t`Search groups...`}
                    value={groupSearch}
                    onChange={(event) => setGroupSearch(event.target.value)}
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-2 px-2"
                      onClick={() => setGroupSort((current) => (current === 'asc' ? 'desc' : 'asc'))}
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
                            onClick={() => setSelectedGroupId(group.id)}
                            onContextMenu={() => setSelectedGroupId(group.id)}
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
                              setSelectedGroupId(group.id);
                              handleStartEditGroup(group);
                            }}
                          >
                            {t`Rename`}
                          </ContextMenuItem>
                          <ContextMenuItem
                            disabled={!isAdmin}
                            onSelect={() => void handleDeleteGroup(group)}
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

        <section className="flex-1 overflow-hidden flex flex-col">
          {mode === 'access' && (
            <div className="flex-1 overflow-auto px-6 py-4">
              <WorkspaceMembersPanel />
            </div>
          )}

          {mode === 'groups' && (
            <div className="flex-1 overflow-auto px-6 py-4">
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
                          className="w-[240px]"
                          value={editingGroupName}
                          onChange={(event) => setEditingGroupName(event.target.value)}
                          disabled={!isAdmin || groupActionLoading}
                        />
                        <Button
                          size="sm"
                          onClick={handleSaveGroupName}
                          disabled={!isAdmin || groupActionLoading || !editingGroupName.trim()}
                        >
                          {t`Save`}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingGroupId(null);
                            setEditingGroupName('');
                          }}
                          disabled={groupActionLoading}
                        >
                          {t`Cancel`}
                        </Button>
                      </div>
                    ) : (
                      <div className="text-lg font-semibold">{selectedGroup.name}</div>
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
                              <button
                                key={member.userId}
                                type="button"
                                onClick={() => handleGroupMemberClick(member.userId)}
                                className="w-full rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted/40"
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
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {mode === 'tasks' && (
            <>
              {!selectedAssignee && (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                  {t`Select a member to view details.`}
                </div>
              )}

              {selectedAssignee && (
                <div className="flex flex-1 flex-col overflow-hidden">
              <div className="border-b border-border px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="text-lg font-semibold">{selectedAssignee.name}</div>
                      {!selectedAssignee.isActive && (
                        <Badge variant="secondary">{t`Disabled`}</Badge>
                      )}
                    </div>
                    <div>{scopeToggle}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {memberTaskCountsDate ? t`Tasks from today` : t`Tasks count loading...`}
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 border-b border-border">
                <div className="flex flex-wrap items-center gap-3">
                  <Input
                    className="w-[220px]"
                    placeholder={t`Search tasks...`}
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPageIndex(1);
                    }}
                  />
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline">{statusFilterLabel}</Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2" align="start">
                      <div className="flex gap-2 pb-2">
                        <Button size="sm" variant="ghost" onClick={() => setStatusPreset('all')}>{t`All`}</Button>
                        <Button size="sm" variant="ghost" onClick={() => setStatusPreset('open')}>{t`Open`}</Button>
                        <Button size="sm" variant="ghost" onClick={() => setStatusPreset('done')}>{t`Done`}</Button>
                      </div>
                      <ScrollArea className="max-h-48 pr-2">
                        <div className="space-y-1">
                          {statuses.map((status) => (
                            <label key={status.id} className="flex items-center gap-2 py-1 cursor-pointer">
                              <Checkbox
                                checked={statusFilterIds.includes(status.id)}
                                onCheckedChange={() => handleToggleStatus(status.id)}
                              />
                              <span className="inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: status.color }} />
                              <span className="text-sm truncate">{formatStatusLabel(status.name, status.emoji)}</span>
                            </label>
                          ))}
                        </div>
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline">{projectFilterLabel}</Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2" align="start">
                      <ScrollArea className="max-h-48 pr-2">
                        <div className="space-y-1">
                          {projectOptions.length === 0 && (
                            <div className="text-xs text-muted-foreground">{t`No projects for this member.`}</div>
                          )}
                          {projectOptions.map((project) => (
                            <label key={project.id} className="flex items-center gap-2 py-1 cursor-pointer">
                              <Checkbox
                                checked={projectFilterIds.includes(project.id)}
                                onCheckedChange={() => handleToggleProject(project.id)}
                              />
                              <span className="inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: project.color }} />
                              <span className="text-sm truncate">
                                {formatProjectLabel(project.name, project.code)}
                              </span>
                            </label>
                          ))}
                        </div>
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>

                  {taskScope === 'past' && (
                    <>
                      <Input
                        type="date"
                        className="w-[160px]"
                        value={pastFromDate}
                        onChange={(event) => {
                          setPastFromDate(event.target.value);
                          setPageIndex(1);
                        }}
                      />
                      <Input
                        type="date"
                        className="w-[160px]"
                        value={pastToDate}
                        onChange={(event) => {
                          setPastToDate(event.target.value);
                          setPageIndex(1);
                        }}
                      />
                      <Select
                        value={pastSort}
                        onValueChange={(value) => {
                          setPastSort(value as typeof pastSort);
                          setPageIndex(1);
                        }}
                      >
                        <SelectTrigger className="w-[170px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="end_desc">{t`End date ↓`}</SelectItem>
                          <SelectItem value="end_asc">{t`End date ↑`}</SelectItem>
                          <SelectItem value="start_desc">{t`Start date ↓`}</SelectItem>
                          <SelectItem value="start_asc">{t`Start date ↑`}</SelectItem>
                          <SelectItem value="title_asc">{t`Title A–Z`}</SelectItem>
                          <SelectItem value="title_desc">{t`Title Z–A`}</SelectItem>
                        </SelectContent>
                      </Select>
                    </>
                  )}

                  <Button
                    variant="ghost"
                    onClick={() => {
                      setSearch('');
      setStatusFilterIds([]);
      setProjectFilterIds([]);
      setPastFromDate('');
      setPastToDate('');
      setPageIndex(1);
    }}
  >
    {t`Clear filters`}
  </Button>

                  <Button
                    variant="ghost"
                    className="ml-auto"
                    onClick={() => {
                      if (selectedAssigneeId) {
                        void fetchAssigneeTasks(selectedAssigneeId);
                      }
                      void refreshMemberTaskCounts();
                    }}
                    disabled={!selectedAssigneeId || tasksLoading}
                  >
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    {t`Refresh`}
                  </Button>
                  {selectedCount > 0 && (
                    <Button
                      variant="destructive"
                      onClick={handleDeleteSelected}
                      disabled={tasksLoading}
                    >
                      {t`Delete selected (${selectedCount})`}
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-auto px-6 py-4">
                {tasksLoading && (
                  <div className="text-sm text-muted-foreground">{t`Loading tasks...`}</div>
                )}
                {!tasksLoading && tasksError && (
                  <div className="text-sm text-destructive">{tasksError}</div>
                )}
                {!tasksLoading && !tasksError && (
                  <>
                    {displayTaskRows.length === 0 ? (
                      <div className="text-sm text-muted-foreground">{t`No tasks match the current filters.`}</div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">
                              <Checkbox
                                checked={allVisibleSelected ? true : someVisibleSelected ? 'indeterminate' : false}
                                onCheckedChange={handleToggleAll}
                                aria-label={t`Select all tasks`}
                              />
                            </TableHead>
                            <TableHead>{t`Task`}</TableHead>
                            <TableHead>{t`Status`}</TableHead>
                            <TableHead>{t`Project`}</TableHead>
                            <TableHead>{t`Dates`}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {displayTaskRows.map((row) => {
                            const { task } = row;
                            const status = statusById.get(task.statusId);
                            const project = task.projectId ? projectById.get(task.projectId) : null;
                            const selectedInRow = row.taskIds.filter((taskId) => selectedTaskIds.has(taskId)).length;
                            const rowChecked: boolean | 'indeterminate' = (
                              selectedInRow === row.taskIds.length
                                ? true
                                : selectedInRow > 0
                                  ? 'indeterminate'
                                  : false
                            );
                            return (
                              <TableRow
                                key={row.key}
                                className="cursor-pointer"
                                onClick={() => setSelectedTaskId(task.id)}
                              >
                                <TableCell onClick={(event) => event.stopPropagation()}>
                                  <Checkbox
                                    checked={rowChecked}
                                    onCheckedChange={(value) => handleToggleTask(row.taskIds, value)}
                                    aria-label={t`Select task ${task.title}`}
                                  />
                                </TableCell>
                                <TableCell className="font-medium">
                                  <div className="space-y-1">
                                    <div>{task.title}</div>
                                    {row.repeatMeta && (
                                      <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant="outline" className="text-[10px]">
                                          {row.repeatMeta.label}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground">
                                          {row.repeatMeta.remaining > 0
                                            ? `Еще ${row.repeatMeta.remaining}`
                                            : 'Последняя в серии'}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2 text-sm">
                                    <span
                                      className="inline-flex h-2 w-2 rounded-full"
                                      style={{ backgroundColor: status?.color ?? '#94a3b8' }}
                                    />
                                    <span>{status ? formatStatusLabel(status.name, status.emoji) : t`Unknown`}</span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {project ? (
                                    <div className="flex items-center gap-2 text-sm">
                                      <span
                                        className="inline-flex h-2 w-2 rounded-full"
                                        style={{ backgroundColor: project.color }}
                                      />
                                      <span>{formatProjectLabel(project.name, project.code)}</span>
                                      {project.archived && (
                                        <Badge variant="secondary" className="text-[10px]">{t`Archived`}</Badge>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">{t`No project`}</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {format(parseISO(task.startDate), 'dd MMM yyyy')} – {format(parseISO(task.endDate), 'dd MMM yyyy')}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                    {taskScope === 'past' && displayTotalCount > pageSize && (
                      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {Math.min(displayTotalCount, (pageIndex - 1) * pageSize + 1)}–
                          {Math.min(displayTotalCount, pageIndex * pageSize)} {t`of`} {displayTotalCount}
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPageIndex((current) => Math.max(1, current - 1))}
                            disabled={pageIndex === 1}
                          >
                            {t`Prev`}
                          </Button>
                          <span>
                            {t`Page ${pageIndex} / ${totalPages}`}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPageIndex((current) => Math.min(totalPages, current + 1))}
                            disabled={pageIndex >= totalPages}
                          >
                            {t`Next`}
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <Dialog
        open={creatingGroup}
        onOpenChange={(open) => {
          setCreatingGroup(open);
          if (!open) {
            setNewGroupName('');
          }
        }}
      >
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>{t`New group`}</DialogTitle>
            <DialogDescription className="sr-only">
              {t`Create a new group for workspace members.`}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreateGroup();
            }}
            className="space-y-4"
          >
            <div className="space-y-1">
              <Label>{t`Group name`}</Label>
              <Input
                placeholder={t`Group name`}
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
                disabled={!isAdmin || groupActionLoading}
              />
            </div>
            {groupsError && (
              <div className="text-sm text-destructive">{groupsError}</div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => setCreatingGroup(false)}
                disabled={groupActionLoading}
              >
                {t`Cancel`}
              </Button>
              <Button
                type="submit"
                disabled={!isAdmin || groupActionLoading || !newGroupName.trim()}
              >
                {t`Create`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedTaskId)} onOpenChange={(open) => !open && setSelectedTaskId(null)}>
        <DialogContent className="w-[95vw] max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedTask?.title ?? t`Task details`}</DialogTitle>
            <DialogDescription className="sr-only">
              {t`View task details without leaving the members page.`}
            </DialogDescription>
          </DialogHeader>
          {!selectedTask && (
            <div className="text-sm text-muted-foreground">{t`Task not found.`}</div>
          )}
          {selectedTask && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground">{t`Project`}</div>
                  <div className="text-sm">
                    {selectedTaskProject
                      ? formatProjectLabel(selectedTaskProject.name, selectedTaskProject.code)
                      : t`No project`}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t`Status`}</div>
                  <div className="flex items-center gap-2 text-sm">
                    <span
                      className="inline-flex h-2 w-2 rounded-full"
                      style={{ backgroundColor: statusById.get(selectedTask.statusId)?.color ?? '#94a3b8' }}
                    />
                    <span>{statusById.get(selectedTask.statusId)
                      ? formatStatusLabel(
                        statusById.get(selectedTask.statusId)!.name,
                        statusById.get(selectedTask.statusId)!.emoji,
                      )
                      : t`Unknown`}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t`Assignees`}</div>
                  <div className="flex flex-wrap gap-1">
                    {selectedTask.assigneeIds.length === 0 && (
                      <span className="text-xs text-muted-foreground">{t`Unassigned`}</span>
                    )}
                    {selectedTask.assigneeIds.map((id) => {
                      const assignee = assigneeById.get(id);
                      if (!assignee) return null;
                      return (
                        <Badge key={assignee.id} variant="secondary" className="text-[10px]">
                          {assignee.name}
                          {!assignee.isActive && ` ${t`(disabled)`}`}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t`Dates`}</div>
                  <div className="text-sm text-muted-foreground">
                    {format(parseISO(selectedTask.startDate), 'dd MMM yyyy')} – {format(parseISO(selectedTask.endDate), 'dd MMM yyyy')}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t`Type`}</div>
                  <div className="text-sm">
                    {taskTypeById.get(selectedTask.typeId)?.name ?? t`Unknown`}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t`Priority`}</div>
                  <div className="text-sm">{selectedTask.priority ?? t`None`}</div>
                </div>
                <div className="sm:col-span-2">
                  <div className="text-xs text-muted-foreground">{t`Tags`}</div>
                  {selectedTaskTags.length === 0 ? (
                    <div className="text-xs text-muted-foreground">{t`No tags`}</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedTaskTags.map((tag) => (
                        <Badge
                          key={tag.id}
                          variant="outline"
                          className="text-[10px]"
                          style={{ borderColor: tag.color, color: tag.color }}
                        >
                          {tag.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t`Description`}</div>
                {!selectedTask.description && (
                  <div className="text-sm text-muted-foreground">{t`No description.`}</div>
                )}
                {selectedTask.description && hasRichTags(selectedTask.description) && (
                  <div
                    className="text-sm leading-6"
                    dangerouslySetInnerHTML={{ __html: selectedTaskDescription }}
                  />
                )}
                {selectedTask.description && !hasRichTags(selectedTask.description) && (
                  <div className="text-sm whitespace-pre-wrap">{selectedTaskDescription}</div>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button onClick={handleOpenTaskInTimeline}>
                  {t`Go to task`}
                </Button>
                <Button variant="outline" onClick={() => setSelectedTaskId(null)}>
                  {t`Close`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <SettingsPanel open={showSettings} onOpenChange={setShowSettings} />
      <AccountSettingsDialog open={showAccountSettings} onOpenChange={setShowAccountSettings} />
    </div>
  );
};

export default MembersPage;
