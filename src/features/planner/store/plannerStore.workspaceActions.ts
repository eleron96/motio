import { addYears, format, parseISO } from 'date-fns';
import { supabase } from '@/shared/lib/supabaseClient';
import { getAdminUserId } from '@/shared/lib/adminConfig';
import { useAuthStore } from '@/features/auth/store/authStore';
import { mapTaskRow, normalizeAssigneeIds } from '@/shared/domain/taskRowMapper';
import { fetchTaskCommentCountsInWindow } from '@/infrastructure/tasks/taskCommentsRepository';
import { applyStarterTemplatePayload } from '@/infrastructure/workspace/starterTemplateRepository';
import { buildStarterTemplatePayloadFor } from '@/features/workspace/lib/starterTemplates';
import { deferTaskRowIfWriting } from '@/features/planner/store/plannerStore.pendingWrites';
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
  planTaskWindowLoad,
  type LoadedTaskWindow,
  MemberGroupRow,
  ProjectTrackingRow,
  SupabaseResult,
  TaskRow,
  TimeOffRow,
} from '@/features/planner/store/plannerStore.helpers';
import type { Assignee, Task } from '@/features/planner/types/planner';
import { getTimeOffMotifId, type TimeOffMotifId } from '@/features/planner/lib/timeOffMotifs';
import { keepTimeOffIfSame } from '@/features/planner/lib/timeOff';
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
  | 'applyStarterTemplate'
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

type AssigneeProfileBits = { avatar: string | null; timeOffMotif: TimeOffMotifId };
type AssigneeProfileRow = { id?: unknown; avatar_url?: unknown; preferences?: unknown };

// Narrow the value HERE and never keep a teammate's raw preferences object:
// the row also carries their digest and push settings, which this client has
// no business holding on to.
const readAssigneeProfileBits = (row: AssigneeProfileRow): AssigneeProfileBits => ({
  avatar: typeof row.avatar_url === 'string' && row.avatar_url ? row.avatar_url : null,
  timeOffMotif: getTimeOffMotifId(row.preferences as Record<string, unknown> | null | undefined),
});

const withAssigneeProfile = (assignee: Assignee, bits: AssigneeProfileBits | undefined): Assignee => {
  if (!bits) return assignee;
  return {
    ...assignee,
    ...(bits.avatar ? { avatar: bits.avatar } : {}),
    timeOffMotif: bits.timeOffMotif,
  };
};

// The assignees table has no FK to profiles. Current members' avatar and
// time-off motif come embedded in the workspace_members query of the same
// batch; only people who left the workspace but still have tasks are looked
// up afterwards. Best-effort: on error they keep their initials monogram and
// the default motif.
const fetchAssigneeProfiles = async (userIds: string[]): Promise<Map<string, AssigneeProfileBits>> => {
  const bitsByUserId = new Map<string, AssigneeProfileBits>();
  if (userIds.length === 0) return bitsByUserId;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, avatar_url, preferences')
    .in('id', userIds);
  if (error || !data) return bitsByUserId;
  for (const row of data as AssigneeProfileRow[]) {
    if (typeof row.id !== 'string') continue;
    bitsByUserId.set(row.id, readAssigneeProfileBits(row));
  }
  return bitsByUserId;
};

// Guards board loads against stale responses: a newer load or a release bumps
// it, and an in-flight response with an older value is ignored.
let boardRequestSeq = 0;

const WINDOW_TASK_COLUMNS = [
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
].join(',');

// The task-window load in flight (full or shift). Every window load bumps
// windowLoadSeq; a shift whose number is no longer current drops its answer.
// Full loads are guarded by dataRequestId, like everything they start.
let windowLoadSeq = 0;
let activeWindowLoad: {
  seq: number;
  kind: 'full' | 'shift';
  window: LoadedTaskWindow;
  promise: Promise<void>;
} | null = null;

const selectWindowTasks = ({ workspaceId, start, end }: LoadedTaskWindow) => supabase
  .from('tasks')
  .select(WINDOW_TASK_COLUMNS)
  .eq('workspace_id', workspaceId)
  .gte('end_date', start)
  .lte('start_date', end);

// Time off IS windowed like tasks (unlike milestones): absences accumulate
// linearly with wall-clock time and nothing ever archives them, so an
// unwindowed query would grow heavier every year on the boot path.
const selectWindowTimeOff = ({ workspaceId, start, end }: LoadedTaskWindow) => supabase
  .from('time_off')
  .select('id, workspace_id, assignee_id, start_date, end_date, note')
  .eq('workspace_id', workspaceId)
  .gte('end_date', start)
  .lte('start_date', end);

/**
 * Window rows as they enter the cache: a task hidden while its deletion can
 * still be undone stays hidden, and a task with its own write in flight keeps
 * the value on screen (the row is held back and applied after the write if it
 * is newer — plannerStore.pendingWrites).
 */
const mergeWindowRows = (
  state: PlannerStore,
  rows: TaskRow[],
  board: PlannerStore['boardScope'],
) => {
  const pendingDeleteIds = new Set(state.pendingDeleteTaskIds);
  const existingById = new Map(state.tasks.map((task) => [task.id, task]));
  const incoming: Task[] = [];
  rows.forEach((row) => {
    if (pendingDeleteIds.has(row.id)) return;
    const task = mapTaskRow(row);
    incoming.push(deferTaskRowIfWriting(task) ? existingById.get(task.id) ?? task : task);
  });
  return mergeWindowLoad(state.tasks, incoming, board);
};

/**
 * Counts for the tasks kept in the cache: tasks of the new window get theirs
 * from `windowCounts` (a task without comments is absent there, so zero);
 * the rest keep what they had. `windowCounts` null = not known yet.
 */
const mergeWindowCommentCounts = (
  previous: Record<string, number>,
  keptTaskIds: ReadonlySet<string>,
  windowTaskIds: readonly string[],
  windowCounts: Record<string, number> | null,
) => {
  const next = Object.fromEntries(
    Object.entries(previous).filter(([taskId]) => keptTaskIds.has(taskId)),
  );
  if (windowCounts) {
    windowTaskIds.forEach((taskId) => {
      next[taskId] = windowCounts[taskId] ?? 0;
    });
  }
  return next;
};

/**
 * The timeline has moved past the loaded window (scrolled toward its edge, or
 * a jump inside the same workspace): reload only the windowed data — tasks,
 * time off, comment counts — around the new date. Workspace catalogues stay,
 * nothing shows a loading state, and the open or peeked task stays open even
 * if it falls outside the new window.
 */
const shiftTaskWindow = async (
  set: PlannerSetState,
  get: PlannerGetState,
  window: LoadedTaskWindow,
  seq: number,
) => {
  const requestId = get().dataRequestId;
  const [tasksRes, timeOffRes, commentCountsRes] = await Promise.all([
    selectWindowTasks(window),
    selectWindowTimeOff(window),
    fetchTaskCommentCountsInWindow(window.workspaceId, window.start, window.end),
  ]);
  if (seq !== windowLoadSeq || get().dataRequestId !== requestId || get().workspaceId !== window.workspaceId) {
    return;
  }
  if (tasksRes.error) {
    // The old window stays; the next move of the timeline asks again.
    console.error(tasksRes.error);
    return;
  }
  if (timeOffRes.error) console.error(timeOffRes.error);
  if ('error' in commentCountsRes) console.error(commentCountsRes.error);

  const taskRows = (tasksRes.data ?? []) as unknown as TaskRow[];
  const windowCounts = 'error' in commentCountsRes ? null : commentCountsRes.data;
  set((state) => {
    const board = state.boardScope?.workspaceId === window.workspaceId ? state.boardScope : null;
    const merged = mergeWindowRows(state, taskRows, board);
    const mergedIds = new Set(merged.map((task) => task.id));
    const heldTasks = [state.selectedTaskId, state.peekedTaskId]
      .filter((taskId): taskId is string => Boolean(taskId) && !mergedIds.has(taskId as string))
      .map((taskId) => state.tasks.find((task) => task.id === taskId))
      .filter((task): task is Task => Boolean(task));
    const tasks = heldTasks.length > 0 ? [...merged, ...heldTasks] : merged;
    const keptIds = heldTasks.length > 0 ? new Set(tasks.map((task) => task.id)) : mergedIds;
    return {
      tasks,
      taskCommentCounts: mergeWindowCommentCounts(
        state.taskCommentCounts,
        keptIds,
        taskRows.map((row) => row.id),
        windowCounts,
      ),
      timeOff: timeOffRes.error
        ? state.timeOff
        : keepTimeOffIfSame(state.timeOff, ((timeOffRes.data ?? []) as unknown as TimeOffRow[]).map(mapTimeOffRow)),
      loadedRange: window,
      ...(state.highlightedTaskId && !keptIds.has(state.highlightedTaskId)
        ? { highlightedTaskId: null, highlightedTaskRowAssigneeId: null }
        : {}),
    };
  });
  if (!windowCounts) {
    void get().refreshTaskCommentCounts(window.workspaceId, taskRows.map((row) => row.id));
  }
};

const loadFullWorkspaceData = async (
  set: PlannerSetState,
  get: PlannerGetState,
  window: LoadedTaskWindow,
) => {
  const { workspaceId, start, end } = window;
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
  // The signed-in user comes from the auth store: supabase.auth.getUser()
  // would hold the shared auth lock for a network round-trip, and every
  // query of this batch waits on that lock for its token.
  const trackedPromise: Promise<SupabaseResult<unknown[] | null>> = (async () => {
    const userId = useAuthStore.getState().user?.id ?? null;
    if (!userId) return { data: [], error: null };
    return supabase
      .from('project_tracking')
      .select('project_id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId);
  })();

  const adminUserIdPromise = getAdminUserId();

  const tasksQuery = selectWindowTasks(window);
  // Comment counts go out with the tasks (same window), so the badges arrive
  // together with the bars instead of a round-trip later.
  const commentCountsPromise = fetchTaskCommentCountsInWindow(workspaceId, start, end);

  const projectsQuery = supabase
    .from('projects')
    .select('id, workspace_id, name, code, color, archived, customer_id, owner_group_id, status')
    .eq('workspace_id', workspaceId);
  const customersQuery = supabase
    .from('customers')
    .select('id, workspace_id, name, industry')
    .eq('workspace_id', workspaceId);
  const customerContactsQuery = supabase
    .from('customer_contacts')
    .select('id, workspace_id, customer_id, name, role, email, phone, position, company, tag')
    .eq('workspace_id', workspaceId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  const assigneesQuery = supabase
    .from('assignees')
    .select('id, workspace_id, name, user_id, is_active, email, phone, color')
    .eq('workspace_id', workspaceId);
  const projectMembersQuery = supabase
    .from('project_members')
    .select('id, workspace_id, project_id, assignee_id, role, position, tag, external_name, external_company, external_email, external_phone')
    .eq('workspace_id', workspaceId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  const projectActivityQuery = supabase
    .from('project_activity')
    .select('id, workspace_id, project_id, author_id, author_display_name, kind, content, created_at, updated_at, pinned')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  const memberGroupsQuery = supabase
    .from('member_groups')
    .select('id, name')
    .eq('workspace_id', workspaceId);
  const memberAssignmentsQuery = supabase
    .from('workspace_members')
    .select('user_id, group_id, profiles(id, avatar_url, preferences)')
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
  // must show far-future dates that lie outside the ±5-month task window.
  const milestonesQuery = supabase
    .from('milestones')
    .select('id, workspace_id, title, project_id, date, note, status_override, include_in_workload')
    .eq('workspace_id', workspaceId);
  const timeOffQuery = selectWindowTimeOff(window);

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
    commentCountsRes,
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
    commentCountsPromise,
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
  if ('error' in commentCountsRes) console.error(commentCountsRes.error);
  const windowCommentCounts = 'error' in commentCountsRes ? null : commentCountsRes.data;
  const assigneeRows = (assigneesRes.data ?? []) as AssigneeRow[];
  const taskAssigneeIds = new Set(
    taskRows.flatMap((row) => normalizeAssigneeIds(row.assignee_ids, row.assignee_id)),
  );

  // Anti-stale guard: если пользователь переключил workspace, этот ответ игнорируем.
  if (get().dataRequestId !== requestId) return;

  const memberProfileBits = new Map<string, AssigneeProfileBits>();
  for (const row of (memberAssignmentsRes.data ?? []) as unknown as Array<{ user_id: string; profiles?: AssigneeProfileRow | null }>) {
    if (row.profiles) memberProfileBits.set(row.user_id, readAssigneeProfileBits(row.profiles));
  }
  const assignees = assigneeRows
    .filter((row) => {
      if (adminUserId && row.user_id === adminUserId) return false;
      return row.user_id !== null || taskAssigneeIds.has(row.id);
    })
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(mapAssigneeRow)
    .map((assignee) => (
      assignee.userId ? withAssigneeProfile(assignee, memberProfileBits.get(assignee.userId)) : assignee
    ));
  const formerMemberUserIds = Array.from(new Set(
    assignees
      .map((assignee) => assignee.userId)
      .filter((userId): userId is string => Boolean(userId) && !memberProfileBits.has(userId as string)),
  ));

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
    const nextTasks = mergeWindowRows(state, taskRows, boardScope);
    const keptTaskIds = new Set(nextTasks.map((task) => task.id));
    return {
      tasks: nextTasks,
      taskCommentCounts: mergeWindowCommentCounts(
        state.taskCommentCounts,
        keptTaskIds,
        taskRows.map((row) => row.id),
        windowCommentCounts,
      ),
      milestones: (milestonesRes.data ?? []).map(mapMilestoneRow),
      timeOff: keepTimeOffIfSame(state.timeOff, nextTimeOff),
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
      loadedRange: window,
      filters: {
        ...state.filters,
        projectIds: state.filters.projectIds.filter((id) => activeProjectIds.has(id)),
        assigneeIds: state.filters.assigneeIds.filter((id) => activeAssigneeIds.has(id)),
        groupIds: state.filters.groupIds.filter((id) => activeGroupIds.has(id)),
      },
      loading: false,
    };
  });

  if (formerMemberUserIds.length > 0) {
    void fetchAssigneeProfiles(formerMemberUserIds).then((bitsByUserId) => {
      if (get().dataRequestId !== requestId || bitsByUserId.size === 0) return;
      set((state) => ({
        assignees: state.assignees.map((assignee) => (
          assignee.userId ? withAssigneeProfile(assignee, bitsByUserId.get(assignee.userId)) : assignee
        )),
      }));
    });
  }

  // Without the window counts (an older database, a failed call) fall back
  // to counting by task id after the fact, as before.
  if (!windowCommentCounts) {
    void get().refreshTaskCommentCounts(workspaceId, taskRows.map((row) => row.id));
  }

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
};


export const createWorkspaceActions = (
  set: PlannerSetState,
  get: PlannerGetState,
): WorkspaceActions => ({
  loadWorkspaceData: (workspaceId) => {
    const { currentDate, viewMode, loadedRange } = get();
    const request = { workspaceId, currentDate, viewMode };
    const inFlight = activeWindowLoad && activeWindowLoad.seq === windowLoadSeq ? activeWindowLoad : null;
    // A load already on its way with a window that serves this view: wait for it.
    if (inFlight && planTaskWindowLoad(inFlight.window, request) === 'reuse') {
      return inFlight.promise;
    }

    let plan = planTaskWindowLoad(loadedRange, request);
    // A full load in flight may be for another workspace and owns `loading`:
    // only another full load replaces it.
    if (inFlight?.kind === 'full') plan = 'full';
    if (plan === 'reuse') {
      // A shift in flight would swap in a window this view does not need.
      if (inFlight) windowLoadSeq += 1;
      return Promise.resolve();
    }

    const seq = ++windowLoadSeq;
    const window: LoadedTaskWindow = { ...buildTaskRange(currentDate, viewMode), viewMode, workspaceId };
    const promise = (plan === 'shift'
      ? shiftTaskWindow(set, get, window, seq)
      : loadFullWorkspaceData(set, get, window)
    ).finally(() => {
      if (activeWindowLoad?.seq === seq) activeWindowLoad = null;
    });
    activeWindowLoad = { seq, kind: plan, window, promise };
    return promise;
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

    const mappedAssignees = ((data ?? []) as AssigneeRow[])
      .filter((row) => {
        if (adminUserId && row.user_id === adminUserId) return false;
        return row.user_id !== null || taskAssigneeIds.has(row.id);
      })
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(mapAssigneeRow);

    const bitsByUserId = await fetchAssigneeProfiles(Array.from(new Set(
      mappedAssignees.map((assignee) => assignee.userId).filter((userId): userId is string => Boolean(userId)),
    )));
    const assignees = mappedAssignees.map((assignee) => (
      assignee.userId ? withAssigneeProfile(assignee, bitsByUserId.get(assignee.userId)) : assignee
    ));

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

  /**
   * Новое пространство начинается с шаблона, который выбрал его владелец.
   * Шаблон собирается здесь, в момент выбора, — поэтому тексты примеров на
   * языке интерфейса. База кладёт его одной транзакцией (0169), после чего
   * окно перечитывается целиком: справочники тоже стали другими.
   */
  applyStarterTemplate: async (workspaceId, templateId) => {
    const payload = buildStarterTemplatePayloadFor(templateId, new Date());
    if (!payload) return { error: 'Unknown template.' };

    const { error } = await applyStarterTemplatePayload(workspaceId, payload);
    if (error) {
      console.error({
        module: 'planner.store',
        action: 'applyStarterTemplate',
        workspaceId,
        result: 'error',
        message: error,
      });
      return { error };
    }

    useAuthStore.getState().markWorkspaceTemplateApplied(workspaceId);
    set({ loadedRange: null });
    await get().loadWorkspaceData(workspaceId);
    await get().refreshSampleDataFlag(workspaceId);
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
