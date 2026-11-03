import { useCallback, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import type { Locale as DateFnsLocale } from 'date-fns';
import { t } from '@lingui/macro';
import { useShallow } from 'zustand/react/shallow';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { sortProjectsByTracking } from '@/shared/lib/projectSorting';
import {
  buildCustomerProjectCounts,
  filterCustomersBySearch,
  groupProjectsForSidebar,
  sortCustomersByName,
} from '@/features/projects/lib/projectsSelectors';
import { useProjectsFilter } from '@/features/projects/hooks/useProjectsFilter';
import type { ProjectsViewPreferences } from '@/features/projects/hooks/useProjectsViewPreferences';
import type { Project } from '@/features/planner/types/planner';

interface UseProjectsListsOptions {
  preferences: ProjectsViewPreferences;
  dateLocale: DateFnsLocale;
}

/**
 * What the projects page lists — projects (active and archived), customers
 * and milestones — sorted, searched and filtered, with the filter labels and
 * toggles the sidebars show. Lookups by id come along, as every panel needs
 * them.
 */
export const useProjectsLists = ({ preferences, dateLocale }: UseProjectsListsOptions) => {
  const {
    projects,
    milestones,
    trackedProjectIds,
    customers,
    memberGroups,
  } = usePlannerStore(useShallow((state) => ({
    projects: state.projects,
    milestones: state.milestones,
    trackedProjectIds: state.trackedProjectIds,
    customers: state.customers,
    memberGroups: state.memberGroups,
  })));
  const {
    nameSort,
    groupByCustomer,
    milestoneTab,
    milestoneGroupBy,
    setMilestoneGroupBy,
  } = preferences;
  const [customerSearch, setCustomerSearch] = useState('');

  const activeProjects = useMemo(
    () => sortProjectsByTracking(
      projects.filter((project) => !project.archived),
      trackedProjectIds,
      nameSort,
    ),
    [projects, trackedProjectIds, nameSort],
  );
  const archivedProjects = useMemo(
    () => sortProjectsByTracking(
      projects.filter((project) => project.archived),
      trackedProjectIds,
      nameSort,
    ),
    [projects, trackedProjectIds, nameSort],
  );
  const customerById = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer])),
    [customers],
  );
  const memberGroupById = useMemo(
    () => new Map(memberGroups.map((group) => [group.id, group])),
    [memberGroups],
  );
  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );
  const sortedCustomers = useMemo(
    () => sortCustomersByName(customers, nameSort),
    [customers, nameSort],
  );
  const filteredCustomers = useMemo(
    () => filterCustomersBySearch(sortedCustomers, customerSearch),
    [customerSearch, sortedCustomers],
  );
  const trackedProjectIdSet = useMemo(() => new Set(trackedProjectIds), [trackedProjectIds]);
  const customerProjectCounts = useMemo(
    () => buildCustomerProjectCounts(projects),
    [projects],
  );

  const filters = useProjectsFilter({
    activeProjects,
    archivedProjects,
    milestones,
    projects,
    sortedCustomers,
    projectById,
    customerById,
    nameSort,
    milestoneTab,
    milestoneGroupBy,
    setMilestoneGroupBy,
    dateLocale,
    // Persisted filters live in useProjectsViewPreferences so they survive
    // reloads — pass them through so the filter hook reads/writes the same
    // backing store.
    customerFilterIds: preferences.customerFilterIds,
    setCustomerFilterIds: preferences.setCustomerFilterIds,
    ownerGroupFilterIds: preferences.ownerGroupFilterIds,
    setOwnerGroupFilterIds: preferences.setOwnerGroupFilterIds,
    milestoneOwnerGroupFilterIds: preferences.milestoneOwnerGroupFilterIds,
    setMilestoneOwnerGroupFilterIds: preferences.setMilestoneOwnerGroupFilterIds,
  });
  const {
    customerFilterIds,
    setCustomerFilterIds,
    ownerGroupFilterIds,
    setOwnerGroupFilterIds,
    setMilestoneOwnerGroupFilterIds,
  } = filters;

  const customerFilterLabel = customerFilterIds.length === 0
    ? t`All`
    : t`${customerFilterIds.length} selected`;

  const ownerGroupFilterLabel = ownerGroupFilterIds.length === 0
    ? t`Team`
    : t`${ownerGroupFilterIds.length} selected`;

  const nameSortLabel = nameSort === 'asc' ? t`A-Z` : t`Z-A`;

  const handleToggleOwnerGroupFilter = (groupId: string) => {
    setOwnerGroupFilterIds((current) => (
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId]
    ));
  };

  const handleToggleMilestoneOwnerGroupFilter = (groupId: string) => {
    setMilestoneOwnerGroupFilterIds((current) => (
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId]
    ));
  };

  const handleToggleCustomer = (customerId: string) => {
    setCustomerFilterIds((current) => (
      current.includes(customerId)
        ? current.filter((id) => id !== customerId)
        : [...current, customerId]
    ));
  };

  const groupedProjects = useCallback(
    (list: Project[]) => groupProjectsForSidebar(
      list,
      groupByCustomer,
      sortedCustomers,
      trackedProjectIds,
      t`No customer`,
      t`All projects`,
    ),
    [groupByCustomer, sortedCustomers, trackedProjectIds],
  );

  const formatMilestoneDate = useCallback((date: string) => (
    format(parseISO(date), 'dd MMM yyyy', { locale: dateLocale })
  ), [dateLocale]);

  return {
    ...filters,
    customerSearch,
    setCustomerSearch,
    activeProjects,
    archivedProjects,
    customerById,
    memberGroupById,
    projectById,
    sortedCustomers,
    filteredCustomers,
    trackedProjectIdSet,
    customerProjectCounts,
    customerFilterLabel,
    ownerGroupFilterLabel,
    nameSortLabel,
    handleToggleOwnerGroupFilter,
    handleToggleMilestoneOwnerGroupFilter,
    handleToggleCustomer,
    groupedProjects,
    formatMilestoneDate,
  };
};

export type ProjectsLists = ReturnType<typeof useProjectsLists>;
