import { useCallback, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { t } from '@lingui/macro';
import type { Locale } from 'date-fns';
import type { Customer, Milestone, Project } from '@/features/planner/types/planner';
import {
  buildGroupedMilestones,
  filterAndSortMilestones,
  filterProjectsByCustomerAndSearch,
  splitMilestonesByDate,
} from '@/features/projects/lib/projectsSelectors';
import type { MilestoneGroupBy } from '@/features/projects/hooks/useProjectsViewPreferences';

interface UseProjectsFilterInput {
  activeProjects: Project[];
  archivedProjects: Project[];
  milestones: Milestone[];
  projects: Project[];
  sortedCustomers: Customer[];
  trackedProjectIds: string[];
  trackedProjectIdSet: Set<string>;
  projectById: Map<string, Project>;
  customerById: Map<string, Customer>;
  nameSort: 'asc' | 'desc';
  milestoneTab: 'active' | 'past';
  milestoneGroupBy: MilestoneGroupBy;
  setMilestoneGroupBy: (v: MilestoneGroupBy) => void;
  dateLocale: Locale;
}

export function useProjectsFilter({
  activeProjects,
  archivedProjects,
  milestones,
  projects,
  sortedCustomers,
  trackedProjectIds,
  trackedProjectIdSet,
  projectById,
  customerById,
  nameSort,
  milestoneTab,
  milestoneGroupBy,
  setMilestoneGroupBy,
  dateLocale,
}: UseProjectsFilterInput) {
  const [projectSearch, setProjectSearch] = useState('');
  const [customerFilterIds, setCustomerFilterIds] = useState<string[]>([]);
  const [milestoneSearch, setMilestoneSearch] = useState('');

  const filteredActiveProjects = useMemo(
    () => filterProjectsByCustomerAndSearch(activeProjects, customerFilterIds, projectSearch),
    [activeProjects, customerFilterIds, projectSearch],
  );

  const filteredArchivedProjects = useMemo(
    () => filterProjectsByCustomerAndSearch(archivedProjects, customerFilterIds, projectSearch),
    [archivedProjects, customerFilterIds, projectSearch],
  );

  const todayMilestoneKey = format(new Date(), 'yyyy-MM-dd');

  const filteredMilestones = useMemo(
    () => filterAndSortMilestones({
      milestones,
      projectById,
      customerById,
      trackedProjectIdSet,
      milestoneSearch,
      nameSort,
    }),
    [customerById, milestoneSearch, milestones, nameSort, projectById, trackedProjectIdSet],
  );

  const { active: filteredActiveMilestones, past: filteredPastMilestones } = useMemo(
    () => splitMilestonesByDate(filteredMilestones, todayMilestoneKey),
    [filteredMilestones, todayMilestoneKey],
  );

  const visibleMilestones = milestoneTab === 'active' ? filteredActiveMilestones : filteredPastMilestones;

  const groupedMilestones = useMemo(
    () => buildGroupedMilestones({
      visibleMilestones,
      milestoneGroupBy,
      milestoneTab,
      projectById,
      projects,
      sortedCustomers,
      trackedProjectIds,
      nameSort,
      dateLocale,
      labels: {
        unknownProject: t`Unknown project`,
        noCustomer: t`No customer`,
      },
    }),
    [dateLocale, milestoneGroupBy, milestoneTab, nameSort, projectById, projects, sortedCustomers, trackedProjectIds, visibleMilestones],
  );

  const milestoneGroupLabel = useMemo(() => {
    if (milestoneGroupBy === 'project') return t`Project`;
    if (milestoneGroupBy === 'customer') return t`Customer`;
    return t`Month`;
  }, [milestoneGroupBy]);

  const handleCycleMilestoneGroup = useCallback(() => {
    setMilestoneGroupBy(
      milestoneGroupBy === 'project' ? 'customer'
        : milestoneGroupBy === 'customer' ? 'month'
        : 'project',
    );
  }, [milestoneGroupBy, setMilestoneGroupBy]);

  return {
    projectSearch,
    setProjectSearch,
    customerFilterIds,
    setCustomerFilterIds,
    milestoneSearch,
    setMilestoneSearch,
    filteredActiveProjects,
    filteredArchivedProjects,
    filteredMilestones,
    visibleMilestones,
    groupedMilestones,
    milestoneGroupLabel,
    handleCycleMilestoneGroup,
  };
}
