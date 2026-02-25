import { addYears, format, parseISO } from 'date-fns';
import { supabase } from '@/shared/lib/supabaseClient';
import { getAdminUserId } from '@/shared/lib/adminConfig';
import { mapTaskRow, normalizeAssigneeIds } from '@/shared/domain/taskRowMapper';
import type {
  PlannerGetState,
  PlannerSetState,
  PlannerStore,
} from '@/features/planner/store/plannerStore.contract';
import {
  AssigneeRow,
  AssigneeUniqueTaskCountRow,
  buildTaskRange,
  isDateWithinRange,
  mapAssigneeRow,
  mapCustomerRow,
  mapMilestoneRow,
  mapProjectRow,
  mapStatusRow,
  mapTagRow,
  mapTaskTypeRow,
  MemberGroupAssignmentRow,
  MemberGroupRow,
  ProjectTrackingRow,
  SupabaseResult,
  TaskRow,
} from '@/features/planner/store/plannerStore.helpers';

type WorkspaceActions = Pick<
  PlannerStore,
  | 'loadWorkspaceData'
  | 'refreshAssignees'
  | 'refreshMemberGroups'
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

export const createWorkspaceActions = (
  set: PlannerSetState,
  get: PlannerGetState,
): WorkspaceActions => ({
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
    const workspaceChanged = Boolean(previousWorkspaceId && previousWorkspaceId !== workspaceId);
    const workspaceResetPatch = workspaceChanged
      ? { trackedProjectIds: [] as string[], timelineAttentionDate: null as string | null }
      : {};

    set({
      loading: true,
      error: null,
      workspaceId,
      selectedTaskId: null,
      highlightedTaskId: null,
      dataRequestId: requestId,
      ...workspaceResetPatch,
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

    // Не блокируем first paint: tracked-projects не критичны для первичной отрисовки.
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

    // Anti-stale guard: если пользователь переключил workspace, этот ответ игнорируем.
    if (get().dataRequestId !== requestId) return;

    const assignees = assigneeRows
      .filter((row) => {
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

    const adminUserId = await getAdminUserId();

    const taskAssigneeIds = new Set(
      get().tasks.flatMap((task) => task.assigneeIds),
    );

    const assignees = (data ?? [])
      .filter((row) => {
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

    const members = ((data ?? []) as WorkspaceMemberWithProfileRow[]).map((row) => ({
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
    return { groupId: (data as { id: string }).id };
  },

  updateMemberGroup: async (workspaceId, groupId, name) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return { error: 'Group name is required.' };
    }

    const { error } = await supabase
      .from('member_groups')
      .update({ name: trimmedName })
      .eq('id', groupId)
      .eq('workspace_id', workspaceId);

    if (error) {
      return { error: error.message };
    }

    await get().refreshMemberGroups();
    return {};
  },

  deleteMemberGroup: async (workspaceId, groupId) => {
    const { error } = await supabase
      .from('member_groups')
      .delete()
      .eq('id', groupId)
      .eq('workspace_id', workspaceId);

    if (error) {
      return { error: error.message };
    }

    await get().refreshMemberGroups();
    return {};
  },
});
