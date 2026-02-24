import { describe, expect, it } from 'vitest';
import { enUS } from 'date-fns/locale';
import { Customer, Milestone, Project } from '@/features/planner/types/planner';
import {
  buildGroupedMilestones,
  filterAndSortMilestones,
  groupProjectsForSidebar,
  splitMilestonesByDate,
} from '@/features/projects/lib/projectsSelectors';

const makeProject = (overrides: Partial<Project>): Project => ({
  id: 'project-id',
  name: 'Project',
  code: null,
  color: '#000000',
  archived: false,
  customerId: null,
  ...overrides,
});

const makeMilestone = (overrides: Partial<Milestone>): Milestone => ({
  id: 'milestone-id',
  title: 'Milestone',
  projectId: 'project-id',
  date: '2026-02-01',
  ...overrides,
});

describe('projectsSelectors', () => {
  it('filters milestones by search and keeps tracked projects first', () => {
    const projects = [
      makeProject({ id: 'p1', name: 'Alpha', customerId: 'c1' }),
      makeProject({ id: 'p2', name: 'Beta', customerId: null }),
    ];
    const customers: Customer[] = [{ id: 'c1', name: 'Acme' }];
    const milestones = [
      makeMilestone({ id: 'm1', title: 'Plan', projectId: 'p2', date: '2026-02-03' }),
      makeMilestone({ id: 'm2', title: 'Kickoff', projectId: 'p1', date: '2026-02-02' }),
      makeMilestone({ id: 'm3', title: 'Align', projectId: 'p1', date: '2026-02-01' }),
    ];

    const ordered = filterAndSortMilestones({
      milestones,
      projectById: new Map(projects.map((project) => [project.id, project])),
      customerById: new Map(customers.map((customer) => [customer.id, customer])),
      trackedProjectIdSet: new Set(['p1']),
      milestoneSearch: '',
      nameSort: 'asc',
    });

    expect(ordered.map((milestone) => milestone.id)).toEqual(['m3', 'm2', 'm1']);

    const searched = filterAndSortMilestones({
      milestones,
      projectById: new Map(projects.map((project) => [project.id, project])),
      customerById: new Map(customers.map((customer) => [customer.id, customer])),
      trackedProjectIdSet: new Set(['p1']),
      milestoneSearch: 'acme',
      nameSort: 'asc',
    });

    expect(searched.map((milestone) => milestone.id)).toEqual(['m3', 'm2']);
  });

  it('builds customer milestone groups with fallback buckets', () => {
    const projects = [
      makeProject({ id: 'p1', name: 'Alpha', customerId: 'c1' }),
      makeProject({ id: 'p2', name: 'Beta', customerId: null }),
    ];
    const sortedCustomers: Customer[] = [{ id: 'c1', name: 'Acme' }];
    const visibleMilestones = [
      makeMilestone({ id: 'm1', projectId: 'p1' }),
      makeMilestone({ id: 'm2', projectId: 'p2' }),
      makeMilestone({ id: 'm3', projectId: 'missing' }),
    ];

    const grouped = buildGroupedMilestones({
      visibleMilestones,
      milestoneGroupBy: 'customer',
      projectById: new Map(projects.map((project) => [project.id, project])),
      projects,
      sortedCustomers,
      trackedProjectIds: ['p1'],
      nameSort: 'asc',
      dateLocale: enUS,
      labels: {
        unknownProject: 'Unknown project',
        noCustomer: 'No customer',
      },
    });

    expect(grouped.map((group) => group.id)).toEqual(['c1', 'none', 'missing-project']);
    expect(grouped.find((group) => group.id === 'none')?.name).toBe('No customer');
    expect(grouped.find((group) => group.id === 'missing-project')?.milestones).toHaveLength(1);
  });

  it('groups projects by customer and keeps tracked projects first inside buckets', () => {
    const projects = [
      makeProject({ id: 'p1', name: 'Alpha', customerId: 'c1' }),
      makeProject({ id: 'p2', name: 'Bravo', customerId: 'c1' }),
      makeProject({ id: 'p3', name: 'Orphan', customerId: null }),
    ];

    const grouped = groupProjectsForSidebar(
      projects,
      true,
      [{ id: 'c1', name: 'Acme' }],
      ['p2'],
      'No customer',
      'All projects',
    );

    expect(grouped.map((group) => group.id)).toEqual(['c1', 'none']);
    expect(grouped[0].projects.map((project) => project.id)).toEqual(['p2', 'p1']);

    const splitByDate = splitMilestonesByDate(
      [
        makeMilestone({ id: 'past', date: '2026-02-01' }),
        makeMilestone({ id: 'active', date: '2026-02-24' }),
      ],
      '2026-02-24',
    );

    expect(splitByDate.active.map((milestone) => milestone.id)).toEqual(['active']);
    expect(splitByDate.past.map((milestone) => milestone.id)).toEqual(['past']);
  });
});
