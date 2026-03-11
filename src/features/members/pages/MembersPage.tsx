import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore, WorkspaceRole } from '@/features/auth/store/authStore';
import { WorkspacePageHeader } from '@/features/workspace/components/WorkspacePageHeader';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Badge } from '@/shared/ui/badge';
import { t } from '@lingui/macro';
import { cn } from '@/shared/lib/classNames';
import { createLatestAsyncRequest } from '@/shared/lib/latestAsyncRequest';
import { addYears, format, parseISO } from 'date-fns';
import { Plus } from 'lucide-react';
import { Task } from '@/features/planner/types/planner';
import { WorkspaceMembersPanel } from '@/features/workspace/components/WorkspaceMembersPanel';
import { MembersSidebar } from '@/features/members/components/MembersSidebar';
import { MemberTasksPanel } from '@/features/members/components/MemberTasksPanel';
import { MembersDialogs } from '@/features/members/components/MembersDialogs';
import { hasRichTags, sanitizeTaskDescription } from '@/shared/domain/taskDescription';
import { buildRepeatSeriesRows } from '@/shared/domain/repeatSeriesRows';
import { fetchAssigneeTasks as fetchAssigneeTasksFromApi } from '@/infrastructure/members/memberTasksRepository';
import type { RepeatCadence } from '@/shared/domain/repeatSeries';
import {
  buildGroupIdByUserId,
  buildGroupNameById,
  buildMemberGroups,
  filterAndSortByName,
  splitAssigneesByActivity,
} from '@/features/members/lib/memberSelectors';
import { usePageSeo } from '@/shared/lib/seo/usePageSeo';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { MobilePageSheetLayout } from '@/shared/ui/mobile-page-sheet-layout';

type MemberGroup = {
  id: string;
  name: string;
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
    cadence: RepeatCadence;
    remaining: number;
    total: number;
  } | null;
};

type AccessTab = 'active' | 'disabled' | 'history';

const countTaskUnits = (tasks: Task[]) => {
  const units = new Set<string>();
  tasks.forEach((task) => {
    units.add(task.repeatId ? `r:${task.repeatId}` : `t:${task.id}`);
  });
  return units.size;
};

const pickNearestRepeatTaskFromToday = (task: Task, tasks: Task[]) => {
  if (!task.repeatId) return task;

  const series = tasks.filter((item) => item.repeatId === task.repeatId);
  if (series.length === 0) return task;

  const todayTime = parseISO(format(new Date(), 'yyyy-MM-dd')).getTime();
  return series.reduce((best, candidate) => {
    const bestDiff = parseISO(best.startDate).getTime() - todayTime;
    const candidateDiff = parseISO(candidate.startDate).getTime() - todayTime;

    const bestDistance = Math.abs(bestDiff);
    const candidateDistance = Math.abs(candidateDiff);
    if (candidateDistance < bestDistance) return candidate;
    if (candidateDistance > bestDistance) return best;

    const bestIsFutureOrToday = bestDiff >= 0;
    const candidateIsFutureOrToday = candidateDiff >= 0;
    if (candidateIsFutureOrToday && !bestIsFutureOrToday) return candidate;
    if (!candidateIsFutureOrToday && bestIsFutureOrToday) return best;

    // If distance is equal, move toward the earlier timeline item for deterministic navigation.
    return parseISO(candidate.startDate) < parseISO(best.startDate) ? candidate : best;
  });
};

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
  const [mode, setMode] = useState<'tasks' | 'access' | 'groups'>('tasks');
  const [accessTab, setAccessTab] = useState<AccessTab>('active');
  const [accessSearch, setAccessSearch] = useState('');
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
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
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
    setHighlightedTaskId,
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
    setHighlightedTaskId: state.setHighlightedTaskId,
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
  } = useAuthStore(useShallow((state) => ({
    user: state.user,
    members: state.members,
    currentWorkspaceId: state.currentWorkspaceId,
    currentWorkspaceRole: state.currentWorkspaceRole,
    isSuperAdmin: state.isSuperAdmin,
  })));

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
  const assigneeTasksRequestRef = useRef(createLatestAsyncRequest());

  useEffect(() => {
    if (currentWorkspaceId) {
      loadWorkspaceData(currentWorkspaceId);
    }
  }, [currentWorkspaceId, loadWorkspaceData]);

  useEffect(() => {
    const taskRequest = assigneeTasksRequestRef.current;
    return () => {
      taskRequest.cancel();
    };
  }, []);

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

  const { active: activeAssignees, disabled: disabledAssignees } = useMemo(
    () => splitAssigneesByActivity(assignees),
    [assignees],
  );
  const groupNameById = useMemo(
    () => buildGroupNameById(groups),
    [groups],
  );
  const groupIdByUserId = useMemo(
    () => buildGroupIdByUserId(memberGroupAssignments),
    [memberGroupAssignments],
  );

  const activeMemberGroups = useMemo(
    () => buildMemberGroups({
      assignees: activeAssignees,
      memberSearch,
      memberSort,
      memberGroupBy,
      groupIdByUserId,
      groupNameById,
      noGroupLabel: t`No group`,
    }),
    [activeAssignees, groupIdByUserId, groupNameById, memberGroupBy, memberSearch, memberSort],
  );
  const disabledMemberGroups = useMemo(
    () => buildMemberGroups({
      assignees: disabledAssignees,
      memberSearch,
      memberSort,
      memberGroupBy,
      groupIdByUserId,
      groupNameById,
      noGroupLabel: t`No group`,
    }),
    [disabledAssignees, groupIdByUserId, groupNameById, memberGroupBy, memberSearch, memberSort],
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
  const sortedGroups = useMemo(
    () => filterAndSortByName(groups, groupSearch, groupSort),
    [groupSearch, groupSort, groups],
  );
  const activeAccessCount = useMemo(
    () => members.filter((member) => assigneeByUserId.get(member.userId)?.isActive ?? true).length,
    [assigneeByUserId, members],
  );
  const disabledAccessCount = useMemo(
    () => members.filter((member) => !(assigneeByUserId.get(member.userId)?.isActive ?? true)).length,
    [assigneeByUserId, members],
  );

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  );

  const refreshMemberTaskCounts = useCallback(async () => {
    if (!currentWorkspaceId) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    const countsEnd = format(addYears(parseISO(today), 10), 'yyyy-MM-dd');
    const result = await fetchAssigneeTaskCounts({
      workspaceId: currentWorkspaceId,
      startDate: today,
      endDate: countsEnd,
    });
    if (result.error) {
      console.error(result.error);
      return;
    }
    setMemberTaskCounts(result.counts);
    setMemberTaskCountsDate(result.date);
  }, [currentWorkspaceId, fetchAssigneeTaskCounts]);

  const fetchGroups = useCallback(async () => {
    if (!currentWorkspaceId) return;
    setGroupsLoading(true);
    setGroupsError('');
    const result = await fetchMemberGroups(currentWorkspaceId);
    if (result.error) {
      setGroupsError(result.error);
      setGroupsLoading(false);
      return;
    }

    setGroups(result.groups);
    setGroupsLoading(false);
  }, [currentWorkspaceId, fetchMemberGroups]);

  const fetchSelectedGroupMembers = useCallback(async (groupId: string) => {
    if (!currentWorkspaceId) return;
    setGroupMembersLoading(true);
    setGroupMembersError('');
    const result = await fetchGroupMembers(currentWorkspaceId, groupId);
    if (result.error) {
      setGroupMembersError(result.error);
      setGroupMembersLoading(false);
      return;
    }
    setGroupMembers(result.members.map((member) => ({
      ...member,
      email: member.email || t`unknown`,
    })));
    setGroupMembersLoading(false);
  }, [currentWorkspaceId, fetchGroupMembers]);

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
    fetchSelectedGroupMembers(selectedGroupId);
  }, [fetchSelectedGroupMembers, mode, selectedGroupId]);

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
    const request = assigneeTasksRequestRef.current.next();
    setTasksLoading(true);
    setTasksError('');
    try {
      const result = await fetchAssigneeTasksFromApi({
        workspaceId: currentWorkspaceId,
        assigneeId,
        taskScope,
        pastFromDate,
        pastToDate,
        pastSort,
        statusFilterIds,
        projectFilterIds,
        search,
        pageIndex,
        pageSize,
        signal: request.signal,
      });

      if (!assigneeTasksRequestRef.current.isCurrent(request.requestId)) {
        return;
      }
      if (!result) {
        setTasksLoading(false);
        return;
      }

      const mapped = result.tasks;
      setAssigneeTasks(mapped);
      setTotalCount(result.totalCount);
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
    } catch (error) {
      if (!assigneeTasksRequestRef.current.isCurrent(request.requestId)) {
        return;
      }
      const message = error instanceof Error ? error.message : t`Failed to load tasks.`;
      setTasksError(message);
      setTasksLoading(false);
    }
  }, [currentWorkspaceId, memberTaskCountsDate, pageIndex, pageSize, projectFilterIds, search, statusFilterIds, taskScope, pastFromDate, pastToDate, pastSort]);

  useEffect(() => {
    if (!selectedAssigneeId) {
      assigneeTasksRequestRef.current.cancel();
      setTasksLoading(false);
      setTasksError('');
      setAssigneeTasks([]);
      setTotalCount(0);
      return;
    }
    void fetchAssigneeTasks(selectedAssigneeId);
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

    return buildRepeatSeriesRows(assigneeTasks).map((row) => ({
      key: row.key,
      task: row.task,
      taskIds: row.taskIds,
      repeatMeta: row.repeatMeta
        ? {
          cadence: row.repeatMeta.cadence,
          remaining: row.repeatMeta.remaining,
          total: row.repeatMeta.total,
        }
        : null,
    }));
  }, [assigneeTasks, taskScope]);

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
    return sanitizeTaskDescription(selectedTask.description);
  }, [selectedTask?.description]);
  const selectedTaskCommentCount = selectedTask ? (taskCommentCounts[selectedTask.id] ?? 0) : 0;

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
    const timelineTask = pickNearestRepeatTaskFromToday(selectedTask, assigneeTasks);
    setHighlightedTaskId(timelineTask.id);
    clearFilters();
    if (user?.id && typeof window !== 'undefined') {
      window.localStorage.removeItem(`planner-filters-${user.id}`);
    }
    setViewMode('week');
    setCurrentDate(timelineTask.startDate);
    requestScrollToDate(timelineTask.startDate);
    setSelectedTaskId(null);
    navigate('/app');
  }, [
    assigneeTasks,
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
    const result = await createMemberGroup(currentWorkspaceId, trimmedName);
    if (result.error) {
      setGroupsError(result.error);
      setGroupActionLoading(false);
      return;
    }

    setNewGroupName('');
    setCreatingGroup(false);
    await fetchGroups();
    if (result.groupId) {
      setSelectedGroupId(result.groupId);
    }
    setGroupActionLoading(false);
  }, [createMemberGroup, currentWorkspaceId, fetchGroups, isAdmin, newGroupName]);

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
    const result = await updateMemberGroup(currentWorkspaceId, editingGroupId, trimmedName);
    if (result.error) {
      setGroupsError(result.error);
      setGroupActionLoading(false);
      return;
    }

    await fetchGroups();
    setEditingGroupId(null);
    setEditingGroupName('');
    setGroupActionLoading(false);
  }, [currentWorkspaceId, editingGroupId, editingGroupName, fetchGroups, isAdmin, updateMemberGroup]);

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
    const result = await deleteMemberGroup(currentWorkspaceId, targetGroupId);
    if (result.error) {
      setGroupsError(result.error);
      setGroupActionLoading(false);
      return;
    }

    await fetchGroups();
    setGroupActionLoading(false);
  }, [currentWorkspaceId, deleteMemberGroup, fetchGroups, isAdmin, selectedGroup?.name, selectedGroupId]);

  const handleGroupMemberClick = useCallback((userId: string) => {
    const assignee = assigneeByUserId.get(userId);
    if (!assignee) return;
    setTab(assignee.isActive ? 'active' : 'disabled');
    setSelectedAssigneeId(assignee.id);
    setMode('tasks');
  }, [assigneeByUserId, setMode, setSelectedAssigneeId, setTab]);

  const mobileSheetLabel = mode === 'access'
    ? t`Access`
    : mode === 'groups'
      ? t`Groups`
      : t`People`;
  const mobileSummary = mode === 'access'
    ? accessTab === 'history'
      ? t`History`
      : accessTab === 'disabled'
        ? t`Disabled people`
        : t`Active people`
    : mode === 'groups'
      ? (selectedGroup?.name ?? t`Select a group`)
      : (selectedAssignee?.name ?? t`Select a person`);

  const renderMembersSidebar = (closeOnSelect = false) => (
    <MembersSidebar
      className={closeOnSelect ? 'w-full border-r-0' : undefined}
      mode={mode}
      onModeChange={setMode}
      isAdmin={isAdmin}
      tab={tab}
      onTabChange={setTab}
      accessTab={accessTab}
      onAccessTabChange={(nextTab) => {
        setAccessTab(nextTab);
        if (closeOnSelect) setMobileSidebarOpen(false);
      }}
      accessSearch={accessSearch}
      onAccessSearchChange={setAccessSearch}
      activeAccessCount={activeAccessCount}
      disabledAccessCount={disabledAccessCount}
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
      onSelectAssignee={(assigneeId) => {
        setSelectedAssigneeId(assigneeId);
        if (closeOnSelect) setMobileSidebarOpen(false);
      }}
      memberTaskCountsDate={memberTaskCountsDate}
      memberTaskCounts={memberTaskCounts}
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
      onSelectGroup={(groupId) => {
        setSelectedGroupId(groupId);
        if (closeOnSelect) setMobileSidebarOpen(false);
      }}
      onStartEditGroup={handleStartEditGroup}
      onDeleteGroup={(group) => {
        void handleDeleteGroup(group);
      }}
    />
  );

  const renderMembersContent = () => (
    <section className="flex-1 overflow-hidden flex flex-col">
      {mode === 'access' && (
        <div className={`flex-1 overflow-auto ${isMobile ? 'px-4 py-3' : 'px-6 py-4'}`}>
          <WorkspaceMembersPanel
            accessTab={accessTab}
            accessSearch={accessSearch}
          />
        </div>
      )}

      {mode === 'groups' && (
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
                      className="w-full sm:w-[240px]"
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
      )}
    </section>
  );

  if (isSuperAdmin) {
    return <Navigate to="/app/admin/users" replace />;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <WorkspacePageHeader
        primaryAction={mode === 'groups' && isAdmin ? (
          <Button size="sm" className="gap-2" onClick={() => setCreatingGroup(true)}>
            <Plus className="h-4 w-4" />
            {t`New group`}
          </Button>
        ) : null}
        onOpenSettings={() => setShowSettings(true)}
        onOpenAccountSettings={() => setShowAccountSettings(true)}
        settingsDisabled={!canEdit}
      />

      {isMobile ? (
        <MobilePageSheetLayout
          open={mobileSidebarOpen}
          onOpenChange={setMobileSidebarOpen}
          browseLabel={mobileSheetLabel}
          sheetTitle={mobileSheetLabel}
          summary={mobileSummary}
          sheetContent={renderMembersSidebar(true)}
        >
          {renderMembersContent()}
        </MobilePageSheetLayout>
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
    </div>
  );
};

export default MembersPage;
