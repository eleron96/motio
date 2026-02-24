import { supabase } from '@/shared/lib/supabaseClient';
import { splitStatusLabel } from '@/shared/lib/statusLabels';
import type {
  PlannerGetState,
  PlannerSetState,
  PlannerStore,
} from '@/features/planner/store/plannerStore.contract';
import {
  AssigneeRow,
  CustomerRow,
  mapAssigneeRow,
  mapCustomerRow,
  mapMilestoneRow,
  mapProjectRow,
  mapStatusRow,
  mapTagRow,
  mapTaskTypeRow,
  MilestoneRow,
  MutationResult,
  ProjectRow,
  StatusRow,
  TagRow,
  TaskTypeRow,
} from '@/features/planner/store/plannerStore.helpers';

type CatalogActions = Pick<
  PlannerStore,
  | 'addProject'
  | 'updateProject'
  | 'deleteProject'
  | 'toggleTrackedProject'
  | 'addCustomer'
  | 'updateCustomer'
  | 'deleteCustomer'
  | 'addAssignee'
  | 'updateAssignee'
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
  | 'addMilestone'
  | 'updateMilestone'
  | 'deleteMilestone'
>;

const emptyMutationResult: MutationResult = {};

export const createCatalogActions = (
  set: PlannerSetState,
  get: PlannerGetState,
): CatalogActions => ({
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
    if (!workspaceId) return { error: 'Workspace not selected.' };

    const payload: Record<string, unknown> = {};
    if ('name' in updates) payload.name = updates.name;
    if ('code' in updates) payload.code = updates.code;
    if ('color' in updates) payload.color = updates.color;
    if ('archived' in updates) payload.archived = updates.archived;
    if ('customerId' in updates) payload.customer_id = updates.customerId;
    if (Object.keys(payload).length === 0) return emptyMutationResult;

    const { data, error } = await supabase
      .from('projects')
      .update(payload)
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select('*')
      .single();

    if (error || !data) {
      console.error(error);
      return { error: error?.message ?? 'Failed to update project.' };
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

    return emptyMutationResult;
  },

  deleteProject: async (id) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return { error: 'Workspace not selected.' };

    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id)
      .eq('workspace_id', workspaceId);

    if (error) {
      console.error(error);
      return { error: error.message };
    }

    set((state) => ({
      projects: state.projects.filter((project) => project.id !== id),
      tasks: state.tasks.map((task) => (task.projectId === id ? { ...task, projectId: null } : task)),
      trackedProjectIds: state.trackedProjectIds.filter((projectId) => projectId !== id),
      filters: {
        ...state.filters,
        projectIds: state.filters.projectIds.filter((projectId) => projectId !== id),
      },
    }));

    return emptyMutationResult;
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
    if (!workspaceId) return { error: 'Workspace not selected.' };

    const payload: Record<string, unknown> = {};
    if ('name' in updates) payload.name = updates.name;
    if (Object.keys(payload).length === 0) return emptyMutationResult;

    const { data, error } = await supabase
      .from('customers')
      .update(payload)
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select('*')
      .single();

    if (error || !data) {
      console.error(error);
      return { error: error?.message ?? 'Failed to update customer.' };
    }

    const updated = mapCustomerRow(data as CustomerRow);
    set((state) => ({
      customers: state.customers
        .map((customer) => (customer.id === id ? updated : customer))
        .sort((left, right) => left.name.localeCompare(right.name)),
    }));

    return emptyMutationResult;
  },

  deleteCustomer: async (id) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return { error: 'Workspace not selected.' };

    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', id)
      .eq('workspace_id', workspaceId);

    if (error) {
      console.error(error);
      return { error: error.message };
    }

    set((state) => ({
      customers: state.customers.filter((customer) => customer.id !== id),
      projects: state.projects.map((project) => (
        project.customerId === id ? { ...project, customerId: null } : project
      )),
    }));

    return emptyMutationResult;
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

  addMilestone: async (milestone) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return { error: 'Workspace not selected.' };

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
      return { error: error?.message ?? 'Failed to add milestone.' };
    }

    set((state) => ({ milestones: [...state.milestones, mapMilestoneRow(data as MilestoneRow)] }));
    return emptyMutationResult;
  },

  updateMilestone: async (id, updates) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return { error: 'Workspace not selected.' };

    const payload: Record<string, unknown> = {};
    if ('title' in updates) payload.title = updates.title;
    if ('projectId' in updates) payload.project_id = updates.projectId;
    if ('date' in updates) payload.date = updates.date;
    if (Object.keys(payload).length === 0) return emptyMutationResult;

    const { data, error } = await supabase
      .from('milestones')
      .update(payload)
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select('*')
      .single();

    if (error || !data) {
      console.error(error);
      return { error: error?.message ?? 'Failed to update milestone.' };
    }

    const updated = mapMilestoneRow(data as MilestoneRow);
    set((state) => ({
      milestones: state.milestones.map((item) => (item.id === id ? updated : item)),
    }));

    return emptyMutationResult;
  },

  deleteMilestone: async (id) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return { error: 'Workspace not selected.' };

    const { error } = await supabase
      .from('milestones')
      .delete()
      .eq('id', id)
      .eq('workspace_id', workspaceId);

    if (error) {
      console.error(error);
      return { error: error.message };
    }

    set((state) => ({
      milestones: state.milestones.filter((item) => item.id !== id),
    }));

    return emptyMutationResult;
  },
});
