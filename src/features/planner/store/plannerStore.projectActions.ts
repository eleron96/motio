import { supabase } from '@/shared/lib/supabaseClient';
import { sanitizeProjectActivityContent } from '@/features/projects/lib/projectActivityContent';
import { useAuthStore } from '@/features/auth/store/authStore';
import type {
  PlannerGetState,
  PlannerSetState,
  PlannerStore,
} from '@/features/planner/store/plannerStore.contract';
import {
  mapMilestoneRow,
  mapProjectActivityRow,
  mapProjectMemberRow,
  mapProjectRow,
  MilestoneRow,
  ProjectActivityRow,
  ProjectMemberRow,
  ProjectRow,
} from '@/features/planner/store/plannerStore.helpers';
import {
  emptyMutationResult,
  getCurrentUserId,
} from '@/features/planner/store/plannerStore.mutationHelpers';

// Projects and what hangs off them: tracking, the project team, the activity
// feed and milestones.
type ProjectActions = Pick<
  PlannerStore,
  | 'addProject'
  | 'updateProject'
  | 'deleteProject'
  | 'toggleTrackedProject'
  | 'addProjectMember'
  | 'updateProjectMember'
  | 'deleteProjectMember'
  | 'addProjectActivity'
  | 'updateProjectActivity'
  | 'deleteProjectActivity'
  | 'setProjectActivityPinned'
  | 'addMilestone'
  | 'updateMilestone'
  | 'deleteMilestone'
>;

export const createProjectActions = (
  set: PlannerSetState,
  get: PlannerGetState,
): ProjectActions => ({
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
