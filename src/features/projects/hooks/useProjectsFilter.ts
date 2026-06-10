import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
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
  /** Persisted filter state — comes from `useProjectsViewPreferences` so it
   * survives reloads. Optional for callers that don't persist (tests). */
  customerFilterIds?: string[];
  setCustomerFilterIds?: Dispatch<SetStateAction<string[]>>;
  ownerGroupFilterIds?: string[];
  setOwnerGroupFilterIds?: Dispatch<SetStateAction<string[]>>;
  milestoneOwnerGroupFilterIds?: string[];
  setMilestoneOwnerGroupFilterIds?: Dispatch<SetStateAction<string[]>>;
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
  customerFilterIds: customerFilterIdsProp,
  setCustomerFilterIds: setCustomerFilterIdsProp,
  ownerGroupFilterIds: ownerGroupFilterIdsProp,
  setOwnerGroupFilterIds: setOwnerGroupFilterIdsProp,
  milestoneOwnerGroupFilterIds: milestoneOwnerGroupFilterIdsProp,
  setMilestoneOwnerGroupFilterIds: setMilestoneOwnerGroupFilterIdsProp,
}: UseProjectsFilterInput) {
  const [projectSearch, setProjectSearch] = useState('');
  // Fall back to local state when the caller doesn't pass persisted values.
  const [customerFilterIdsLocal, setCustomerFilterIdsLocal] = useState<string[]>([]);
  const [ownerGroupFilterIdsLocal, setOwnerGroupFilterIdsLocal] = useState<string[]>([]);
  const [milestoneOwnerGroupFilterIdsLocal, setMilestoneOwnerGroupFilterIdsLocal] = useState<string[]>([]);
  const customerFilterIds = customerFilterIdsProp ?? customerFilterIdsLocal;
  const setCustomerFilterIds = setCustomerFilterIdsProp ?? setCustomerFilterIdsLocal;
  const ownerGroupFilterIds = ownerGroupFilterIdsProp ?? ownerGroupFilterIdsLocal;
  const setOwnerGroupFilterIds = setOwnerGroupFilterIdsProp ?? setOwnerGroupFilterIdsLocal;
  const milestoneOwnerGroupFilterIds = milestoneOwnerGroupFilterIdsProp ?? milestoneOwnerGroupFilterIdsLocal;
  const setMilestoneOwnerGroupFilterIds = setMilestoneOwnerGroupFilterIdsProp ?? setMilestoneOwnerGroupFilterIdsLocal;
  const [milestoneSearch, setMilestoneSearch] = useState('');

  const filteredActiveProjects = useMemo(
    () => filterProjectsByCustomerAndSearch(activeProjects, customerFilterIds, projectSearch, ownerGroupFilterIds),
    [activeProjects, customerFilterIds, ownerGroupFilterIds, projectSearch],
  );

  const filteredArchivedProjects = useMemo(
    () => filterProjectsByCustomerAndSearch(archivedProjects, customerFilterIds, projectSearch, ownerGroupFilterIds),
    [archivedProjects, customerFilterIds, ownerGroupFilterIds, projectSearch],
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
      ownerGroupFilterIds: milestoneOwnerGroupFilterIds,
    }),
    [
      customerById,
      milestoneOwnerGroupFilterIds,
      milestoneSearch,
      milestones,
      nameSort,
      projectById,
      trackedProjectIdSet,
    ],
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
    ownerGroupFilterIds,
    setOwnerGroupFilterIds,
    milestoneOwnerGroupFilterIds,
    setMilestoneOwnerGroupFilterIds,
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
