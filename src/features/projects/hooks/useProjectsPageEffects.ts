import { useEffect } from 'react';
import { Customer, Milestone, Project, Task } from '@/features/planner/types/planner';

type ProjectsMode = 'projects' | 'milestones' | 'customers';
type ProjectsTab = 'active' | 'archived';

type UseProjectsPageEffectsArgs = {
  tab: ProjectsTab;
  activeProjects: Project[];
  archivedProjects: Project[];
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
  activeProjects,
  archivedProjects,
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
    const fullList = tab === 'active' ? activeProjects : archivedProjects;
    const list = tab === 'active' ? filteredActiveProjects : filteredArchivedProjects;
    // Honor an explicitly chosen project (e.g. opened from the Customers or
    // Milestones tab) even when the sidebar's customer/team filter would hide
    // it, as long as the project still exists in the current tab. This mirrors
    // how an active search surfaces matches outside the filter — and unlike
    // clearing the filter, it leaves the user's filter selection untouched.
    // Runs before the checks below so navigation survives even when the active
    // filter matches nothing in this tab. A genuinely missing project (deleted,
    // or moved to the other tab) is absent from fullList and falls through to
    // the normal reconciliation.
    if (selectedProjectId && fullList.some((project) => project.id === selectedProjectId)) {
      return;
    }
    if (list.length === 0) {
      setSelectedProjectId(null);
      return;
    }
    if (!selectedProjectId || !list.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(list[0].id);
    }
  }, [activeProjects, archivedProjects, filteredActiveProjects, filteredArchivedProjects, selectedProjectId, setSelectedProjectId, tab]);

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
