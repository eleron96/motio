import { addYears, format, parseISO } from 'date-fns';
import { supabase } from '@/shared/lib/supabaseClient';
import { getAdminUserId } from '@/shared/lib/adminConfig';
import { useAuthStore } from '@/features/auth/store/authStore';
import { normalizeAssigneeIds } from '@/shared/domain/taskRowMapper';
import { fetchTaskCommentCountsInWindow } from '@/infrastructure/tasks/taskCommentsRepository';
import type {
  PlannerGetState,
  PlannerSetState,
  PlannerStore,
} from '@/features/planner/store/plannerStore.contract';
import {
  AssigneeRow,
  AssigneeUniqueTaskCountRow,
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
  type LoadedTaskWindow,
  MemberGroupRow,
  ProjectTrackingRow,
  SupabaseResult,
  TaskRow,
  TimeOffRow,
} from '@/features/planner/store/plannerStore.helpers';
import type { Assignee } from '@/features/planner/types/planner';
import { getTimeOffMotifId, type TimeOffMotifId } from '@/features/planner/lib/timeOffMotifs';
import { keepTimeOffIfSame } from '@/features/planner/lib/timeOff';
import {
  mergeWindowCommentCounts,
  mergeWindowRows,
  selectWindowTasks,
  selectWindowTimeOff,
} from '@/features/planner/store/plannerStore.windowRows';

// Loading a whole workspace into the planner (on open and on a switch), and the
// people's profile bits it brings along.

export type WorkspaceMemberWithProfileRow = {
  user_id: string;
  role: 'admin' | 'editor' | 'viewer';
  profiles: {
    email: string;
    display_name: string | null;
  } | null;
};

export const mapAssigneeTaskCounts = (rows: AssigneeUniqueTaskCountRow[] | null | undefined) => {
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

export const withAssigneeProfile = (assignee: Assignee, bits: AssigneeProfileBits | undefined): Assignee => {
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
export const fetchAssigneeProfiles = async (userIds: string[]): Promise<Map<string, AssigneeProfileBits>> => {
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

export const loadFullWorkspaceData = async (
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
