import { useMemo } from 'react';
import { sortProjectsByTracking } from '@/shared/lib/projectSorting';
import { hasRichTags, sanitizeTaskDescription } from '@/shared/domain/taskDescription';
import type { Customer, Milestone, Project, Tag, Task } from '@/features/planner/types/planner';

interface UseProjectSelectionInput {
  projects: Project[];
  milestones: Milestone[];
  customers: Customer[];
  projectTasks: Task[];
  selectedProjectId: string | null;
  selectedMilestoneId: string | null;
  selectedCustomerId: string | null;
  selectedTaskId: string | null;
  projectById: Map<string, Project>;
  customerById: Map<string, Customer>;
  tagById: Map<string, Tag>;
  trackedProjectIds: string[];
}

export function useProjectSelection({
  projects,
  milestones,
  customers,
  projectTasks,
  selectedProjectId,
  selectedMilestoneId,
  selectedCustomerId,
  selectedTaskId,
  projectById,
  customerById,
  tagById,
  trackedProjectIds,
}: UseProjectSelectionInput) {
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const selectedMilestone = useMemo(
    () => milestones.find((milestone) => milestone.id === selectedMilestoneId) ?? null,
    [milestones, selectedMilestoneId],
  );

  const selectedMilestoneProject = useMemo(
    () => (selectedMilestone ? projectById.get(selectedMilestone.projectId) ?? null : null),
    [projectById, selectedMilestone],
  );

  const selectedMilestoneCustomer = useMemo(() => (
    selectedMilestoneProject?.customerId
      ? customerById.get(selectedMilestoneProject.customerId) ?? null
      : null
  ), [customerById, selectedMilestoneProject?.customerId]);

  const selectedTask = useMemo(
    () => projectTasks.find((task) => task.id === selectedTaskId) ?? null,
    [projectTasks, selectedTaskId],
  );

  const selectedTaskProject = useMemo(
    () => projects.find((project) => project.id === selectedTask?.projectId) ?? null,
    [projects, selectedTask?.projectId],
  );

  const selectedTaskCustomer = useMemo(() => (
    selectedTaskProject?.customerId
      ? customerById.get(selectedTaskProject.customerId) ?? null
      : null
  ), [customerById, selectedTaskProject?.customerId]);

  const selectedTaskTags = useMemo(() => (
    selectedTask?.tagIds.map((tagId) => tagById.get(tagId)).filter(Boolean) ?? []
  ), [selectedTask?.tagIds, tagById]);

  const selectedTaskDescription = useMemo(() => {
    if (!selectedTask?.description) return '';
    if (!hasRichTags(selectedTask.description)) return selectedTask.description;
    return sanitizeTaskDescription(selectedTask.description);
  }, [selectedTask?.description]);

  const selectedCustomer = useMemo(
    () => (selectedCustomerId ? customerById.get(selectedCustomerId) ?? null : null),
    [customerById, selectedCustomerId],
  );

  const selectedCustomerProjects = useMemo(() => {
    if (!selectedCustomerId) return [];
    return sortProjectsByTracking(
      projects.filter((project) => project.customerId === selectedCustomerId),
      trackedProjectIds,
    );
  }, [projects, selectedCustomerId, trackedProjectIds]);

  return {
    selectedProject,
    selectedMilestone,
    selectedMilestoneProject,
    selectedMilestoneCustomer,
    selectedTask,
    selectedTaskProject,
    selectedTaskCustomer,
    selectedTaskTags,
    selectedTaskDescription,
    selectedCustomer,
    selectedCustomerProjects,
  };
}
