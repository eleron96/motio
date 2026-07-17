import { supabase } from '@/shared/lib/supabaseClient';
import {
  buildWorkspaceTemplateFromCatalog,
  diffWorkspaceTemplate,
  normalizeWorkspaceTemplate,
  type WorkspaceTemplate,
} from '@/shared/domain/workspaceTemplate';
import { splitStatusLabel } from '@/shared/lib/statusLabels';
import { sanitizeProjectActivityContent } from '@/features/projects/lib/projectActivityContent';
import { useAuthStore } from '@/features/auth/store/authStore';
import type {
  PlannerGetState,
  PlannerSetState,
  PlannerStore,
} from '@/features/planner/store/plannerStore.contract';
import {
  AssigneeRow,
  CustomerContactRow,
  CustomerRow,
  mapAssigneeRow,
  mapCustomerContactRow,
  mapCustomerRow,
  mapMilestoneRow,
  mapProjectActivityRow,
  mapProjectMemberRow,
  mapProjectRow,
  mapStatusRow,
  mapTagRow,
  mapTaskTypeRow,
  MilestoneRow,
  MutationResult,
  ProjectActivityRow,
  ProjectMemberRow,
  ProjectRow,
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

type CatalogActions = Pick<
  PlannerStore,
  | 'addProject'
  | 'updateProject'
  | 'deleteProject'
  | 'toggleTrackedProject'
  | 'addCustomer'
  | 'updateCustomer'
  | 'deleteCustomer'
  | 'addCustomerContact'
  | 'updateCustomerContact'
  | 'deleteCustomerContact'
  | 'addProjectMember'
  | 'updateProjectMember'
  | 'deleteProjectMember'
  | 'addProjectActivity'
  | 'updateProjectActivity'
  | 'deleteProjectActivity'
  | 'setProjectActivityPinned'
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
  | 'loadWorkspaceTemplate'
  | 'saveWorkspaceTemplate'
  | 'applyWorkspaceTemplate'
  | 'addMilestone'
  | 'updateMilestone'
  | 'deleteMilestone'
>;

const emptyMutationResult: MutationResult = {};

const getCurrentUserId = async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error) return { error: error.message };
  if (!data.user?.id) return { error: 'Not authenticated.' };
  return { userId: data.user.id };
};

export const createCatalogActions = (
  set: PlannerSetState,
  get: PlannerGetState,
): CatalogActions => ({
  addProject: async (project) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return null;

    const { data, error } = await supabase
      .from('projects')
      .insert({
        workspace_id: workspaceId,
        name: project.name,
        code: project.code ?? null,
        color: project.color,
        archived: project.archived ?? false,
        customer_id: project.customerId ?? null,
        owner_group_id: project.ownerGroupId ?? null,
        status: project.status ?? null,
      })
      .select('*')
      .single();

    if (error || !data) {
      console.error(error);
      return null;
    }

    const mapped = mapProjectRow(data as ProjectRow);
    set((state) => ({ projects: [...state.projects, mapped] }));
    return mapped;
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
    if ('ownerGroupId' in updates) payload.owner_group_id = updates.ownerGroupId;
    if ('status' in updates) payload.status = updates.status;
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
        industry: customer.industry ?? null,
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
    if ('industry' in updates) payload.industry = updates.industry;
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
      customerContacts: state.customerContacts.filter((contact) => contact.customerId !== id),
      projects: state.projects.map((project) => (
        project.customerId === id ? { ...project, customerId: null } : project
      )),
    }));

    return emptyMutationResult;
  },

  addCustomerContact: async (contact) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return null;

    // Append at the end of the per-customer list.
    const existingForCustomer = get().customerContacts.filter((c) => c.customerId === contact.customerId);
    const nextPosition = existingForCustomer.reduce((max, c) => Math.max(max, c.position + 1), 0);

    const { data, error } = await supabase
      .from('customer_contacts')
      .insert({
        workspace_id: workspaceId,
        customer_id: contact.customerId,
        name: contact.name,
        role: contact.role,
        email: contact.email,
        phone: contact.phone,
        position: nextPosition,
        company: contact.company ?? null,
        tag: contact.tag ?? null,
      })
      .select('*')
      .single();

    if (error || !data) {
      console.error(error);
      return null;
    }

    const mapped = mapCustomerContactRow(data as CustomerContactRow);
    set((state) => ({ customerContacts: [...state.customerContacts, mapped] }));
    return mapped;
  },

  updateCustomerContact: async (id, updates) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return { error: 'Workspace not selected.' };

    const payload: Record<string, unknown> = {};
    if ('name' in updates) payload.name = updates.name;
    if ('role' in updates) payload.role = updates.role;
    if ('email' in updates) payload.email = updates.email;
    if ('phone' in updates) payload.phone = updates.phone;
    if ('position' in updates) payload.position = updates.position;
    if ('company' in updates) payload.company = updates.company;
    if ('tag' in updates) payload.tag = updates.tag;
    // Attach/detach/move between clients from the Contacts tab (null = standalone).
    if ('customerId' in updates) payload.customer_id = updates.customerId;
    if (Object.keys(payload).length === 0) return emptyMutationResult;

    const { data, error } = await supabase
      .from('customer_contacts')
      .update(payload)
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select('*')
      .single();

    if (error || !data) {
      console.error(error);
      return { error: error?.message ?? 'Failed to update contact.' };
    }

    const updated = mapCustomerContactRow(data as CustomerContactRow);
    set((state) => ({
      customerContacts: state.customerContacts.map((c) => (c.id === id ? updated : c)),
    }));
    return emptyMutationResult;
  },

  deleteCustomerContact: async (id) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return { error: 'Workspace not selected.' };

    const { error } = await supabase
      .from('customer_contacts')
      .delete()
      .eq('id', id)
      .eq('workspace_id', workspaceId);

    if (error) {
      console.error(error);
      return { error: error.message };
    }

    set((state) => ({
      customerContacts: state.customerContacts.filter((c) => c.id !== id),
    }));
    return emptyMutationResult;
  },

  addProjectMember: async (member) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return null;

    const existingForProject = get().projectMembers.filter((m) => m.projectId === member.projectId);
    const nextPosition = existingForProject.reduce((max, m) => Math.max(max, m.position + 1), 0);

    const { data, error } = await supabase
      .from('project_members')
      .insert({
        workspace_id: workspaceId,
        project_id: member.projectId,
        assignee_id: member.assigneeId,
        role: member.role,
        position: nextPosition,
        tag: member.tag ?? null,
        external_name: member.externalName ?? null,
        external_company: member.externalCompany ?? null,
        external_email: member.externalEmail ?? null,
        external_phone: member.externalPhone ?? null,
      })
      .select('*')
      .single();

    if (error || !data) {
      console.error(error);
      return null;
    }

    const mapped = mapProjectMemberRow(data as ProjectMemberRow);
    set((state) => ({ projectMembers: [...state.projectMembers, mapped] }));
    return mapped;
  },

  updateProjectMember: async (id, updates) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return { error: 'Workspace not selected.' };

    const payload: Record<string, unknown> = {};
    if ('role' in updates) payload.role = updates.role;
    if ('position' in updates) payload.position = updates.position;
    if ('tag' in updates) payload.tag = updates.tag;
    if ('externalName' in updates) payload.external_name = updates.externalName;
    if ('externalCompany' in updates) payload.external_company = updates.externalCompany;
    if ('externalEmail' in updates) payload.external_email = updates.externalEmail;
    if ('externalPhone' in updates) payload.external_phone = updates.externalPhone;
    if (Object.keys(payload).length === 0) return emptyMutationResult;

    const { data, error } = await supabase
      .from('project_members')
      .update(payload)
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select('*')
      .single();

    if (error || !data) {
      console.error(error);
      return { error: error?.message ?? 'Failed to update project member.' };
    }

    const updated = mapProjectMemberRow(data as ProjectMemberRow);
    set((state) => ({
      projectMembers: state.projectMembers.map((m) => (m.id === id ? updated : m)),
    }));
    return emptyMutationResult;
  },

  deleteProjectMember: async (id) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return { error: 'Workspace not selected.' };

    const { error } = await supabase
      .from('project_members')
      .delete()
      .eq('id', id)
      .eq('workspace_id', workspaceId);

    if (error) {
      console.error(error);
      return { error: error.message };
    }

    set((state) => ({
      projectMembers: state.projectMembers.filter((m) => m.id !== id),
    }));
    return emptyMutationResult;
  },

  addProjectActivity: async ({ projectId, content }) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return null;
    const sanitized = sanitizeProjectActivityContent(content);
    if (!sanitized) return null;

    const userResult = await getCurrentUserId();
    if ('error' in userResult) {
      console.error(userResult.error);
      return null;
    }
    const authState = useAuthStore.getState();
    const authorDisplayName = authState.profileDisplayName?.trim()
      || authState.user?.email
      || 'Member';

    const { data, error } = await supabase
      .from('project_activity')
      .insert({
        workspace_id: workspaceId,
        project_id: projectId,
        author_id: userResult.userId,
        author_display_name: authorDisplayName,
        kind: 'comment',
        content: sanitized,
      })
      .select('*')
      .single();

    if (error || !data) {
      console.error(error);
      return null;
    }

    const mapped = mapProjectActivityRow(data as ProjectActivityRow);
    set((state) => ({ projectActivity: [mapped, ...state.projectActivity] }));
    return mapped;
  },

  updateProjectActivity: async (id, updates) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return { error: 'Workspace not selected.' };
    const sanitized = sanitizeProjectActivityContent(updates.content);
    if (!sanitized) return { error: 'Content is empty.' };

    const { data, error } = await supabase
      .from('project_activity')
      .update({ content: sanitized })
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select('*')
      .single();

    if (error || !data) {
      console.error(error);
      return { error: error?.message ?? 'Failed to update activity entry.' };
    }

    const mapped = mapProjectActivityRow(data as ProjectActivityRow);
    set((state) => ({
      projectActivity: state.projectActivity.map((entry) => (entry.id === id ? mapped : entry)),
    }));
    return emptyMutationResult;
  },

  deleteProjectActivity: async (id) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return { error: 'Workspace not selected.' };

    const { error } = await supabase
      .from('project_activity')
      .delete()
      .eq('id', id)
      .eq('workspace_id', workspaceId);

    if (error) {
      console.error(error);
      return { error: error.message };
    }

    set((state) => ({
      projectActivity: state.projectActivity.filter((entry) => entry.id !== id),
    }));
    return emptyMutationResult;
  },

  setProjectActivityPinned: async (id, pinned) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return { error: 'Workspace not selected.' };

    const { data, error } = await supabase
      .from('project_activity')
      .update({ pinned })
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select('*')
      .single();

    if (error || !data) {
      console.error(error);
      return { error: error?.message ?? 'Failed to update note.' };
    }

    const mapped = mapProjectActivityRow(data as ProjectActivityRow);
    set((state) => ({
      projectActivity: state.projectActivity.map((entry) => (entry.id === id ? mapped : entry)),
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

    if (!data) {
      return { error: 'No template saved yet.' };
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

  applyWorkspaceTemplate: async () => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return { error: 'Workspace not selected.' };

    const templateResult = await get().loadWorkspaceTemplate();
    if (templateResult.error || !templateResult.template) {
      return { error: templateResult.error ?? 'No template saved yet.' };
    }

    const diff = diffWorkspaceTemplate(templateResult.template, {
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

    if (diff.statuses.length === 0 && diff.taskTypes.length === 0 && diff.tags.length === 0) {
      return emptyMutationResult;
    }

    set({ loadedRange: null });
    await get().loadWorkspaceData(workspaceId);
    return emptyMutationResult;
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
        note: milestone.note ?? null,
        status_override: milestone.statusOverride ?? null,
        include_in_workload: milestone.includeInWorkload ?? true,
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
    if ('note' in updates) payload.note = updates.note;
    if ('statusOverride' in updates) payload.status_override = updates.statusOverride;
    if ('includeInWorkload' in updates) payload.include_in_workload = updates.includeInWorkload;
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
