import { format, parseISO } from 'date-fns';
import type { Locale as DateFnsLocale } from 'date-fns';
import { Customer, Milestone, Project } from '@/features/planner/types/planner';
import { compareNames } from '@/shared/lib/nameSorting';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { sortProjectsByTracking } from '@/shared/lib/projectSorting';

type NameSort = 'asc' | 'desc';
type MilestoneGroupBy = 'project' | 'customer' | 'month';

export type MilestoneGroup = {
  id: string;
  name: string;
  milestones: Milestone[];
};

export type ProjectGroup = {
  id: string;
  name: string;
  projects: Project[];
};

type BuildGroupedMilestonesArgs = {
  visibleMilestones: Milestone[];
  milestoneGroupBy: MilestoneGroupBy;
  projectById: Map<string, Project>;
  projects: Project[];
  sortedCustomers: Customer[];
  trackedProjectIds: string[];
  nameSort: NameSort;
  dateLocale: DateFnsLocale;
  labels: {
    unknownProject: string;
    noCustomer: string;
  };
};

type FilterAndSortMilestonesArgs = {
  milestones: Milestone[];
  projectById: Map<string, Project>;
  customerById: Map<string, Customer>;
  trackedProjectIdSet: Set<string>;
  milestoneSearch: string;
  nameSort: NameSort;
};

export const sortCustomersByName = (customers: Customer[], nameSort: NameSort) => (
  [...customers].sort((left, right) => compareNames(left.name, right.name, nameSort))
);

export const filterCustomersBySearch = (customers: Customer[], customerSearch: string) => {
  const normalizedSearch = customerSearch.trim().toLowerCase();
  if (!normalizedSearch) return customers;
  return customers.filter((customer) => customer.name.toLowerCase().includes(normalizedSearch));
};

export const buildCustomerProjectCounts = (projects: Project[]) => {
  const counts = new Map<string, number>();
  projects.forEach((project) => {
    const key = project.customerId ?? 'none';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return counts;
};

export const filterProjectsByCustomerAndSearch = (
  projects: Project[],
  customerFilterIds: string[],
  projectSearch: string,
) => {
  const normalizedQuery = projectSearch.trim().toLowerCase();
  return projects.filter((project) => {
    const matchesCustomer = customerFilterIds.length === 0
      ? true
      : customerFilterIds.includes(project.customerId ?? 'none');
    const matchesSearch = normalizedQuery.length === 0
      ? true
      : project.name.toLowerCase().includes(normalizedQuery);
    return matchesCustomer && matchesSearch;
  });
};

export const filterAndSortMilestones = ({
  milestones,
  projectById,
  customerById,
  trackedProjectIdSet,
  milestoneSearch,
  nameSort,
}: FilterAndSortMilestonesArgs) => {
  const normalizedSearch = milestoneSearch.trim().toLowerCase();

  return milestones
    .filter((milestone) => {
      if (!normalizedSearch) return true;
      const project = projectById.get(milestone.projectId);
      const customer = project?.customerId ? customerById.get(project.customerId) : null;
      return [
        milestone.title,
        project?.name ?? '',
        project?.code ?? '',
        customer?.name ?? '',
      ].join(' ').toLowerCase().includes(normalizedSearch);
    })
    .sort((left, right) => {
      const leftTracked = trackedProjectIdSet.has(left.projectId);
      const rightTracked = trackedProjectIdSet.has(right.projectId);
      if (leftTracked !== rightTracked) return leftTracked ? -1 : 1;

      const byDate = left.date.localeCompare(right.date);
      if (byDate !== 0) return byDate;

      const byTitle = compareNames(left.title, right.title, nameSort);
      if (byTitle !== 0) return byTitle;

      const leftProjectName = projectById.get(left.projectId)?.name ?? '';
      const rightProjectName = projectById.get(right.projectId)?.name ?? '';
      return compareNames(leftProjectName, rightProjectName, nameSort);
    });
};

export const splitMilestonesByDate = (milestones: Milestone[], todayMilestoneKey: string) => ({
  active: milestones.filter((milestone) => milestone.date >= todayMilestoneKey),
  past: milestones.filter((milestone) => milestone.date < todayMilestoneKey),
});

/**
 * Builds stable milestone groups for the sidebar based on selected grouping mode.
 */
export const buildGroupedMilestones = ({
  visibleMilestones,
  milestoneGroupBy,
  projectById,
  projects,
  sortedCustomers,
  trackedProjectIds,
  nameSort,
  dateLocale,
  labels,
}: BuildGroupedMilestonesArgs): MilestoneGroup[] => {
  const buckets = new Map<string, Milestone[]>();
  visibleMilestones.forEach((milestone) => {
    if (milestoneGroupBy === 'project') {
      const key = projectById.has(milestone.projectId) ? milestone.projectId : 'missing-project';
      const list = buckets.get(key) ?? [];
      list.push(milestone);
      buckets.set(key, list);
      return;
    }

    if (milestoneGroupBy === 'customer') {
      const project = projectById.get(milestone.projectId);
      const key = project ? (project.customerId ?? 'none') : 'missing-project';
      const list = buckets.get(key) ?? [];
      list.push(milestone);
      buckets.set(key, list);
      return;
    }

    const monthKey = format(parseISO(milestone.date), 'yyyy-MM');
    const list = buckets.get(monthKey) ?? [];
    list.push(milestone);
    buckets.set(monthKey, list);
  });

  if (milestoneGroupBy === 'project') {
    const orderedProjects = sortProjectsByTracking(projects, trackedProjectIds, nameSort);
    const result = orderedProjects
      .map((project) => {
        const list = buckets.get(project.id) ?? [];
        if (list.length === 0) return null;
        return {
          id: project.id,
          name: formatProjectLabel(project.name, project.code),
          milestones: list,
        };
      })
      .filter((item): item is MilestoneGroup => Boolean(item));

    const missing = buckets.get('missing-project');
    if (missing && missing.length > 0) {
      result.push({ id: 'missing-project', name: labels.unknownProject, milestones: missing });
    }
    return result;
  }

  if (milestoneGroupBy === 'customer') {
    const result = sortedCustomers
      .map((customer) => {
        const list = buckets.get(customer.id) ?? [];
        if (list.length === 0) return null;
        return {
          id: customer.id,
          name: customer.name,
          milestones: list,
        };
      })
      .filter((item): item is MilestoneGroup => Boolean(item));

    const noCustomer = buckets.get('none');
    if (noCustomer && noCustomer.length > 0) {
      result.push({ id: 'none', name: labels.noCustomer, milestones: noCustomer });
    }

    const missing = buckets.get('missing-project');
    if (missing && missing.length > 0) {
      result.push({ id: 'missing-project', name: labels.unknownProject, milestones: missing });
    }
    return result;
  }

  return Array.from(buckets.entries())
    .sort((left, right) => right[0].localeCompare(left[0]))
    .map(([monthKey, list]) => ({
      id: monthKey,
      name: format(parseISO(`${monthKey}-01`), 'LLLL yyyy', { locale: dateLocale }),
      milestones: list,
    }));
};

export const groupProjectsForSidebar = (
  list: Project[],
  groupByCustomer: boolean,
  sortedCustomers: Customer[],
  trackedProjectIds: string[],
  noCustomerLabel: string,
  allProjectsLabel: string,
) => {
  if (!groupByCustomer) {
    return [{ id: 'all', name: allProjectsLabel, projects: list }];
  }

  const grouped = new Map<string, Project[]>();
  list.forEach((project) => {
    const key = project.customerId ?? 'none';
    const bucket = grouped.get(key) ?? [];
    bucket.push(project);
    grouped.set(key, bucket);
  });

  const result: ProjectGroup[] = [];
  sortedCustomers.forEach((customer) => {
    const bucket = grouped.get(customer.id);
    if (bucket && bucket.length > 0) {
      result.push({
        id: customer.id,
        name: customer.name,
        projects: sortProjectsByTracking(bucket, trackedProjectIds),
      });
    }
  });

  const noCustomer = grouped.get('none');
  if (noCustomer && noCustomer.length > 0) {
    result.push({
      id: 'none',
      name: noCustomerLabel,
      projects: sortProjectsByTracking(noCustomer, trackedProjectIds),
    });
  }

  return result;
};
