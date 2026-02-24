import { useEffect } from 'react';
import { Customer, Milestone, Project, Task } from '@/features/planner/types/planner';

type ProjectsMode = 'projects' | 'milestones' | 'customers';
type ProjectsTab = 'active' | 'archived';

type UseProjectsPageEffectsArgs = {
  tab: ProjectsTab;
  filteredActiveProjects: Project[];
  filteredArchivedProjects: Project[];
  selectedProjectId: string | null;
  setSelectedProjectId: (projectId: string | null) => void;
  selectedTaskId: string | null;
  setSelectedTaskId: (taskId: string | null) => void;
  projectTasks: Task[];
  mode: ProjectsMode;
  filteredCustomers: Customer[];
  selectedCustomerId: string | null;
  setSelectedCustomerId: (customerId: string | null) => void;
  visibleMilestones: Milestone[];
  selectedMilestoneId: string | null;
  setSelectedMilestoneId: (milestoneId: string | null) => void;
  createProjectOpen: boolean;
  resetCreateProjectForm: () => void;
  setCreateProjectConfirmOpen: (open: boolean) => void;
  projectSettingsOpen: boolean;
  setProjectSettingsTarget: (project: Project | null) => void;
  setProjectSettingsConfirmOpen: (open: boolean) => void;
};

export const useProjectsPageEffects = ({
  tab,
  filteredActiveProjects,
  filteredArchivedProjects,
  selectedProjectId,
  setSelectedProjectId,
  selectedTaskId,
  setSelectedTaskId,
  projectTasks,
  mode,
  filteredCustomers,
  selectedCustomerId,
  setSelectedCustomerId,
  visibleMilestones,
  selectedMilestoneId,
  setSelectedMilestoneId,
  createProjectOpen,
  resetCreateProjectForm,
  setCreateProjectConfirmOpen,
  projectSettingsOpen,
  setProjectSettingsTarget,
  setProjectSettingsConfirmOpen,
}: UseProjectsPageEffectsArgs) => {
  useEffect(() => {
    const list = tab === 'active' ? filteredActiveProjects : filteredArchivedProjects;
    if (list.length === 0) {
      setSelectedProjectId(null);
      return;
    }
    if (!selectedProjectId || !list.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(list[0].id);
    }
  }, [filteredActiveProjects, filteredArchivedProjects, selectedProjectId, setSelectedProjectId, tab]);

  useEffect(() => {
    if (!selectedProjectId) {
      setSelectedTaskId(null);
    }
  }, [selectedProjectId, setSelectedTaskId]);

  useEffect(() => {
    if (!selectedTaskId) return;
    if (!projectTasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(null);
    }
  }, [projectTasks, selectedTaskId, setSelectedTaskId]);

  useEffect(() => {
    if (mode !== 'customers') return;
    if (filteredCustomers.length === 0) {
      setSelectedCustomerId(null);
      return;
    }
    if (!selectedCustomerId || !filteredCustomers.some((customer) => customer.id === selectedCustomerId)) {
      setSelectedCustomerId(filteredCustomers[0].id);
    }
  }, [filteredCustomers, mode, selectedCustomerId, setSelectedCustomerId]);

  useEffect(() => {
    if (mode !== 'milestones') return;
    if (visibleMilestones.length === 0) {
      setSelectedMilestoneId(null);
      return;
    }
    if (!selectedMilestoneId || !visibleMilestones.some((milestone) => milestone.id === selectedMilestoneId)) {
      setSelectedMilestoneId(visibleMilestones[0].id);
    }
  }, [mode, selectedMilestoneId, setSelectedMilestoneId, visibleMilestones]);

  useEffect(() => {
    if (!createProjectOpen) {
      resetCreateProjectForm();
      setCreateProjectConfirmOpen(false);
    }
  }, [createProjectOpen, resetCreateProjectForm, setCreateProjectConfirmOpen]);

  useEffect(() => {
    if (!projectSettingsOpen) {
      setProjectSettingsTarget(null);
      setProjectSettingsConfirmOpen(false);
    }
  }, [projectSettingsOpen, setProjectSettingsConfirmOpen, setProjectSettingsTarget]);
};
