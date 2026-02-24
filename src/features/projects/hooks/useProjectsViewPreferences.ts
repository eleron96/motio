import { useEffect, useRef, useState } from 'react';

type NameSort = 'asc' | 'desc';
type MilestoneTab = 'active' | 'past';

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
    }));
  }, [groupByCustomer, milestoneGroupBy, milestoneTab, nameSort, projectsViewPrefsStorageKey]);

  return {
    nameSort,
    setNameSort,
    groupByCustomer,
    setGroupByCustomer,
    milestoneTab,
    setMilestoneTab,
    milestoneGroupBy,
    setMilestoneGroupBy,
  };
};
