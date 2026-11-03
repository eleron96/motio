import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { computeGroupMembersToAdd } from '@/features/projects/lib/projectCard/computeGroupMembersToAdd';

type PlannerState = ReturnType<typeof usePlannerStore.getState>;

/**
 * Creating or editing a project with an owner team (member group) adds every
 * workspace user of that team as an explicit project member. People can still
 * be removed one by one afterwards: this only adds, and skips anyone already
 * there.
 */
export const useProjectGroupSync = () => {
  const {
    projects,
    assignees,
    memberGroupAssignments,
    projectMembers,
    addProject,
    updateProject,
    addProjectMember,
  } = usePlannerStore(useShallow((state) => ({
    projects: state.projects,
    assignees: state.assignees,
    memberGroupAssignments: state.memberGroupAssignments,
    projectMembers: state.projectMembers,
    addProject: state.addProject,
    updateProject: state.updateProject,
    addProjectMember: state.addProjectMember,
  })));

  const syncGroupMembersToProject = useCallback(async (
    projectId: string,
    groupId: string | null,
  ) => {
    const toAdd = computeGroupMembersToAdd({
      projectId,
      groupId,
      memberGroupAssignments,
      assignees,
      projectMembers,
    });
    if (toAdd.length === 0) return;
    await Promise.all(toAdd.map((assignee) => addProjectMember({
      projectId,
      assigneeId: assignee.id,
      role: null,
      tag: null,
      externalName: null,
      externalCompany: null,
      externalEmail: null,
      externalPhone: null,
    })));
  }, [addProjectMember, assignees, memberGroupAssignments, projectMembers]);

  const addProjectWithGroupSync = useCallback(async (
    payload: Parameters<PlannerState['addProject']>[0],
  ) => {
    const created = await addProject(payload);
    if (created && payload.ownerGroupId) {
      await syncGroupMembersToProject(created.id, payload.ownerGroupId);
    }
    return created;
  }, [addProject, syncGroupMembersToProject]);

  const updateProjectWithGroupSync = useCallback(async (
    id: string,
    updates: Parameters<PlannerState['updateProject']>[1],
  ) => {
    const previous = projects.find((project) => project.id === id) ?? null;
    const result = await updateProject(id, updates);
    if (result?.error) return result;
    // Only fan out to project_members when the owner group actually changed
    // and resolves to a non-null group. Avoids redundant round-trips when an
    // unrelated field (name, color, etc.) is edited.
    const nextGroupId = 'ownerGroupId' in updates ? updates.ownerGroupId ?? null : null;
    const previousGroupId = previous?.ownerGroupId ?? null;
    if (nextGroupId && nextGroupId !== previousGroupId) {
      await syncGroupMembersToProject(id, nextGroupId);
    }
    return result;
  }, [projects, updateProject, syncGroupMembersToProject]);

  return { addProjectWithGroupSync, updateProjectWithGroupSync };
};
