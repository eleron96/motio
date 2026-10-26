import { addYears, format, parseISO } from 'date-fns';
import { supabase } from '@/shared/lib/supabaseClient';
import { getAdminUserId } from '@/shared/lib/adminConfig';
import { useAuthStore } from '@/features/auth/store/authStore';
import { isProjectCardEnabled, isTimeOffEnabled } from '@/shared/lib/featureFlags';
import { mapTaskRow, normalizeAssigneeIds } from '@/shared/domain/taskRowMapper';
import { fetchTaskCommentCounts } from '@/infrastructure/tasks/taskCommentsRepository';
import type {
  PlannerGetState,
  PlannerSetState,
  PlannerStore,
} from '@/features/planner/store/plannerStore.contract';
import {
  AssigneeRow,
  AssigneeUniqueTaskCountRow,
  buildTaskRange,
  mapAssigneeRow,
  mapCustomerRow,
  mapCustomerContactRow,
  mapProjectActivityRow,
  mapProjectMemberRow,
  mapMilestoneRow,
  mapProjectRow,
  mapStatusRow,
  mapTagRow,
  mapTaskTypeRow,
  mapTimeOffRow,
  MemberGroupAssignmentRow,
  shouldReuseLoadedWindow,
  MemberGroupRow,
  ProjectTrackingRow,
  SupabaseResult,
  TaskRow,
  TimeOffRow,
} from '@/features/planner/store/plannerStore.helpers';
import type { Assignee } from '@/features/planner/types/planner';
import { getTimeOffMotifId, type TimeOffMotifId } from '@/features/planner/lib/timeOffMotifs';
import { recordWorkspaceMemberActivity } from '@/infrastructure/workspace/memberActivityRepository';
import { buildWorkspaceMemberActivityActorSnapshot } from '@/shared/domain/workspaceMemberActivity';
import {
  buildBoardScope,
  mergeBoardLoad,
  mergeWindowLoad,
  pruneToWindow,
} from '@/shared/domain/taskLoadScopes';
import { fetchBoardTasks } from '@/infrastructure/tasks/boardTasksRepository';

type WorkspaceActions = Pick<
  PlannerStore,
  | 'loadWorkspaceData'
  | 'loadBoardTasks'
  | 'releaseBoardScope'
  | 'refreshAssignees'
  | 'refreshMemberGroups'
  | 'refreshSampleDataFlag'
  | 'clearSampleData'
  | 'fetchAssigneeTaskCounts'
  | 'fetchMemberGroups'
  | 'fetchGroupMembers'
  | 'createMemberGroup'
  | 'updateMemberGroup'
  | 'deleteMemberGroup'
>;

type WorkspaceMemberWithProfileRow = {
  user_id: string;
  role: 'admin' | 'editor' | 'viewer';
  profiles: {
    email: string;
    display_name: string | null;
  } | null;
};

const mapAssigneeTaskCounts = (rows: AssigneeUniqueTaskCountRow[] | null | undefined) => {
  const totals: Record<string, number> = {};
  (rows ?? []).forEach((row) => {
    if (!row.assignee_id) return;
    const value = typeof row.total === 'string' ? Number(row.total) : (row.total ?? 0);
    totals[row.assignee_id] = value;
  });
  return totals;
};

// The assignees table has no FK to profiles, so we can't embed avatar_url in the
// assignees query. Fetch the profile bits separately by user_id and merge them in.
// Best-effort: on error the people just keep their initials monogram and the
// default time-off motif.
const attachAssigneeProfiles = async (assignees: Assignee[]): Promise<void> => {
  const ids = Array.from(
    new Set(assignees.map((a) => a.userId).filter((id): id is string => Boolean(id))),
  );
  if (ids.length === 0) return;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, avatar_url, preferences')
    .in('id', ids);
  if (error || !data) return;
  const avatarById = new Map<string, string>();
  const motifById = new Map<string, TimeOffMotifId>();
  for (const row of data) {
    if (typeof row.id !== 'string') continue;
    if (row.avatar_url) {
      avatarById.set(row.id, row.avatar_url as string);
    }
    // Narrow the value HERE and never keep a teammate's raw preferences object:
    // the row also carries their digest and push settings, which this client has
    // no business holding on to.
    const preferences = row.preferences as Record<string, unknown> | null | undefined;
    motifById.set(row.id, getTimeOffMotifId(preferences));
  }
  for (const assignee of assignees) {
    if (!assignee.userId) continue;
    const url = avatarById.get(assignee.userId);
    if (url) assignee.avatar = url;
    const motif = motifById.get(assignee.userId);
    if (motif) assignee.timeOffMotif = motif;
  }
};

// Guards board loads against stale responses: a newer load or a release bumps
// it, and an in-flight response with an older value is ignored.
let boardRequestSeq = 0;

export const createWorkspaceActions = (
  set: PlannerSetState,
  get: PlannerGetState,
): WorkspaceActions => ({
  loadWorkspaceData: async (workspaceId) => {
    const { currentDate, viewMode, loadedRange } = get();
    if (shouldReuseLoadedWindow(loadedRange, { workspaceId, currentDate, viewMode })) {
      return;
    }

    const requestId = get().dataRequestId + 1;
    const previousWorkspaceId = get().workspaceId;
    const workspaceChanged = Boolean(previousWorkspaceId && previousWorkspaceId !== workspaceId);
    const workspaceResetPatch = workspaceChanged
      ? {
        trackedProjectIds: [] as string[],
        timelineAttentionDate: null as string | null,
        // Стек отмены — контекст воркспейса: записи чужого пространства
        // нельзя ни показывать, ни исполнять. Окна отложенного удаления
        // (pendingDeleteTaskIds) не трогаем — их коммиты должны доехать.
        taskUndoStack: [] as PlannerStore['taskUndoStack'],
        // The board scope belongs to the previous workspace's statuses.
        boardScope: null as PlannerStore['boardScope'],
      }
      : {};

    set({
      loading: true,
      error: null,
      workspaceId,
      selectedTaskId: null,
      highlightedTaskId: null,
      highlightedTaskRowAssigneeId: null,
      peekedTaskId: null,
      dataRequestId: requestId,
      ...workspaceResetPatch,
    });

    const { start, end } = buildTaskRange(currentDate, viewMode);
    const today = format(new Date(), 'yyyy-MM-dd');
    const countsEnd = format(addYears(parseISO(today), 10), 'yyyy-MM-dd');
    const { assigneeCountsDate, assigneeCountsWorkspaceId } = get();
    const shouldFetchCounts = assigneeCountsDate !== today || assigneeCountsWorkspaceId !== workspaceId;

    const countsPromise: Promise<SupabaseResult<unknown>> = shouldFetchCounts
      ? Promise.resolve(supabase.rpc('assignee_unique_task_counts', {
        p_workspace_id: workspaceId,
        p_start_date: today,
        p_end_date: countsEnd,
      }))
      : Promise.resolve({ data: null, error: null });

    // Не блокируем first paint: tracked-projects не критичны для первичной отрисовки.
    const trackedPromise: Promise<SupabaseResult<unknown[] | null>> = (async () => {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id ?? null;
      if (!userId) return { data: [], error: null };
      return supabase
        .from('project_tracking')
        .select('project_id')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId);
    })();

    const adminUserIdPromise = getAdminUserId();

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
          'repeat_id',
          'repeat_ends',
          'created_at',
          'updated_at',
        ].join(','),
      )
      .eq('workspace_id', workspaceId)
      .gte('end_date', start)
      .lte('start_date', end);

    const projectsQuery = supabase
      .from('projects')
      .select('id, workspace_id, name, code, color, archived, customer_id, owner_group_id, status')
      .eq('workspace_id', workspaceId);
    const customersQuery = supabase
      .from('customers')
      .select('id, workspace_id, name, industry')
      .eq('workspace_id', workspaceId);
    // Project-card-only tables: skip the queries entirely when the feature
    // flag is off. Vite inlines `isProjectCardEnabled()` at build time, so
    // disabled deployments pay zero cost (no round-trip, no RAM, no map).
    const projectCardOn = isProjectCardEnabled();
    const customerContactsQuery = projectCardOn
      ? supabase
          .from('customer_contacts')
          .select('id, workspace_id, customer_id, name, role, email, phone, position, company, tag')
          .eq('workspace_id', workspaceId)
          .order('position', { ascending: true })
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] as never[], error: null });
    const assigneesQuery = supabase
      .from('assignees')
      .select('id, workspace_id, name, user_id, is_active, email, phone, color')
      .eq('workspace_id', workspaceId);
    const projectMembersQuery = projectCardOn
      ? supabase
          .from('project_members')
          .select('id, workspace_id, project_id, assignee_id, role, position, tag, external_name, external_company, external_email, external_phone')
          .eq('workspace_id', workspaceId)
          .order('position', { ascending: true })
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] as never[], error: null });
    const projectActivityQuery = projectCardOn
      ? supabase
          .from('project_activity')
          .select('id, workspace_id, project_id, author_id, author_display_name, kind, content, created_at, updated_at, pinned')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as never[], error: null });
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
      .select('id, workspace_id, name, emoji, color, is_final, is_cancelled, created_at')
      .eq('workspace_id', workspaceId);
    const taskTypesQuery = supabase
      .from('task_types')
      .select('id, workspace_id, name, icon')
      .eq('workspace_id', workspaceId);
    const tagsQuery = supabase
      .from('tags')
      .select('id, workspace_id, name, color')
      .eq('workspace_id', workspaceId);
    // Milestones are deliberately NOT windowed by the task load range: they are
    // sparse (a handful per project), and the project card / milestones tab
    // must show far-future dates that lie outside the ±3-month task window.
    const milestonesQuery = supabase
      .from('milestones')
      .select('id, workspace_id, title, project_id, date, note, status_override, include_in_workload')
      .eq('workspace_id', workspaceId);
    // Time off IS windowed like tasks (unlike milestones): absences accumulate
    // linearly with wall-clock time and nothing ever archives them, so an
    // unwindowed query would grow heavier every year on the boot path.
    const timeOffQuery = isTimeOffEnabled()
      ? supabase
          .from('time_off')
          .select('id, workspace_id, assignee_id, start_date, end_date, note')
          .eq('workspace_id', workspaceId)
          .gte('end_date', start)
          .lte('start_date', end)
      : Promise.resolve({ data: [] as never[], error: null });

    const [
      tasksRes,
      projectsRes,
      customersRes,
      customerContactsRes,
      assigneesRes,
      projectMembersRes,
      projectActivityRes,
      memberGroupsRes,
      memberAssignmentsRes,
      statusesRes,
      taskTypesRes,
      tagsRes,
      milestonesRes,
      timeOffRes,
      adminUserId,
    ] = await Promise.all([
      tasksQuery,
      projectsQuery,
      customersQuery,
      customerContactsQuery,
      assigneesQuery,
      projectMembersQuery,
      projectActivityQuery,
      memberGroupsQuery,
      memberAssignmentsQuery,
      statusesQuery,
      taskTypesQuery,
      tagsQuery,
      milestonesQuery,
      timeOffQuery,
      adminUserIdPromise,
    ]);

    if (get().dataRequestId !== requestId) return;

    if (
      tasksRes.error
      || projectsRes.error
      || customersRes.error
      || customerContactsRes.error
      || assigneesRes.error
      || projectMembersRes.error
      || projectActivityRes.error
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
          || customerContactsRes.error?.message
          || assigneesRes.error?.message
          || projectMembersRes.error?.message
          || projectActivityRes.error?.message
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

    const taskRows = (tasksRes.data ?? []) as unknown as TaskRow[];
    const nextTaskIds = new Set(taskRows.map((row) => row.id));
    const assigneeRows = (assigneesRes.data ?? []) as AssigneeRow[];
    const taskAssigneeIds = new Set(
      taskRows.flatMap((row) => normalizeAssigneeIds(row.assignee_ids, row.assignee_id)),
    );

    // Anti-stale guard: если пользователь переключил workspace, этот ответ игнорируем.
    if (get().dataRequestId !== requestId) return;

    const assignees = assigneeRows
      .filter((row) => {
        if (adminUserId && row.user_id === adminUserId) return false;
        return row.user_id !== null || taskAssigneeIds.has(row.id);
      })
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(mapAssigneeRow);

    await attachAssigneeProfiles(assignees);
    if (get().dataRequestId !== requestId) return;

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

    // Deliberately NOT part of the fatal error chain above: that chain is
    // all-or-nothing, so a broken time_off table (or a stale PostgREST schema
    // cache right after the migration) would blank the whole planner. Degrade
    // to "no bands" instead.
    if (timeOffRes.error) console.error(timeOffRes.error);
    const nextTimeOff = timeOffRes.error
      ? []
      : ((timeOffRes.data ?? []) as unknown as TimeOffRow[]).map(mapTimeOffRow);
    const nextProjects = (projectsRes.data ?? []).map(mapProjectRow);
    const nextCustomers = (customersRes.data ?? []).map(mapCustomerRow).sort((left, right) => (
      left.name.localeCompare(right.name)
    ));
    const nextCustomerContacts = (customerContactsRes.data ?? []).map(mapCustomerContactRow);
    const nextProjectMembers = (projectMembersRes.data ?? []).map(mapProjectMemberRow);
    const nextProjectActivity = (projectActivityRes.data ?? []).map(mapProjectActivityRow);
    const nextTrackedProjectIds = get().trackedProjectIds;
    const activeProjectIds = new Set(nextProjects.filter((project) => !project.archived).map((project) => project.id));
    const activeAssigneeIds = new Set(assignees.filter((assignee) => assignee.isActive).map((assignee) => assignee.id));
    const activeGroupIds = new Set(memberGroups.map((group) => group.id));

    if (get().dataRequestId !== requestId) return;

    set((state) => {
      const boardScope = state.boardScope?.workspaceId === workspaceId ? state.boardScope : null;
      const nextTasks = mergeWindowLoad(state.tasks, taskRows.map(mapTaskRow), boardScope);
      const keptTaskIds = nextTasks.length === taskRows.length
        ? nextTaskIds
        : new Set(nextTasks.map((task) => task.id));
      return {
        tasks: nextTasks,
        taskCommentCounts: Object.fromEntries(
          Object.entries(state.taskCommentCounts).filter(([taskId]) => keptTaskIds.has(taskId)),
        ),
        milestones: (milestonesRes.data ?? []).map(mapMilestoneRow),
        timeOff: nextTimeOff,
        projects: nextProjects,
        trackedProjectIds: nextTrackedProjectIds,
        customers: nextCustomers,
        customerContacts: nextCustomerContacts,
        assignees,
        projectMembers: nextProjectMembers,
        projectActivity: nextProjectActivity,
        memberGroups,
        memberGroupAssignments,
        statuses: (statusesRes.data ?? []).map(mapStatusRow),
        taskTypes: (taskTypesRes.data ?? []).map(mapTaskTypeRow),
        tags: (tagsRes.data ?? []).map(mapTagRow),
        loadedRange: { start, end, viewMode, workspaceId },
        filters: {
          ...state.filters,
          projectIds: state.filters.projectIds.filter((id) => activeProjectIds.has(id)),
          assigneeIds: state.filters.assigneeIds.filter((id) => activeAssigneeIds.has(id)),
          groupIds: state.filters.groupIds.filter((id) => activeGroupIds.has(id)),
        },
        loading: false,
      };
    });

    fetchTaskCommentCounts(workspaceId, taskRows.map((row) => row.id))
      .then((commentCountsRes) => {
        if (get().dataRequestId !== requestId) return;
        if ('error' in commentCountsRes) {
          console.error(commentCountsRes.error);
          return;
        }
        get().upsertTaskCommentCounts(commentCountsRes.data);
      })
      .catch((error) => {
        console.error(error);
      });

    // Counts могут приходить позднее: это тяжелый запрос и не должен тормозить initial render.
    if (shouldFetchCounts) {
      countsPromise
        .then((countsRes) => {
          if (get().dataRequestId !== requestId) return;
          if (countsRes.error) {
            console.error(countsRes.error);
            return;
          }
          const totals = mapAssigneeTaskCounts(
            (countsRes.data as AssigneeUniqueTaskCountRow[] | null | undefined) ?? [],
          );
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

  loadBoardTasks: async (workspaceId) => {
    const { workspaceId: activeWorkspaceId, statuses } = get();
    // The scope is built from the workspace's statuses, so it needs them loaded.
    if (activeWorkspaceId !== workspaceId || statuses.length === 0) return;

    const requestId = ++boardRequestSeq;
    const scope = buildBoardScope(workspaceId, statuses, new Date());
    // Claim the scope before fetching: realtime events arriving meanwhile are
    // then kept rather than dropped as "outside every scope".
    set({ boardScope: scope });

    const result = await fetchBoardTasks(scope);
    if (requestId !== boardRequestSeq || get().workspaceId !== workspaceId) return;
    if ('error' in result) {
      console.error(result.error);
      return;
    }

    const knownIds = new Set(get().tasks.map((task) => task.id));
    set((state) => ({
      tasks: mergeBoardLoad(state.tasks, result.data, { window: state.loadedRange, board: scope }),
    }));

    const newIds = result.data.map((task) => task.id).filter((id) => !knownIds.has(id));
    if (newIds.length > 0) {
      void get().refreshTaskCommentCounts(workspaceId, newIds);
    }
  },

  releaseBoardScope: () => {
    boardRequestSeq += 1;
    if (!get().boardScope) return;
    set((state) => {
      const tasks = pruneToWindow(state.tasks, state.loadedRange);
      if (tasks === state.tasks) return { boardScope: null };
      const keptIds = new Set(tasks.map((task) => task.id));
      return {
        boardScope: null,
        tasks,
        taskCommentCounts: Object.fromEntries(
          Object.entries(state.taskCommentCounts).filter(([taskId]) => keptIds.has(taskId)),
        ),
        selectedTaskId: state.selectedTaskId && keptIds.has(state.selectedTaskId) ? state.selectedTaskId : null,
      };
    });
  },

  refreshAssignees: async () => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return;

    const { data, error } = await supabase
      .from('assignees')
      .select('id, workspace_id, name, user_id, is_active, email, phone, color')
      .eq('workspace_id', workspaceId);

    if (error) {
      console.error(error);
      return;
    }

    const adminUserId = await getAdminUserId();

    const taskAssigneeIds = new Set(
      get().tasks.flatMap((task) => task.assigneeIds),
    );

    const assignees = ((data ?? []) as AssigneeRow[])
      .filter((row) => {
        if (adminUserId && row.user_id === adminUserId) return false;
        return row.user_id !== null || taskAssigneeIds.has(row.id);
      })
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(mapAssigneeRow);

    await attachAssigneeProfiles(assignees);

    const activeAssigneeIds = new Set(assignees.filter((assignee) => assignee.isActive).map((assignee) => assignee.id));

    set((state) => ({
      assignees,
      filters: {
        ...state.filters,
        assigneeIds: state.filters.assigneeIds.filter((id) => activeAssigneeIds.has(id)),
      },
    }));
  },

  /**
   * Есть ли ещё в пространстве примеры, которыми оно засеяно при создании.
   * Дешёвый count-запрос: сами строки-примеры ничем не отличаются от обычных и
   * в модель задач не тянутся — клиенту нужен только факт.
   */
  refreshSampleDataFlag: async (workspaceId) => {
    const { count, error } = await supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('is_sample', true);

    if (error) {
      console.error(error);
      return;
    }
    if (get().workspaceId && get().workspaceId !== workspaceId) return;
    set({ hasSampleData: (count ?? 0) > 0 });
  },

  clearSampleData: async (workspaceId) => {
    const { error } = await supabase.rpc('clear_workspace_sample_data', {
      workspace_id: workspaceId,
    });
    if (error) {
      console.error(error);
      return { error: error.message };
    }

    // Примеры удалены прямо в БД, минуя стор. Сбрасываем отметку о загруженном
    // окне — иначе loadWorkspaceData решит, что данные уже актуальны, выйдет
    // сразу, и удалённые задачи останутся висеть на экране.
    set({ hasSampleData: false, loadedRange: null });
    await get().loadWorkspaceData(workspaceId);
    return {};
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

  fetchAssigneeTaskCounts: async ({ workspaceId, startDate, endDate }) => {
    const { data, error } = await supabase.rpc('assignee_unique_task_counts', {
      p_workspace_id: workspaceId,
      p_start_date: startDate,
      p_end_date: endDate,
    });
    if (error) {
      return {
        counts: {},
        date: startDate,
        error: error.message,
      };
    }

    const counts = mapAssigneeTaskCounts((data ?? []) as AssigneeUniqueTaskCountRow[]);
    if (get().workspaceId === workspaceId) {
      set({
        assigneeTaskCounts: counts,
        assigneeCountsDate: startDate,
        assigneeCountsWorkspaceId: workspaceId,
      });
    }
    return {
      counts,
      date: startDate,
    };
  },

  fetchMemberGroups: async (workspaceId) => {
    const { data, error } = await supabase
      .from('member_groups')
      .select('id, name')
      .eq('workspace_id', workspaceId)
      .order('name', { ascending: true });

    if (error) {
      return { groups: [], error: error.message };
    }

    return {
      groups: (data ?? []).map((row) => ({
        id: (row as MemberGroupRow).id,
        name: (row as MemberGroupRow).name,
      })),
    };
  },

  fetchGroupMembers: async (workspaceId, groupId) => {
    const { data, error } = await supabase
      .from('workspace_members')
      .select('user_id, role, profiles(email, display_name)')
      .eq('workspace_id', workspaceId)
      .eq('group_id', groupId);

    if (error) {
      return { members: [], error: error.message };
    }

    const members = ((data ?? []) as unknown as WorkspaceMemberWithProfileRow[]).map((row) => ({
      userId: row.user_id,
      role: row.role,
      email: row.profiles?.email ?? '',
      displayName: row.profiles?.display_name ?? null,
    }));
    members.sort((left, right) => {
      const leftValue = (left.displayName || left.email).toLowerCase();
      const rightValue = (right.displayName || right.email).toLowerCase();
      return leftValue.localeCompare(rightValue);
    });

    return { members };
  },

  createMemberGroup: async (workspaceId, name) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return { error: 'Group name is required.' };
    }

    const { data, error } = await supabase
      .from('member_groups')
      .insert({ workspace_id: workspaceId, name: trimmedName })
      .select('id')
      .single();

    if (error || !data) {
      return { error: error?.message ?? 'Failed to create group.' };
    }

    await get().refreshMemberGroups();
    const authState = useAuthStore.getState();
    const { actorUserId, actorLabel } = buildWorkspaceMemberActivityActorSnapshot({
      userId: authState.user?.id,
      displayName: authState.profileDisplayName,
      email: authState.user?.email,
    });
    const logResult = await recordWorkspaceMemberActivity({
      workspaceId,
      action: 'group_created',
      actorUserId,
      actorLabel,
      details: {
        groupName: trimmedName,
      },
    });
    if (logResult.error) {
      console.error(logResult.error);
    }
    return { groupId: (data as { id: string }).id };
  },

  updateMemberGroup: async (workspaceId, groupId, name) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return { error: 'Group name is required.' };
    }
    const currentGroup = get().memberGroups.find((group) => group.id === groupId) ?? null;

    const { error } = await supabase
      .from('member_groups')
      .update({ name: trimmedName })
      .eq('id', groupId)
      .eq('workspace_id', workspaceId);

    if (error) {
      return { error: error.message };
    }

    await get().refreshMemberGroups();
    if (currentGroup && currentGroup.name !== trimmedName) {
      const authState = useAuthStore.getState();
      const { actorUserId, actorLabel } = buildWorkspaceMemberActivityActorSnapshot({
        userId: authState.user?.id,
        displayName: authState.profileDisplayName,
        email: authState.user?.email,
      });
      const logResult = await recordWorkspaceMemberActivity({
        workspaceId,
        action: 'group_renamed',
        actorUserId,
        actorLabel,
        details: {
          previousGroupName: currentGroup.name,
          nextGroupName: trimmedName,
        },
      });
      if (logResult.error) {
        console.error(logResult.error);
      }
    }
    return {};
  },

  deleteMemberGroup: async (workspaceId, groupId) => {
    const currentGroup = get().memberGroups.find((group) => group.id === groupId) ?? null;

    // Clear group_id on affected members before deleting the group (safety net
    // in case the DB-level ON DELETE SET NULL (group_id) clause is not yet applied).
    await supabase
      .from('workspace_members')
      .update({ group_id: null })
      .eq('workspace_id', workspaceId)
      .eq('group_id', groupId);

    const { error } = await supabase
      .from('member_groups')
      .delete()
      .eq('id', groupId)
      .eq('workspace_id', workspaceId);

    if (error) {
      return { error: error.message };
    }

    await get().refreshMemberGroups();
    if (currentGroup) {
      const authState = useAuthStore.getState();
      const { actorUserId, actorLabel } = buildWorkspaceMemberActivityActorSnapshot({
        userId: authState.user?.id,
        displayName: authState.profileDisplayName,
        email: authState.user?.email,
      });
      const logResult = await recordWorkspaceMemberActivity({
        workspaceId,
        action: 'group_deleted',
        actorUserId,
        actorLabel,
        details: {
          groupName: currentGroup.name,
        },
      });
      if (logResult.error) {
        console.error(logResult.error);
      }
    }
    return {};
  },
});
