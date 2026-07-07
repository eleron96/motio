import { useEffect, useRef, useState } from 'react';

type NameSort = 'asc' | 'desc';
type MilestoneTab = 'active' | 'past';
type ProjectsTab = 'active' | 'archived';
type ProjectsMode = 'projects' | 'milestones' | 'customers' | 'contacts';

export type MilestoneGroupBy = 'project' | 'customer' | 'month';

type UseProjectsViewPreferencesArgs = {
  currentWorkspaceId: string | null;
  userId?: string | null;
};

export const useProjectsViewPreferences = ({
  currentWorkspaceId,
  userId,
}: UseProjectsViewPreferencesArgs) => {
  const [nameSort, setNameSort] = useState<NameSort>('asc');
  const [groupByCustomer, setGroupByCustomer] = useState(false);
  const [milestoneTab, setMilestoneTab] = useState<MilestoneTab>('active');
  const [milestoneGroupBy, setMilestoneGroupBy] = useState<MilestoneGroupBy>('project');
  const [tab, setTab] = useState<ProjectsTab>('active');
  const [mode, setMode] = useState<ProjectsMode>('projects');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerFilterIds, setCustomerFilterIds] = useState<string[]>([]);
  const [ownerGroupFilterIds, setOwnerGroupFilterIds] = useState<string[]>([]);
  // Independent from `ownerGroupFilterIds`: switching modes shouldn't
  // accidentally reuse the projects filter for the milestones list and
  // vice-versa. Same shape, same storage key, separate value.
  const [milestoneOwnerGroupFilterIds, setMilestoneOwnerGroupFilterIds] = useState<string[]>([]);

  const projectsViewPrefsStorageKey = currentWorkspaceId
    ? `projects-view-prefs-${currentWorkspaceId}`
    : userId
      ? `projects-view-prefs-user-${userId}`
      : 'projects-view-prefs';
  const projectsViewPrefsHydratedRef = useRef(false);

  useEffect(() => {
    projectsViewPrefsHydratedRef.current = false;
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(projectsViewPrefsStorageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<{
          nameSort: NameSort;
          groupByCustomer: boolean;
          milestoneTab: MilestoneTab;
          milestoneGroupBy: MilestoneGroupBy;
          tab: ProjectsTab;
          mode: ProjectsMode;
          selectedProjectId: string | null;
          selectedCustomerId: string | null;
          customerFilterIds: string[];
          ownerGroupFilterIds: string[];
          milestoneOwnerGroupFilterIds: string[];
        }>;
        if (parsed.nameSort === 'asc' || parsed.nameSort === 'desc') {
          setNameSort(parsed.nameSort);
        }
        if (typeof parsed.groupByCustomer === 'boolean') {
          setGroupByCustomer(parsed.groupByCustomer);
        }
        if (parsed.milestoneTab === 'active' || parsed.milestoneTab === 'past') {
          setMilestoneTab(parsed.milestoneTab);
        }
        if (parsed.milestoneGroupBy === 'project' || parsed.milestoneGroupBy === 'customer' || parsed.milestoneGroupBy === 'month') {
          setMilestoneGroupBy(parsed.milestoneGroupBy);
        }
        if (parsed.tab === 'active' || parsed.tab === 'archived') {
          setTab(parsed.tab);
        }
        if (parsed.mode === 'projects' || parsed.mode === 'milestones' || parsed.mode === 'customers' || parsed.mode === 'contacts') {
          setMode(parsed.mode);
        }
        if (typeof parsed.selectedProjectId === 'string' || parsed.selectedProjectId === null) {
          setSelectedProjectId(parsed.selectedProjectId);
        }
        if (typeof parsed.selectedCustomerId === 'string' || parsed.selectedCustomerId === null) {
          setSelectedCustomerId(parsed.selectedCustomerId);
        }
        if (Array.isArray(parsed.customerFilterIds) && parsed.customerFilterIds.every((id) => typeof id === 'string')) {
          setCustomerFilterIds(parsed.customerFilterIds);
        }
        if (Array.isArray(parsed.ownerGroupFilterIds) && parsed.ownerGroupFilterIds.every((id) => typeof id === 'string')) {
          setOwnerGroupFilterIds(parsed.ownerGroupFilterIds);
        }
        if (
          Array.isArray(parsed.milestoneOwnerGroupFilterIds)
          && parsed.milestoneOwnerGroupFilterIds.every((id) => typeof id === 'string')
        ) {
          setMilestoneOwnerGroupFilterIds(parsed.milestoneOwnerGroupFilterIds);
        }
      } catch {
        // Ignore invalid localStorage payload and keep defaults.
      }
    }
    projectsViewPrefsHydratedRef.current = true;
  }, [projectsViewPrefsStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!projectsViewPrefsHydratedRef.current) return;
    window.localStorage.setItem(projectsViewPrefsStorageKey, JSON.stringify({
      nameSort,
      groupByCustomer,
      milestoneTab,
      milestoneGroupBy,
      tab,
      mode,
      selectedProjectId,
      selectedCustomerId,
      customerFilterIds,
      ownerGroupFilterIds,
      milestoneOwnerGroupFilterIds,
    }));
  }, [
    groupByCustomer,
    milestoneGroupBy,
    milestoneTab,
    nameSort,
    tab,
    mode,
    selectedProjectId,
    selectedCustomerId,
    customerFilterIds,
    ownerGroupFilterIds,
    milestoneOwnerGroupFilterIds,
    projectsViewPrefsStorageKey,
  ]);

  return {
    nameSort,
    setNameSort,
    groupByCustomer,
    setGroupByCustomer,
    milestoneTab,
    setMilestoneTab,
    milestoneGroupBy,
    setMilestoneGroupBy,
    tab,
    setTab,
    mode,
    setMode,
    selectedProjectId,
    setSelectedProjectId,
    selectedCustomerId,
    setSelectedCustomerId,
    customerFilterIds,
    setCustomerFilterIds,
    ownerGroupFilterIds,
    setOwnerGroupFilterIds,
    milestoneOwnerGroupFilterIds,
    setMilestoneOwnerGroupFilterIds,
  };
};
