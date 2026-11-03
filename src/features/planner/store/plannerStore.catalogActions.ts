import { supabase } from '@/shared/lib/supabaseClient';
import {
  buildWorkspaceTemplateFromCatalog,
  diffWorkspaceTemplate,
  normalizeWorkspaceTemplate,
  type WorkspaceTemplate,
} from '@/shared/domain/workspaceTemplate';
import { splitStatusLabel } from '@/shared/lib/statusLabels';
import { useAuthStore } from '@/features/auth/store/authStore';
import type {
  PlannerGetState,
  PlannerSetState,
  PlannerStore,
} from '@/features/planner/store/plannerStore.contract';
import {
  AssigneeRow,
  mapAssigneeRow,
  mapStatusRow,
  mapTagRow,
  mapTaskTypeRow,
  StatusRow,
  TagRow,
  TaskTypeRow,
} from '@/features/planner/store/plannerStore.helpers';
import { recordWorkspaceMemberActivity } from '@/infrastructure/workspace/memberActivityRepository';
import {
  buildWorkspaceMemberActivityActorSnapshot,
  buildWorkspaceMemberActivityTargetLabel,
} from '@/shared/domain/workspaceMemberActivity';
import { DEFAULT_STATUS_COLOR } from '@/shared/lib/colors';
import { starterCatalogAsWorkspaceTemplate } from '@/shared/domain/starterTemplate';
import { findStarterTemplate } from '@/features/workspace/lib/starterTemplates';
import {
  emptyMutationResult,
  getCurrentUserId,
} from '@/features/planner/store/plannerStore.mutationHelpers';

// Workspace catalogs: people, statuses, task types, tags, and the workspace
// template that bundles them.
type CatalogActions = Pick<
  PlannerStore,
  | 'addAssignee'
  | 'updateAssignee'
  | 'setAssigneeColor'
  | 'deleteAssignee'
  | 'addStatus'
  | 'updateStatus'
  | 'deleteStatus'
  | 'addTaskType'
  | 'updateTaskType'
  | 'deleteTaskType'
  | 'addTag'
  | 'updateTag'
  | 'deleteTag'
  | 'loadWorkspaceTemplate'
  | 'saveWorkspaceTemplate'
  | 'applyWorkspaceTemplate'
>;

export const createCatalogActions = (
  set: PlannerSetState,
  get: PlannerGetState,
): CatalogActions => ({
  addAssignee: async (assignee) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return;

    const { data, error } = await supabase
      .from('assignees')
      .insert({
        workspace_id: workspaceId,
        name: assignee.name,
        is_active: assignee.isActive ?? true,
        email: assignee.email ?? null,
        phone: assignee.phone ?? null,
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
    if (!workspaceId) return { error: 'Workspace not selected.' };
    const currentAssignee = get().assignees.find((assignee) => assignee.id === id) ?? null;

    const payload: Record<string, unknown> = {};
    if ('name' in updates) payload.name = updates.name;
    if ('isActive' in updates) payload.is_active = updates.isActive;
    if ('email' in updates) payload.email = updates.email;
    if ('phone' in updates) payload.phone = updates.phone;
    if (Object.keys(payload).length === 0) return emptyMutationResult;

    const { data, error } = await supabase
      .from('assignees')
      .update(payload)
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select('*')
      .single();

    if (error || !data) {
      console.error(error);
      return { error: error?.message ?? 'Failed to update assignee.' };
    }

    const updated = mapAssigneeRow(data as AssigneeRow);
    set((state) => ({
      assignees: state.assignees.map((assignee) => (assignee.id === id ? updated : assignee)),
    }));

    if (currentAssignee && 'isActive' in updates && currentAssignee.isActive !== updated.isActive) {
      const authState = useAuthStore.getState();
      const { actorUserId, actorLabel } = buildWorkspaceMemberActivityActorSnapshot({
        userId: authState.user?.id,
        displayName: authState.profileDisplayName,
        email: authState.user?.email,
      });
      const logResult = await recordWorkspaceMemberActivity({
        workspaceId,
        action: 'member_status_changed',
        actorUserId,
        actorLabel,
        targetUserId: updated.userId ?? null,
        targetLabel: buildWorkspaceMemberActivityTargetLabel(updated.name, null),
        details: {
          previousStatus: currentAssignee.isActive ? 'active' : 'disabled',
          nextStatus: updated.isActive ? 'active' : 'disabled',
        },
      });
      if (logResult.error) {
        console.error(logResult.error);
      }
    }

    return emptyMutationResult;
  },

  setAssigneeColor: async (id, color) => {
    // Not part of updateAssignee: the colour goes through set_assignee_color()
    // (0135) so that a member without UPDATE on assignees — a viewer, or any
    // non-admin recolouring themselves — can still change their own colour
    // without gaining the right to rename or disable anybody.
    const { error } = await supabase.rpc('set_assignee_color', {
      p_assignee_id: id,
      p_color: color,
    });

    if (error) {
      console.error(error);
      return { error: error.message };
    }

    set((state) => ({
      assignees: state.assignees.map((assignee) => (
        assignee.id === id ? { ...assignee, color } : assignee
      )),
    }));

    return emptyMutationResult;
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

    // Поля isFinal/isCancelled взаимоисключающие: синхронизируем их в payload в одной точке.
    if ('isFinal' in updates) {
      const isFinal = Boolean(updates.isFinal);
      payload.is_final = isFinal;
      if (isFinal) payload.is_cancelled = false;
    }
    if ('isCancelled' in updates) {
      const isCancelled = Boolean(updates.isCancelled);
      payload.is_cancelled = isCancelled;
      if (isCancelled) payload.is_final = false;
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

  loadWorkspaceTemplate: async () => {
    const userResult = await getCurrentUserId();
    if (userResult.error) return { error: userResult.error };

    const { data, error } = await supabase
      .from('user_workspace_templates')
      .select('statuses, task_types, tags')
      .eq('user_id', userResult.userId)
      .maybeSingle();

    if (error) {
      return { error: error.message };
    }

    // Nothing saved is the usual state, not a failure: the dialog used to show
    // this as a red, untranslated "No template saved yet." to everyone.
    if (!data) {
      return { template: null };
    }

    return {
      template: normalizeWorkspaceTemplate(data),
    };
  },

  saveWorkspaceTemplate: async (template: WorkspaceTemplate) => {
    const userResult = await getCurrentUserId();
    if (userResult.error) return { error: userResult.error };

    const normalizedTemplate = buildWorkspaceTemplateFromCatalog({
      statuses: template.statuses.map((status) => ({
        name: status.name,
        emoji: status.emoji,
        color: status.color,
        isFinal: status.is_final,
        isCancelled: status.is_cancelled,
      })),
      taskTypes: template.taskTypes,
      tags: template.tags,
    });

    const { error } = await supabase
      .from('user_workspace_templates')
      .upsert({
        user_id: userResult.userId,
        statuses: normalizedTemplate.statuses,
        task_types: normalizedTemplate.taskTypes,
        tags: normalizedTemplate.tags,
      });

    if (error) return { error: error.message };

    return emptyMutationResult;
  },

  applyWorkspaceTemplate: async (source = 'own') => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return { error: 'Workspace not selected.' };

    let template: WorkspaceTemplate;
    if (source === 'own') {
      const templateResult = await get().loadWorkspaceTemplate();
      if (templateResult.error || !templateResult.template) {
        return { error: templateResult.error ?? 'No template saved yet.' };
      }
      template = templateResult.template;
    } else {
      // Built now, so the names come in the interface language of this moment.
      const starter = findStarterTemplate(source);
      if (!starter) return { error: 'Unknown template.' };
      template = starterCatalogAsWorkspaceTemplate(starter.build());
    }

    const diff = diffWorkspaceTemplate(template, {
      statuses: get().statuses,
      taskTypes: get().taskTypes,
      tags: get().tags,
    });

    if (diff.statuses.length > 0) {
      const { error } = await supabase
        .from('statuses')
        .insert(diff.statuses.map((status) => ({
          workspace_id: workspaceId,
          name: status.name.trim(),
          emoji: status.emoji ?? null,
          color: status.color ?? DEFAULT_STATUS_COLOR,
          is_final: !!status.is_final && !status.is_cancelled,
          is_cancelled: !!status.is_cancelled,
        })));
      if (error) return { error: error.message };
    }

    if (diff.taskTypes.length > 0) {
      const { error } = await supabase
        .from('task_types')
        .insert(diff.taskTypes.map((taskType) => ({
          workspace_id: workspaceId,
          name: taskType.name.trim(),
          icon: taskType.icon ?? null,
        })));
      if (error) return { error: error.message };
    }

    if (diff.tags.length > 0) {
      const { error } = await supabase
        .from('tags')
        .insert(diff.tags.map((tag) => ({
          workspace_id: workspaceId,
          name: tag.name.trim(),
          color: tag.color ?? DEFAULT_STATUS_COLOR,
        })));
      if (error) return { error: error.message };
    }

    const added = { statuses: diff.statuses.length, taskTypes: diff.taskTypes.length, tags: diff.tags.length };
    if (added.statuses === 0 && added.taskTypes === 0 && added.tags === 0) {
      return { added };
    }

    set({ loadedRange: null });
    await get().loadWorkspaceData(workspaceId);
    return { added };
  },
});
