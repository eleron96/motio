import { supabase } from '@/shared/lib/supabaseClient';
import { getAdminUserId } from '@/shared/lib/adminConfig';
import { useAuthStore } from '@/features/auth/store/authStore';
import { applyStarterTemplatePayload } from '@/infrastructure/workspace/starterTemplateRepository';
import { buildStarterTemplatePayloadFor } from '@/features/workspace/lib/starterTemplates';
import type {
  PlannerGetState,
  PlannerSetState,
  PlannerStore,
} from '@/features/planner/store/plannerStore.contract';
import {
  AssigneeRow,
  AssigneeUniqueTaskCountRow,
  mapAssigneeRow,
  MemberGroupAssignmentRow,
  MemberGroupRow,
} from '@/features/planner/store/plannerStore.helpers';
import { recordWorkspaceMemberActivity } from '@/infrastructure/workspace/memberActivityRepository';
import { buildWorkspaceMemberActivityActorSnapshot } from '@/shared/domain/workspaceMemberActivity';
import { buildBoardScope, mergeBoardLoad, pruneToWindow } from '@/shared/domain/taskLoadScopes';
import { fetchBoardTasks } from '@/infrastructure/tasks/boardTasksRepository';

import {
  fetchAssigneeProfiles,
  mapAssigneeTaskCounts,
  type WorkspaceMemberWithProfileRow,
  withAssigneeProfile,
} from '@/features/planner/store/plannerStore.workspaceLoad';
import { loadTaskWindow } from '@/features/planner/store/plannerStore.taskWindow';

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

let boardRequestSeq = 0;

export const createWorkspaceActions = (
  set: PlannerSetState,
  get: PlannerGetState,
): WorkspaceActions => ({
  loadWorkspaceData: (workspaceId) => loadTaskWindow(set, get, workspaceId),

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
