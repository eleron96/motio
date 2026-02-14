import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInDays,
  format,
  parseISO,
  subMonths,
  subYears,
} from 'date-fns';
import { supabase } from '@/shared/lib/supabaseClient';
import { reserveAdminEmail } from '@/shared/lib/adminConfig';
import { getStatusEmoji, splitStatusLabel } from '@/shared/lib/statusLabels';
import {
  Task,
  Milestone,
  Project,
  Customer,
  Assignee,
  MemberGroup,
  MemberGroupAssignment,
  Status,
  TaskType,
  Tag,
  TaskPriority,
  RepeatTaskUpdateScope,
  ViewMode,
  GroupMode,
  Filters,
  PlannerState,
} from '@/features/planner/types/planner';

type TaskRow = {
  id: string;
  workspace_id: string;
  title: string;
  project_id: string | null;
  assignee_id: string | null;
  assignee_ids: string[] | null;
  start_date: string;
  end_date: string;
  status_id: string;
  type_id: string;
  priority: TaskPriority | null;
  tag_ids: string[] | null;
  description: string | null;
  repeat_id: string | null;
};

type ProjectRow = {
  id: string;
  workspace_id: string;
  name: string;
  code: string | null;
  color: string;
  archived: boolean;
  customer_id: string | null;
};

type ProjectTrackingRow = {
  project_id: string;
};

type CustomerRow = {
  id: string;
  workspace_id: string;
  name: string;
};

type AssigneeRow = {
  id: string;
  workspace_id: string;
  name: string;
  user_id: string | null;
  is_active: boolean;
};

type MemberGroupRow = {
  id: string;
  workspace_id: string;
  name: string;
  created_at: string;
};

type MemberGroupAssignmentRow = {
  user_id: string;
  group_id: string | null;
};

type StatusRow = {
  id: string;
  workspace_id: string;
  name: string;
  emoji?: string | null;
  color: string;
  is_final: boolean;
  is_cancelled?: boolean | null;
};

type TaskTypeRow = {
  id: string;
  workspace_id: string;
  name: string;
  icon: string | null;
};

type TagRow = {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
};

type MilestoneRow = {
  id: string;
  workspace_id: string;
  project_id: string;
  date: string;
  title: string;
};

type SupabaseResult<T> = {
  data: T;
  error: { message: string } | null;
};

let reserveAdminUserIdCache: { email: string; id: string | null } | null = null;
let reserveAdminUserIdInFlight: Promise<string | null> | null = null;

const fetchReserveAdminUserId = async (): Promise<string | null> => {
  if (!reserveAdminEmail) return null;
  if (reserveAdminUserIdCache?.email === reserveAdminEmail) return reserveAdminUserIdCache.id;
  if (reserveAdminUserIdInFlight) return reserveAdminUserIdInFlight;

  reserveAdminUserIdInFlight = (async () => {
    try {
      const { data: adminProfile, error } = await supabase
        .from('profiles')
        .select('id')
        .ilike('email', reserveAdminEmail)
        .maybeSingle();
      if (error) {
        console.error(error);
        reserveAdminUserIdCache = { email: reserveAdminEmail, id: null };
        return null;
      }
      const id = (adminProfile as { id?: string } | null)?.id ?? null;
      reserveAdminUserIdCache = { email: reserveAdminEmail, id };
      return id;
    } finally {
      reserveAdminUserIdInFlight = null;
    }
  })();

  return reserveAdminUserIdInFlight;
};

type AssigneeUniqueTaskCountRow = {
  assignee_id: string | null;
  total: number | string | null;
};

interface PlannerStore extends PlannerState {
  workspaceId: string | null;
  loading: boolean;
  error: string | null;
  dataRequestId: number;
  loadedRange: {
    start: string;
    end: string;
    viewMode: ViewMode;
    workspaceId: string;
  } | null;
  assigneeTaskCounts: Record<string, number>;
  assigneeCountsDate: string | null;
  assigneeCountsWorkspaceId: string | null;
  scrollRequestId: number;
  scrollTargetDate: string | null;
  setWorkspaceId: (id: string | null) => void;
  loadWorkspaceData: (workspaceId: string) => Promise<void>;
  refreshAssignees: () => Promise<void>;
  refreshMemberGroups: () => Promise<void>;
  reset: () => void;

  addTask: (task: Omit<Task, 'id'>) => Promise<Task | null>;
  updateTask: (id: string, updates: Partial<Task>, scope?: RepeatTaskUpdateScope) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  deleteTasks: (ids: string[]) => Promise<{ error?: string }>;
  duplicateTask: (id: string) => Promise<void>;
  createRepeats: (id: string, options: { frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly'; ends: 'never' | 'on' | 'after'; untilDate?: string; count?: number }) => Promise<{ error?: string; created?: number }>;
  moveTask: (id: string, startDate: string, endDate: string) => Promise<void>;
  reassignTask: (id: string, assigneeId: string | null, projectId?: string | null) => Promise<void>;
  deleteTaskSeries: (repeatId: string, fromDate: string) => Promise<void>;
  removeAssigneeFromTask: (id: string, assigneeId: string, mode: 'single' | 'following') => Promise<void>;

  addProject: (project: Omit<Project, 'id'>) => Promise<void>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  toggleTrackedProject: (projectId: string, isTracked?: boolean) => Promise<void>;

  addCustomer: (customer: Omit<Customer, 'id'>) => Promise<Customer | null>;
  updateCustomer: (id: string, updates: Partial<Customer>) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;

  addAssignee: (assignee: Omit<Assignee, 'id'>) => Promise<void>;
  updateAssignee: (id: string, updates: Partial<Assignee>) => Promise<void>;
  deleteAssignee: (id: string) => Promise<void>;

  addStatus: (status: Omit<Status, 'id'>) => Promise<void>;
  updateStatus: (id: string, updates: Partial<Status>) => Promise<void>;
  deleteStatus: (id: string) => Promise<void>;

  addTaskType: (taskType: Omit<TaskType, 'id'>) => Promise<void>;
  updateTaskType: (id: string, updates: Partial<TaskType>) => Promise<void>;
  deleteTaskType: (id: string) => Promise<void>;

  addTag: (tag: Omit<Tag, 'id'>) => Promise<void>;
  updateTag: (id: string, updates: Partial<Tag>) => Promise<void>;
  deleteTag: (id: string) => Promise<void>;

  addMilestone: (milestone: Omit<Milestone, 'id'>) => Promise<void>;
  updateMilestone: (id: string, updates: Partial<Milestone>) => Promise<void>;
  deleteMilestone: (id: string) => Promise<void>;

  setViewMode: (mode: ViewMode) => void;
  setGroupMode: (mode: GroupMode) => void;
  setCurrentDate: (date: string) => void;
  requestScrollToDate: (date: string) => void;
  setTimelineAttentionDate: (date: string | null) => void;
  setFilters: (filters: Partial<Filters>) => void;
  clearFilterCriteria: () => void;
  clearFilters: () => void;
  setSelectedTaskId: (id: string | null) => void;
  setHighlightedTaskId: (id: string | null) => void;
}

const initialFilters: Filters = {
  projectIds: [],
  assigneeIds: [],
  groupIds: [],
  statusIds: [],
  typeIds: [],
  tagIds: [],
  hideUnassigned: false,
};

const LOAD_WINDOW_MONTHS = 6;

const buildTaskRange = (currentDate: string, viewMode: ViewMode) => {
  const anchor = parseISO(currentDate);
  switch (viewMode) {
    case 'day': {
      const start = subMonths(anchor, LOAD_WINDOW_MONTHS);
      const end = addMonths(anchor, LOAD_WINDOW_MONTHS);
      return { start: format(start, 'yyyy-MM-dd'), end: format(end, 'yyyy-MM-dd') };
    }
    case 'calendar': {
      const start = subYears(anchor, 1);
      const end = addYears(anchor, 1);
      return { start: format(start, 'yyyy-MM-dd'), end: format(end, 'yyyy-MM-dd') };
    }
    default: {
      const start = subMonths(anchor, LOAD_WINDOW_MONTHS);
      const end = addMonths(anchor, LOAD_WINDOW_MONTHS);
      return { start: format(start, 'yyyy-MM-dd'), end: format(end, 'yyyy-MM-dd') };
    }
  }
};

const isDateWithinRange = (date: string, start: string, end: string) => {
  const target = parseISO(date);
  return target >= parseISO(start) && target <= parseISO(end);
};

const normalizeAssigneeIds = (assigneeIds: string[] | null | undefined, legacyId: string | null | undefined) => {
  const combined = [
    ...(assigneeIds ?? []),
    ...(legacyId ? [legacyId] : []),
  ];
  return Array.from(new Set(combined.filter(Boolean)));
};

const uniqueAssigneeIds = (assigneeIds: string[] | null | undefined) => (
  Array.from(new Set((assigneeIds ?? []).filter(Boolean)))
);

const pickActiveAssigneeIds = (assigneeIds: string[] | null | undefined, assignees: Assignee[]) => {
  const activeIds = new Set(
    assignees
      .filter((assignee) => assignee.isActive)
      .map((assignee) => assignee.id),
  );
  return uniqueAssigneeIds(assigneeIds).filter((id) => activeIds.has(id));
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
  priority: row.priority ?? null,
  tagIds: row.tag_ids ?? [],
  description: row.description,
  repeatId: row.repeat_id ?? null,
});

const mapProjectRow = (row: ProjectRow): Project => ({
  id: row.id,
  name: row.name,
  code: row.code ?? null,
  color: row.color,
  archived: row.archived ?? false,
  customerId: row.customer_id ?? null,
});

const mapCustomerRow = (row: CustomerRow): Customer => ({
  id: row.id,
  name: row.name,
});

const mapAssigneeRow = (row: AssigneeRow): Assignee => ({
  id: row.id,
  name: row.name,
  userId: row.user_id,
  isActive: row.is_active ?? true,
});

const mapStatusRow = (row: StatusRow): Status => {
  const { name: cleanedName, emoji: inlineEmoji } = splitStatusLabel(row.name);
  const hasEmojiField = Object.prototype.hasOwnProperty.call(row, 'emoji');
  const explicitEmoji = typeof row.emoji === 'string' ? row.emoji.trim() : row.emoji;
  const resolvedEmoji = hasEmojiField
    ? (explicitEmoji || null)
    : (inlineEmoji ?? getStatusEmoji(cleanedName));

  const isCancelled = Boolean(row.is_cancelled);
  return {
    id: row.id,
    name: cleanedName,
    emoji: resolvedEmoji ?? null,
    color: row.color,
    isFinal: Boolean(row.is_final) && !isCancelled,
    isCancelled,
  };
};

const mapTaskTypeRow = (row: TaskTypeRow): TaskType => ({
  id: row.id,
  name: row.name,
  icon: row.icon,
});

const mapTagRow = (row: TagRow): Tag => ({
  id: row.id,
  name: row.name,
  color: row.color,
});

const mapMilestoneRow = (row: MilestoneRow): Milestone => ({
  id: row.id,
  title: row.title,
  projectId: row.project_id,
  date: row.date,
});

const mapTaskUpdates = (updates: Partial<Task>) => {
  const payload: Record<string, unknown> = {};
  if ('title' in updates) payload.title = updates.title;
  if ('projectId' in updates) payload.project_id = updates.projectId;
  if ('assigneeIds' in updates) {
    const ids = uniqueAssigneeIds(updates.assigneeIds);
    payload.assignee_ids = ids;
    payload.assignee_id = ids[0] ?? null;
  }
  if ('startDate' in updates) payload.start_date = updates.startDate;
  if ('endDate' in updates) payload.end_date = updates.endDate;
  if ('statusId' in updates) payload.status_id = updates.statusId;
  if ('typeId' in updates) payload.type_id = updates.typeId;
  if ('priority' in updates) payload.priority = updates.priority;
  if ('tagIds' in updates) payload.tag_ids = updates.tagIds;
  if ('description' in updates) payload.description = updates.description;
  if ('repeatId' in updates) payload.repeat_id = updates.repeatId;
  return payload;
};

export const usePlannerStore = create<PlannerStore>()(
  persist(
    (set, get) => ({
      tasks: [],
      milestones: [],
      projects: [],
      trackedProjectIds: [],
      customers: [],
      assignees: [],
      memberGroups: [],
      memberGroupAssignments: [],
      statuses: [],
      taskTypes: [],
      tags: [],
      viewMode: 'week',
      groupMode: 'assignee',
      currentDate: format(new Date(), 'yyyy-MM-dd'),
      filters: initialFilters,
      selectedTaskId: null,
      highlightedTaskId: null,
      timelineAttentionDate: null,
      workspaceId: null,
      loading: false,
      error: null,
      dataRequestId: 0,
      loadedRange: null,
      assigneeTaskCounts: {},
      assigneeCountsDate: null,
      assigneeCountsWorkspaceId: null,
      scrollRequestId: 0,
      scrollTargetDate: null,

      setWorkspaceId: (id) => set({ workspaceId: id }),
      reset: () => set({
        tasks: [],
        milestones: [],
        projects: [],
        trackedProjectIds: [],
        customers: [],
        assignees: [],
        memberGroups: [],
        memberGroupAssignments: [],
        statuses: [],
        taskTypes: [],
        tags: [],
        selectedTaskId: null,
        highlightedTaskId: null,
        timelineAttentionDate: null,
        workspaceId: null,
        loading: false,
        error: null,
        dataRequestId: 0,
        loadedRange: null,
        assigneeTaskCounts: {},
        assigneeCountsDate: null,
        assigneeCountsWorkspaceId: null,
        scrollRequestId: 0,
        scrollTargetDate: null,
      }),

      loadWorkspaceData: async (workspaceId) => {
        const { currentDate, viewMode, loadedRange } = get();
        if (
          loadedRange
          && loadedRange.workspaceId === workspaceId
          && loadedRange.viewMode === viewMode
          && isDateWithinRange(currentDate, loadedRange.start, loadedRange.end)
        ) {
          return;
        }

        const requestId = get().dataRequestId + 1;
        const previousWorkspaceId = get().workspaceId;
        set({
          loading: true,
          error: null,
          workspaceId,
          selectedTaskId: null,
          highlightedTaskId: null,
          timelineAttentionDate: null,
          dataRequestId: requestId,
          ...(previousWorkspaceId && previousWorkspaceId !== workspaceId
            ? { trackedProjectIds: [] }
            : null),
        });

        const { start, end } = buildTaskRange(currentDate, viewMode);
        const today = format(new Date(), 'yyyy-MM-dd');
        const countsEnd = format(addYears(parseISO(today), 10), 'yyyy-MM-dd');
        const { assigneeCountsDate, assigneeCountsWorkspaceId } = get();
        const shouldFetchCounts = assigneeCountsDate !== today || assigneeCountsWorkspaceId !== workspaceId;

        const countsPromise: Promise<SupabaseResult<unknown>> = shouldFetchCounts
          ? supabase.rpc('assignee_unique_task_counts', {
            p_workspace_id: workspaceId,
            p_start_date: today,
            p_end_date: countsEnd,
          })
          : Promise.resolve({ data: null, error: null });

        // Background queries should not delay first paint.
        const trackedPromise: Promise<SupabaseResult<unknown[]>> = (async () => {
          const { data: authData } = await supabase.auth.getUser();
          const userId = authData?.user?.id ?? null;
          if (!userId) return { data: [], error: null };
          return supabase
            .from('project_tracking')
            .select('project_id')
            .eq('workspace_id', workspaceId)
            .eq('user_id', userId);
        })();

        const adminUserIdPromise = fetchReserveAdminUserId();

        // Kick off the main workspace data queries immediately (do not block on auth/user calls).
        const tasksQuery = supabase
          .from('tasks')
          .select(
            [
              'id',
              'workspace_id',
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
            ].join(','),
          )
          .eq('workspace_id', workspaceId)
          .gte('end_date', start)
          .lte('start_date', end);

        const projectsQuery = supabase
          .from('projects')
          .select('id, workspace_id, name, code, color, archived, customer_id')
          .eq('workspace_id', workspaceId);
        const customersQuery = supabase
          .from('customers')
          .select('id, workspace_id, name')
          .eq('workspace_id', workspaceId);
        const assigneesQuery = supabase
          .from('assignees')
          .select('id, workspace_id, name, user_id, is_active')
          .eq('workspace_id', workspaceId);
        const memberGroupsQuery = supabase
          .from('member_groups')
          .select('id, name')
          .eq('workspace_id', workspaceId);
        const memberAssignmentsQuery = supabase
          .from('workspace_members')
          .select('user_id, group_id')
          .eq('workspace_id', workspaceId);
        const statusesQuery = supabase
          .from('statuses')
          .select('id, workspace_id, name, emoji, color, is_final, is_cancelled')
          .eq('workspace_id', workspaceId);
        const taskTypesQuery = supabase
          .from('task_types')
          .select('id, workspace_id, name, icon')
          .eq('workspace_id', workspaceId);
        const tagsQuery = supabase
          .from('tags')
          .select('id, workspace_id, name, color')
          .eq('workspace_id', workspaceId);
        const milestonesQuery = supabase
          .from('milestones')
          .select('id, workspace_id, title, project_id, date')
          .eq('workspace_id', workspaceId)
          .gte('date', start)
          .lte('date', end);

        const [
          tasksRes,
          projectsRes,
          customersRes,
          assigneesRes,
          memberGroupsRes,
          memberAssignmentsRes,
          statusesRes,
          taskTypesRes,
          tagsRes,
          milestonesRes,
          adminUserId,
        ] = await Promise.all([
          tasksQuery,
          projectsQuery,
          customersQuery,
          assigneesQuery,
          memberGroupsQuery,
          memberAssignmentsQuery,
          statusesQuery,
          taskTypesQuery,
          tagsQuery,
          milestonesQuery,
          adminUserIdPromise,
        ]);

        if (get().dataRequestId !== requestId) return;

        if (
          tasksRes.error
          || projectsRes.error
          || customersRes.error
          || assigneesRes.error
          || memberGroupsRes.error
          || memberAssignmentsRes.error
          || statusesRes.error
          || taskTypesRes.error
          || tagsRes.error
          || milestonesRes.error
        ) {
          set({
            error: tasksRes.error?.message
              || projectsRes.error?.message
              || customersRes.error?.message
              || assigneesRes.error?.message
              || memberGroupsRes.error?.message
              || memberAssignmentsRes.error?.message
              || statusesRes.error?.message
              || taskTypesRes.error?.message
              || tagsRes.error?.message
              || milestonesRes.error?.message
              || 'Failed to load workspace data.',
            loading: false,
          });
          return;
        }

        if (get().dataRequestId !== requestId) return;

        const taskRows = (tasksRes.data ?? []) as TaskRow[];
        const assigneeRows = (assigneesRes.data ?? []) as AssigneeRow[];
        const taskAssigneeIds = new Set(
          taskRows.flatMap((row) => normalizeAssigneeIds(row.assignee_ids, row.assignee_id)),
        );

        if (get().dataRequestId !== requestId) return;

        const assignees = assigneeRows
          .filter((row) => {
            // Всегда исключаем админа из списка assignees, независимо от того, назначен ли он на задачи
            if (adminUserId && row.user_id === adminUserId) return false;
            return row.user_id !== null || taskAssigneeIds.has(row.id);
          })
          .sort((left, right) => left.name.localeCompare(right.name))
          .map(mapAssigneeRow);

        const memberGroups = (memberGroupsRes.data ?? [])
          .map((row) => ({
            id: (row as MemberGroupRow).id,
            name: (row as MemberGroupRow).name,
          }))
          .sort((left, right) => left.name.localeCompare(right.name));

        const memberGroupAssignments = (memberAssignmentsRes.data ?? []).map((row) => ({
          userId: (row as MemberGroupAssignmentRow).user_id,
          groupId: (row as MemberGroupAssignmentRow).group_id ?? null,
        }));

        const nextProjects = (projectsRes.data ?? []).map(mapProjectRow);
        const nextCustomers = (customersRes.data ?? []).map(mapCustomerRow).sort((left, right) => (
          left.name.localeCompare(right.name)
        ));
        const nextTrackedProjectIds = get().trackedProjectIds;
        const activeProjectIds = new Set(nextProjects.filter((project) => !project.archived).map((project) => project.id));
        const activeGroupIds = new Set(memberGroups.map((group) => group.id));

        if (get().dataRequestId !== requestId) return;

        set((state) => ({
          tasks: taskRows.map(mapTaskRow),
          milestones: (milestonesRes.data ?? []).map(mapMilestoneRow),
          projects: nextProjects,
          trackedProjectIds: nextTrackedProjectIds,
          customers: nextCustomers,
          assignees,
          memberGroups,
          memberGroupAssignments,
          statuses: (statusesRes.data ?? []).map(mapStatusRow),
          taskTypes: (taskTypesRes.data ?? []).map(mapTaskTypeRow),
          tags: (tagsRes.data ?? []).map(mapTagRow),
          loadedRange: { start, end, viewMode, workspaceId },
          filters: {
            ...state.filters,
            projectIds: state.filters.projectIds.filter((id) => activeProjectIds.has(id)),
            groupIds: state.filters.groupIds.filter((id) => activeGroupIds.has(id)),
          },
          loading: false,
        }));

        // Background: counts (can be heavy). Update store when ready; UI can use fallback values meanwhile.
        if (shouldFetchCounts) {
          countsPromise
            .then((countsRes) => {
              if (get().dataRequestId !== requestId) return;
              if (countsRes.error) {
                console.error(countsRes.error);
                return;
              }
              const totals: Record<string, number> = {};
              ((countsRes.data as AssigneeUniqueTaskCountRow[] | null | undefined) ?? []).forEach((row) => {
                if (!row.assignee_id) return;
                const value = typeof row.total === 'string' ? Number(row.total) : (row.total ?? 0);
                totals[row.assignee_id] = value;
              });
              set({
                assigneeTaskCounts: totals,
                assigneeCountsDate: today,
                assigneeCountsWorkspaceId: workspaceId,
              });
            })
            .catch((error) => {
              console.error(error);
            });
        }

        // Background: tracked projects for the current user (small, but not critical for first paint).
        trackedPromise
          .then((trackedRes) => {
            if (get().dataRequestId !== requestId) return;
            if (trackedRes.error) {
              console.error(trackedRes.error);
              return;
            }
            const trackedIds = (trackedRes.data ?? []).map((row) => (row as ProjectTrackingRow).project_id);
            set({ trackedProjectIds: trackedIds });
          })
          .catch((error) => {
            console.error(error);
          });
      },
      refreshAssignees: async () => {
        const workspaceId = get().workspaceId;
        if (!workspaceId) return;

        const { data, error } = await supabase
          .from('assignees')
          .select('id, workspace_id, name, user_id, is_active')
          .eq('workspace_id', workspaceId);

        if (error) {
          console.error(error);
          return;
        }

        // Получаем user_id админа для фильтрации
        const adminUserId = await fetchReserveAdminUserId();

        const taskAssigneeIds = new Set(
          get().tasks.flatMap((task) => task.assigneeIds),
        );

        const assignees = (data ?? [])
          .filter((row) => {
            // Всегда исключаем админа из списка assignees, независимо от того, назначен ли он на задачи
            if (adminUserId && row.user_id === adminUserId) return false;
            return row.user_id !== null || taskAssigneeIds.has(row.id);
          })
          .sort((left, right) => left.name.localeCompare(right.name))
          .map(mapAssigneeRow);

        set({ assignees });
      },
      refreshMemberGroups: async () => {
        const workspaceId = get().workspaceId;
        if (!workspaceId) return;

        const [groupsRes, membersRes] = await Promise.all([
          supabase
            .from('member_groups')
            .select('id, name')
            .eq('workspace_id', workspaceId)
            .order('name', { ascending: true }),
          supabase
            .from('workspace_members')
            .select('user_id, group_id')
            .eq('workspace_id', workspaceId),
        ]);

        if (groupsRes.error || membersRes.error) {
          console.error(groupsRes.error ?? membersRes.error);
          return;
        }

        const memberGroups = (groupsRes.data ?? []).map((row) => ({
          id: (row as { id: string }).id,
          name: (row as { name: string }).name,
        }));
        const memberGroupAssignments = (membersRes.data ?? []).map((row) => ({
          userId: (row as MemberGroupAssignmentRow).user_id,
          groupId: (row as MemberGroupAssignmentRow).group_id ?? null,
        }));
        const groupIds = new Set(memberGroups.map((group) => group.id));
        set((state) => ({
          memberGroups,
          memberGroupAssignments,
          filters: {
            ...state.filters,
            groupIds: state.filters.groupIds.filter((id) => groupIds.has(id)),
          },
        }));
      },

      addTask: async (task) => {
        const workspaceId = get().workspaceId;
        if (!workspaceId) return null;

        const assigneeIds = pickActiveAssigneeIds(task.assigneeIds, get().assignees);

        const { data, error } = await supabase
          .from('tasks')
          .insert({
            workspace_id: workspaceId,
            title: task.title,
            project_id: task.projectId,
            assignee_id: assigneeIds[0] ?? null,
            assignee_ids: assigneeIds,
            start_date: task.startDate,
            end_date: task.endDate,
            status_id: task.statusId,
            type_id: task.typeId,
            priority: task.priority,
            tag_ids: task.tagIds,
            description: task.description,
            repeat_id: task.repeatId,
          })
          .select('*')
          .single();

        if (error || !data) {
          console.error(error);
          return null;
        }

        const mapped = mapTaskRow(data as TaskRow);
        set((state) => ({ tasks: [...state.tasks, mapped] }));
        return mapped;
      },

      updateTask: async (id, updates, scope = 'single') => {
        const workspaceId = get().workspaceId;
        if (!workspaceId) return;

        const payload = mapTaskUpdates(updates);
        if (Object.keys(payload).length === 0) return;

        const applyUpdatedRows = (rows: TaskRow[]) => {
          if (rows.length === 0) return;
          const updatedById = new Map(rows.map((row) => [row.id, mapTaskRow(row)]));
          set((state) => ({
            tasks: state.tasks.map((task) => updatedById.get(task.id) ?? task),
          }));
        };

        let baseTask = get().tasks.find((task) => task.id === id) ?? null;
        if (!baseTask && scope !== 'single') {
          const { data: baseTaskData, error: baseTaskError } = await supabase
            .from('tasks')
            .select('*')
            .eq('id', id)
            .eq('workspace_id', workspaceId)
            .single();
          if (baseTaskError || !baseTaskData) {
            console.error(baseTaskError);
            return;
          }
          baseTask = mapTaskRow(baseTaskData as TaskRow);
          set((state) => (
            state.tasks.some((task) => task.id === baseTask!.id)
              ? state
              : { tasks: [...state.tasks, baseTask!] }
          ));
        }

        const repeatScope = (scope !== 'single' && baseTask?.repeatId)
          ? scope
          : 'single';

        if (repeatScope !== 'single' && baseTask?.repeatId) {
          const query = supabase
            .from('tasks')
            .update(payload)
            .eq('workspace_id', workspaceId)
            .eq('repeat_id', baseTask.repeatId);

          const { data, error } = await (repeatScope === 'following'
            ? query.gte('start_date', baseTask.startDate).select('*')
            : query.select('*'));

          if (error) {
            console.error(error);
            return;
          }

          applyUpdatedRows((data ?? []) as TaskRow[]);
          return;
        }

        const { data, error } = await supabase
          .from('tasks')
          .update(payload)
          .eq('id', id)
          .eq('workspace_id', workspaceId)
          .select('*')
          .single();

        if (error || !data) {
          console.error(error);
          return;
        }

        const updated = mapTaskRow(data as TaskRow);
        set((state) => ({
          tasks: state.tasks.map((task) => (task.id === id ? updated : task)),
        }));
      },

      deleteTask: async (id) => {
        const workspaceId = get().workspaceId;
        if (!workspaceId) return;

        const { error } = await supabase
          .from('tasks')
          .delete()
          .eq('id', id)
          .eq('workspace_id', workspaceId);

        if (error) {
          console.error(error);
          return;
        }

        set((state) => ({
          tasks: state.tasks.filter((task) => task.id !== id),
          selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId,
        }));
      },

      deleteTasks: async (ids) => {
        const workspaceId = get().workspaceId;
        if (!workspaceId || ids.length === 0) return {};

        const { error } = await supabase
          .from('tasks')
          .delete()
          .eq('workspace_id', workspaceId)
          .in('id', ids);

        if (error) {
          console.error(error);
          return { error: error.message };
        }

        set((state) => ({
          tasks: state.tasks.filter((task) => !ids.includes(task.id)),
          selectedTaskId: state.selectedTaskId && ids.includes(state.selectedTaskId)
            ? null
            : state.selectedTaskId,
        }));

        return {};
      },

      duplicateTask: async (id) => {
        const task = get().tasks.find((item) => item.id === id);
        if (!task) return;

        const start = parseISO(task.startDate);
        const end = parseISO(task.endDate);
        const duration = differenceInDays(end, start) + 1;
        const newStart = addDays(end, 1);
        const newEnd = addDays(newStart, Math.max(0, duration - 1));

        await get().addTask({
          title: task.title,
          projectId: task.projectId,
          assigneeIds: [...task.assigneeIds],
          startDate: format(newStart, 'yyyy-MM-dd'),
          endDate: format(newEnd, 'yyyy-MM-dd'),
          statusId: task.statusId,
          typeId: task.typeId,
          priority: task.priority,
          tagIds: [...task.tagIds],
          description: task.description,
          repeatId: null,
        });
      },

      createRepeats: async (id, options) => {
        const workspaceId = get().workspaceId;
        if (!workspaceId) return { error: 'Workspace not selected.' };
        let task = get().tasks.find((item) => item.id === id);
        if (!task) {
          const { data, error } = await supabase
            .from('tasks')
            .select('*')
            .eq('id', id)
            .eq('workspace_id', workspaceId)
            .single();

          if (error || !data) {
            return { error: error?.message ?? 'Task not found.' };
          }

          const fetchedTask = mapTaskRow(data as TaskRow);
          task = fetchedTask;
          set((state) => (
            state.tasks.some((item) => item.id === fetchedTask.id)
              ? state
              : { tasks: [...state.tasks, fetchedTask] }
          ));
        }

        const repeatId = task.repeatId ?? (typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

        if (!task.repeatId) {
          const { data: repeatData, error: repeatError } = await supabase
            .from('tasks')
            .update({ repeat_id: repeatId })
            .eq('id', task.id)
            .eq('workspace_id', workspaceId)
            .select('*')
            .single();

          if (repeatError || !repeatData) {
            return { error: repeatError?.message ?? 'Failed to link repeat series.' };
          }

          const updatedTask = mapTaskRow(repeatData as TaskRow);
          set((state) => ({
            tasks: state.tasks.map((item) => (item.id === task.id ? updatedTask : item)),
          }));
        }

        const baseStart = parseISO(task.startDate);
        const baseEnd = parseISO(task.endDate);
        const duration = differenceInDays(baseEnd, baseStart) + 1;
        const assigneeIds = pickActiveAssigneeIds(task.assigneeIds, get().assignees);
        const { data: existingRepeats, error: existingRepeatsError } = await supabase
          .from('tasks')
          .select('start_date')
          .eq('workspace_id', workspaceId)
          .eq('repeat_id', repeatId);
        if (existingRepeatsError) {
          console.error(existingRepeatsError);
        }
        const existingRepeatDates = new Set(
          (existingRepeats ?? []).map((item: { start_date: string }) => item.start_date),
        );
        const endsMode = options.ends;
        const targetCount = options.count && options.count > 0 ? options.count : 0;
        const untilDate = options.untilDate ? parseISO(options.untilDate) : null;
        const neverHorizon = addYears(baseStart, 1);

        const addInterval = (date: Date, step: number) => {
          switch (options.frequency) {
            case 'daily':
              return addDays(date, step);
            case 'weekly':
              return addWeeks(date, step);
            case 'biweekly':
              return addWeeks(date, step * 2);
            case 'monthly':
              return addMonths(date, step);
            case 'yearly':
              return addYears(date, step);
            default:
              return addWeeks(date, step);
          }
        };

        const newTasks: Array<{
          workspace_id: string;
          title: string;
          project_id: string | null;
          assignee_id: string | null;
          assignee_ids: string[];
          start_date: string;
          end_date: string;
          status_id: string;
          type_id: string;
          priority: TaskPriority | null;
          tag_ids: string[];
          description: string | null;
          repeat_id: string;
        }> = [];

        for (let index = 1; index <= 500; index += 1) {
          if (endsMode === 'after' && index > targetCount) break;
          const nextStart = addInterval(baseStart, index);
          if (endsMode === 'on' && untilDate && nextStart > untilDate) break;
          if (endsMode === 'never' && nextStart > neverHorizon) break;

          const startDate = format(nextStart, 'yyyy-MM-dd');
          if (existingRepeatDates.has(startDate)) {
            continue;
          }
          existingRepeatDates.add(startDate);
          const nextEnd = addDays(nextStart, Math.max(0, duration - 1));
          newTasks.push({
            workspace_id: workspaceId,
            title: task.title,
            project_id: task.projectId,
            assignee_id: assigneeIds[0] ?? null,
            assignee_ids: [...assigneeIds],
            start_date: startDate,
            end_date: format(nextEnd, 'yyyy-MM-dd'),
            status_id: task.statusId,
            type_id: task.typeId,
            priority: task.priority,
            tag_ids: [...task.tagIds],
            description: task.description,
            repeat_id: repeatId,
          });
        }

        if (newTasks.length === 0) {
          return { error: 'No repeats created for the selected range.' };
        }

        const { data, error } = await supabase
          .from('tasks')
          .insert(newTasks)
          .select('*');

        if (error) {
          return { error: error.message };
        }

        set((state) => ({
          tasks: [...state.tasks, ...((data ?? []) as TaskRow[]).map(mapTaskRow)],
        }));

        return { created: newTasks.length };
      },

      moveTask: async (id, startDate, endDate) => {
        await get().updateTask(id, { startDate, endDate });
      },

      reassignTask: async (id, assigneeId, projectId) => {
        if (assigneeId) {
          const targetAssignee = get().assignees.find((assignee) => assignee.id === assigneeId);
          if (!targetAssignee?.isActive) {
            return;
          }
        }

        await get().updateTask(id, {
          assigneeIds: assigneeId ? [assigneeId] : [],
          ...(projectId !== undefined ? { projectId } : {}),
        });
      },

      deleteTaskSeries: async (repeatId, fromDate) => {
        const workspaceId = get().workspaceId;
        if (!workspaceId) return;

        const { error } = await supabase
          .from('tasks')
          .delete()
          .eq('workspace_id', workspaceId)
          .eq('repeat_id', repeatId)
          .gte('start_date', fromDate);

        if (error) {
          console.error(error);
          return;
        }

        set((state) => {
          const deletedIds = new Set(
            state.tasks
              .filter((item) => item.repeatId === repeatId && item.startDate >= fromDate)
              .map((item) => item.id)
          );
          return {
            tasks: state.tasks.filter((item) => !(item.repeatId === repeatId && item.startDate >= fromDate)),
            selectedTaskId: state.selectedTaskId && deletedIds.has(state.selectedTaskId) ? null : state.selectedTaskId,
          };
        });
      },

      removeAssigneeFromTask: async (id, assigneeId, mode) => {
        const workspaceId = get().workspaceId;
        if (!workspaceId || !assigneeId) return;

        let baseTask = get().tasks.find((task) => task.id === id) ?? null;
        if (!baseTask) {
          const { data, error } = await supabase
            .from('tasks')
            .select('*')
            .eq('id', id)
            .eq('workspace_id', workspaceId)
            .single();
          if (error || !data) {
            console.error(error);
            return;
          }
          baseTask = mapTaskRow(data as TaskRow);
        }

        const isFollowingMode = mode === 'following' && Boolean(baseTask.repeatId);
        const query = supabase
          .from('tasks')
          .select('*')
          .eq('workspace_id', workspaceId);
        const { data: targetRows, error: targetRowsError } = await (isFollowingMode
          ? query
            .eq('repeat_id', baseTask.repeatId)
            .gte('start_date', baseTask.startDate)
          : query.eq('id', id));

        if (targetRowsError) {
          console.error(targetRowsError);
          return;
        }

        const rows = (targetRows ?? []) as TaskRow[];
        if (rows.length === 0) return;

        const updatedRows: TaskRow[] = [];
        const deleteIds: string[] = [];

        for (const row of rows) {
          const currentAssignees = normalizeAssigneeIds(row.assignee_ids, row.assignee_id);
          if (!currentAssignees.includes(assigneeId)) continue;

          const nextAssignees = uniqueAssigneeIds(currentAssignees.filter((item) => item !== assigneeId));
          if (nextAssignees.length === 0) {
            deleteIds.push(row.id);
            continue;
          }

          const { data: updatedRow, error: updateError } = await supabase
            .from('tasks')
            .update({
              assignee_ids: nextAssignees,
              assignee_id: nextAssignees[0] ?? null,
            })
            .eq('workspace_id', workspaceId)
            .eq('id', row.id)
            .select('*')
            .single();

          if (updateError || !updatedRow) {
            console.error(updateError);
            return;
          }

          updatedRows.push(updatedRow as TaskRow);
        }

        if (deleteIds.length > 0) {
          const { error: deleteError } = await supabase
            .from('tasks')
            .delete()
            .eq('workspace_id', workspaceId)
            .in('id', deleteIds);
          if (deleteError) {
            console.error(deleteError);
            return;
          }
        }

        if (updatedRows.length === 0 && deleteIds.length === 0) return;

        set((state) => {
          const updatedById = new Map(updatedRows.map((row) => [row.id, mapTaskRow(row)]));
          const deleted = new Set(deleteIds);
          return {
            tasks: state.tasks
              .filter((task) => !deleted.has(task.id))
              .map((task) => updatedById.get(task.id) ?? task),
            selectedTaskId: state.selectedTaskId && deleted.has(state.selectedTaskId)
              ? null
              : state.selectedTaskId,
          };
        });
      },

      addProject: async (project) => {
        const workspaceId = get().workspaceId;
        if (!workspaceId) return;

        const { data, error } = await supabase
          .from('projects')
          .insert({
            workspace_id: workspaceId,
            name: project.name,
            code: project.code ?? null,
            color: project.color,
            archived: project.archived ?? false,
            customer_id: project.customerId ?? null,
          })
          .select('*')
          .single();

        if (error || !data) {
          console.error(error);
          return;
        }

        set((state) => ({ projects: [...state.projects, mapProjectRow(data as ProjectRow)] }));
      },

      updateProject: async (id, updates) => {
        const workspaceId = get().workspaceId;
        if (!workspaceId) return;

        const payload: Record<string, unknown> = {};
        if ('name' in updates) payload.name = updates.name;
        if ('code' in updates) payload.code = updates.code;
        if ('color' in updates) payload.color = updates.color;
        if ('archived' in updates) payload.archived = updates.archived;
        if ('customerId' in updates) payload.customer_id = updates.customerId;
        if (Object.keys(payload).length === 0) return;

        const { data, error } = await supabase
          .from('projects')
          .update(payload)
          .eq('id', id)
          .eq('workspace_id', workspaceId)
          .select('*')
          .single();

        if (error || !data) {
          console.error(error);
          return;
        }

        const updated = mapProjectRow(data as ProjectRow);
        set((state) => {
          const projects = state.projects.map((project) => (project.id === id ? updated : project));
          if (!updated.archived) {
            return { projects };
          }
          return {
            projects,
            filters: {
              ...state.filters,
              projectIds: state.filters.projectIds.filter((projectId) => projectId !== id),
            },
          };
        });
      },

      deleteProject: async (id) => {
        const workspaceId = get().workspaceId;
        if (!workspaceId) return;

        const { error } = await supabase
          .from('projects')
          .delete()
          .eq('id', id)
          .eq('workspace_id', workspaceId);

        if (error) {
          console.error(error);
          return;
        }

        set((state) => ({
          projects: state.projects.filter((project) => project.id !== id),
          tasks: state.tasks.map((task) => task.projectId === id ? { ...task, projectId: null } : task),
          trackedProjectIds: state.trackedProjectIds.filter((projectId) => projectId !== id),
          filters: {
            ...state.filters,
            projectIds: state.filters.projectIds.filter((projectId) => projectId !== id),
          },
        }));
      },

      toggleTrackedProject: async (projectId, isTracked) => {
        const workspaceId = get().workspaceId;
        if (!workspaceId) return;

        const { data: authData } = await supabase.auth.getUser();
        const userId = authData?.user?.id ?? null;
        if (!userId) return;

        const isAlreadyTracked = get().trackedProjectIds.includes(projectId);
        const nextTracked = typeof isTracked === 'boolean' ? isTracked : !isAlreadyTracked;
        if (nextTracked === isAlreadyTracked) return;

        if (nextTracked) {
          const { error } = await supabase
            .from('project_tracking')
            .insert({
              workspace_id: workspaceId,
              project_id: projectId,
              user_id: userId,
            });
          if (error) {
            console.error(error);
            return;
          }
          set((state) => ({ trackedProjectIds: [...state.trackedProjectIds, projectId] }));
          return;
        }

        const { error } = await supabase
          .from('project_tracking')
          .delete()
          .eq('workspace_id', workspaceId)
          .eq('project_id', projectId)
          .eq('user_id', userId);
        if (error) {
          console.error(error);
          return;
        }
        set((state) => ({
          trackedProjectIds: state.trackedProjectIds.filter((id) => id !== projectId),
        }));
      },

      addCustomer: async (customer) => {
        const workspaceId = get().workspaceId;
        if (!workspaceId) return null;

        const { data, error } = await supabase
          .from('customers')
          .insert({
            workspace_id: workspaceId,
            name: customer.name,
          })
          .select('*')
          .single();

        if (error || !data) {
          console.error(error);
          return null;
        }

        const mapped = mapCustomerRow(data as CustomerRow);
        set((state) => ({
          customers: [...state.customers, mapped].sort((left, right) => left.name.localeCompare(right.name)),
        }));
        return mapped;
      },

      updateCustomer: async (id, updates) => {
        const workspaceId = get().workspaceId;
        if (!workspaceId) return;

        const payload: Record<string, unknown> = {};
        if ('name' in updates) payload.name = updates.name;
        if (Object.keys(payload).length === 0) return;

        const { data, error } = await supabase
          .from('customers')
          .update(payload)
          .eq('id', id)
          .eq('workspace_id', workspaceId)
          .select('*')
          .single();

        if (error || !data) {
          console.error(error);
          return;
        }

        const updated = mapCustomerRow(data as CustomerRow);
        set((state) => ({
          customers: state.customers
            .map((customer) => (customer.id === id ? updated : customer))
            .sort((left, right) => left.name.localeCompare(right.name)),
        }));
      },

      deleteCustomer: async (id) => {
        const workspaceId = get().workspaceId;
        if (!workspaceId) return;

        const { error } = await supabase
          .from('customers')
          .delete()
          .eq('id', id)
          .eq('workspace_id', workspaceId);

        if (error) {
          console.error(error);
          return;
        }

        set((state) => ({
          customers: state.customers.filter((customer) => customer.id !== id),
          projects: state.projects.map((project) => (
            project.customerId === id ? { ...project, customerId: null } : project
          )),
        }));
      },

      addAssignee: async (assignee) => {
        const workspaceId = get().workspaceId;
        if (!workspaceId) return;

        const { data, error } = await supabase
          .from('assignees')
          .insert({
            workspace_id: workspaceId,
            name: assignee.name,
            is_active: assignee.isActive ?? true,
          })
          .select('*')
          .single();

        if (error || !data) {
          console.error(error);
          return;
        }

        set((state) => ({ assignees: [...state.assignees, mapAssigneeRow(data as AssigneeRow)] }));
      },

      updateAssignee: async (id, updates) => {
        const workspaceId = get().workspaceId;
        if (!workspaceId) return;

        const payload: Record<string, unknown> = {};
        if ('name' in updates) payload.name = updates.name;
        if ('isActive' in updates) payload.is_active = updates.isActive;
        if (Object.keys(payload).length === 0) return;

        const { data, error } = await supabase
          .from('assignees')
          .update(payload)
          .eq('id', id)
          .eq('workspace_id', workspaceId)
          .select('*')
          .single();

        if (error || !data) {
          console.error(error);
          return;
        }

        const updated = mapAssigneeRow(data as AssigneeRow);
        set((state) => ({
          assignees: state.assignees.map((assignee) => (assignee.id === id ? updated : assignee)),
        }));
      },

      deleteAssignee: async (id) => {
        const workspaceId = get().workspaceId;
        if (!workspaceId) return;

        const { error } = await supabase
          .from('assignees')
          .delete()
          .eq('id', id)
          .eq('workspace_id', workspaceId);

        if (error) {
          console.error(error);
          return;
        }

        set((state) => ({
          assignees: state.assignees.filter((assignee) => assignee.id !== id),
          tasks: state.tasks.map((task) => (
            task.assigneeIds.includes(id)
              ? { ...task, assigneeIds: task.assigneeIds.filter((assigneeId) => assigneeId !== id) }
              : task
          )),
        }));
      },

      addStatus: async (status) => {
        const workspaceId = get().workspaceId;
        if (!workspaceId) return;

        const { name: cleanedName } = splitStatusLabel(status.name);
        const normalizedName = cleanedName.trim().toLowerCase();
        if (!normalizedName) return;
        const hasDuplicate = get().statuses.some(
          (item) => item.name.trim().toLowerCase() === normalizedName,
        );
        if (hasDuplicate) return;
        const emoji = typeof status.emoji === 'string' ? status.emoji.trim() : status.emoji;
        const isCancelled = Boolean(status.isCancelled);
        const isFinal = Boolean(status.isFinal) && !isCancelled;
        const { data, error } = await supabase
          .from('statuses')
          .insert({
            workspace_id: workspaceId,
            name: cleanedName,
            emoji: emoji || null,
            color: status.color,
            is_final: isFinal,
            is_cancelled: isCancelled,
          })
          .select('*')
          .single();

        if (error || !data) {
          console.error(error);
          return;
        }

        set((state) => ({ statuses: [...state.statuses, mapStatusRow(data as StatusRow)] }));
      },

      updateStatus: async (id, updates) => {
        const workspaceId = get().workspaceId;
        if (!workspaceId) return;

        const payload: Record<string, unknown> = {};
        if ('name' in updates) {
          const { name: cleanedName } = splitStatusLabel(updates.name ?? '');
          payload.name = cleanedName;
        }
        if ('emoji' in updates) {
          const emoji = typeof updates.emoji === 'string' ? updates.emoji.trim() : updates.emoji;
          payload.emoji = emoji || null;
        }
        if ('color' in updates) payload.color = updates.color;
        if ('isFinal' in updates) {
          const isFinal = Boolean(updates.isFinal);
          payload.is_final = isFinal;
          if (isFinal) {
            payload.is_cancelled = false;
          }
        }
        if ('isCancelled' in updates) {
          const isCancelled = Boolean(updates.isCancelled);
          payload.is_cancelled = isCancelled;
          if (isCancelled) {
            payload.is_final = false;
          }
        }
        if (Object.keys(payload).length === 0) return;

        const { data, error } = await supabase
          .from('statuses')
          .update(payload)
          .eq('id', id)
          .eq('workspace_id', workspaceId)
          .select('*')
          .single();

        if (error || !data) {
          console.error(error);
          return;
        }

        const updated = mapStatusRow(data as StatusRow);
        set((state) => ({
          statuses: state.statuses.map((status) => (status.id === id ? updated : status)),
        }));
      },

      deleteStatus: async (id) => {
        const workspaceId = get().workspaceId;
        if (!workspaceId) return;

        const { error } = await supabase
          .from('statuses')
          .delete()
          .eq('id', id)
          .eq('workspace_id', workspaceId);

        if (error) {
          console.error(error);
          return;
        }

        set((state) => ({
          statuses: state.statuses.filter((status) => status.id !== id),
        }));
      },

      addTaskType: async (taskType) => {
        const workspaceId = get().workspaceId;
        if (!workspaceId) return;

        const { data, error } = await supabase
          .from('task_types')
          .insert({
            workspace_id: workspaceId,
            name: taskType.name,
            icon: taskType.icon,
          })
          .select('*')
          .single();

        if (error || !data) {
          console.error(error);
          return;
        }

        set((state) => ({ taskTypes: [...state.taskTypes, mapTaskTypeRow(data as TaskTypeRow)] }));
      },

      updateTaskType: async (id, updates) => {
        const workspaceId = get().workspaceId;
        if (!workspaceId) return;

        const payload: Record<string, unknown> = {};
        if ('name' in updates) payload.name = updates.name;
        if ('icon' in updates) payload.icon = updates.icon;
        if (Object.keys(payload).length === 0) return;

        const { data, error } = await supabase
          .from('task_types')
          .update(payload)
          .eq('id', id)
          .eq('workspace_id', workspaceId)
          .select('*')
          .single();

        if (error || !data) {
          console.error(error);
          return;
        }

        const updated = mapTaskTypeRow(data as TaskTypeRow);
        set((state) => ({
          taskTypes: state.taskTypes.map((taskType) => (taskType.id === id ? updated : taskType)),
        }));
      },

      deleteTaskType: async (id) => {
        const workspaceId = get().workspaceId;
        if (!workspaceId) return;

        const { error } = await supabase
          .from('task_types')
          .delete()
          .eq('id', id)
          .eq('workspace_id', workspaceId);

        if (error) {
          console.error(error);
          return;
        }

        set((state) => ({
          taskTypes: state.taskTypes.filter((taskType) => taskType.id !== id),
        }));
      },

      addTag: async (tag) => {
        const workspaceId = get().workspaceId;
        if (!workspaceId) return;

        const { data, error } = await supabase
          .from('tags')
          .insert({
            workspace_id: workspaceId,
            name: tag.name,
            color: tag.color,
          })
          .select('*')
          .single();

        if (error || !data) {
          console.error(error);
          return;
        }

        set((state) => ({ tags: [...state.tags, mapTagRow(data as TagRow)] }));
      },

      updateTag: async (id, updates) => {
        const workspaceId = get().workspaceId;
        if (!workspaceId) return;

        const payload: Record<string, unknown> = {};
        if ('name' in updates) payload.name = updates.name;
        if ('color' in updates) payload.color = updates.color;
        if (Object.keys(payload).length === 0) return;

        const { data, error } = await supabase
          .from('tags')
          .update(payload)
          .eq('id', id)
          .eq('workspace_id', workspaceId)
          .select('*')
          .single();

        if (error || !data) {
          console.error(error);
          return;
        }

        const updated = mapTagRow(data as TagRow);
        set((state) => ({
          tags: state.tags.map((tag) => (tag.id === id ? updated : tag)),
        }));
      },

      deleteTag: async (id) => {
        const workspaceId = get().workspaceId;
        if (!workspaceId) return;

        const { error } = await supabase
          .from('tags')
          .delete()
          .eq('id', id)
          .eq('workspace_id', workspaceId);

        if (error) {
          console.error(error);
          return;
        }

        set((state) => ({
          tags: state.tags.filter((tag) => tag.id !== id),
          tasks: state.tasks.map((task) => ({
            ...task,
            tagIds: task.tagIds.filter((tagId) => tagId !== id),
          })),
        }));
      },

      addMilestone: async (milestone) => {
        const workspaceId = get().workspaceId;
        if (!workspaceId) return;

        const { data, error } = await supabase
          .from('milestones')
          .insert({
            workspace_id: workspaceId,
            project_id: milestone.projectId,
            date: milestone.date,
            title: milestone.title,
          })
          .select('*')
          .single();

        if (error || !data) {
          console.error(error);
          return;
        }

        set((state) => ({ milestones: [...state.milestones, mapMilestoneRow(data as MilestoneRow)] }));
      },

      updateMilestone: async (id, updates) => {
        const workspaceId = get().workspaceId;
        if (!workspaceId) return;

        const payload: Record<string, unknown> = {};
        if ('title' in updates) payload.title = updates.title;
        if ('projectId' in updates) payload.project_id = updates.projectId;
        if ('date' in updates) payload.date = updates.date;
        if (Object.keys(payload).length === 0) return;

        const { data, error } = await supabase
          .from('milestones')
          .update(payload)
          .eq('id', id)
          .eq('workspace_id', workspaceId)
          .select('*')
          .single();

        if (error || !data) {
          console.error(error);
          return;
        }

        const updated = mapMilestoneRow(data as MilestoneRow);
        set((state) => ({
          milestones: state.milestones.map((item) => (item.id === id ? updated : item)),
        }));
      },

      deleteMilestone: async (id) => {
        const workspaceId = get().workspaceId;
        if (!workspaceId) return;

        const { error } = await supabase
          .from('milestones')
          .delete()
          .eq('id', id)
          .eq('workspace_id', workspaceId);

        if (error) {
          console.error(error);
          return;
        }

        set((state) => ({
          milestones: state.milestones.filter((item) => item.id !== id),
        }));
      },

      setViewMode: (mode) => set({ viewMode: mode }),
      setGroupMode: (mode) => set({ groupMode: mode }),
      setCurrentDate: (date) => set({ currentDate: date }),
      requestScrollToDate: (date) => set((state) => ({
        scrollTargetDate: date,
        scrollRequestId: state.scrollRequestId + 1,
      })),
      setTimelineAttentionDate: (date) => set({ timelineAttentionDate: date }),
      setFilters: (filters) => set((state) => ({
        filters: { ...state.filters, ...filters },
      })),
      clearFilterCriteria: () => set((state) => ({
        filters: {
          ...state.filters,
          projectIds: [],
          assigneeIds: [],
          groupIds: [],
          statusIds: [],
          typeIds: [],
          tagIds: [],
        },
      })),
      clearFilters: () => set({ filters: initialFilters }),
      setSelectedTaskId: (id) => set({ selectedTaskId: id }),
      setHighlightedTaskId: (id) => set({ highlightedTaskId: id }),
    }),
    {
      name: 'planner-storage',
      partialize: (state) => ({
        viewMode: state.viewMode,
        groupMode: state.groupMode,
        currentDate: state.currentDate,
      }),
    }
  )
);
