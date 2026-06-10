import { describe, expect, it } from 'vitest';
import { enUS } from 'date-fns/locale';
import { Customer, Milestone, Project } from '@/features/planner/types/planner';
import {
  buildGroupedMilestones,
  filterAndSortMilestones,
  filterProjectsByCustomerAndSearch,
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
  it('filters milestones by search and orders them by date', () => {
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

  // Tracking used to bubble starred milestones to the top of the list,
  // hiding the chronology. The star is now purely informational —
  // sorting is strictly by date with the nearest milestone on top.
  it('does not let tracking override chronological order', () => {
    const projects = [
      makeProject({ id: 'tracked', name: 'Tracked one' }),
      makeProject({ id: 'plain', name: 'Plain one' }),
    ];
    const milestones = [
      makeMilestone({ id: 'tracked-late', projectId: 'tracked', date: '2026-03-15' }),
      makeMilestone({ id: 'plain-early', projectId: 'plain', date: '2026-02-01' }),
    ];

    const ordered = filterAndSortMilestones({
      milestones,
      projectById: new Map(projects.map((project) => [project.id, project])),
      customerById: new Map(),
      trackedProjectIdSet: new Set(['tracked']),
      milestoneSearch: '',
      nameSort: 'asc',
    });

    // Earlier date wins even though the other milestone is tracked.
    expect(ordered.map((m) => m.id)).toEqual(['plain-early', 'tracked-late']);
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
      milestoneTab: 'active',
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

  // When the user types into the search box the popover filters get out
  // of the way — otherwise a project that doesn't belong to the active
  // customer/team selection becomes effectively invisible and users have
  // to clear filters by hand to look it up. These tests pin down that
  // bypass behavior so the next refactor doesn't quietly bring it back.
  describe('search bypass', () => {
    const projects = [
      makeProject({ id: 'p1', name: 'Alpha', customerId: 'c1', ownerGroupId: 'g1' }),
      makeProject({ id: 'p2', name: 'Alpha-bis', customerId: 'c2', ownerGroupId: 'g2' }),
      makeProject({ id: 'p3', name: 'Other', customerId: 'c2', ownerGroupId: 'g2' }),
    ];

    it('filterProjectsByCustomerAndSearch ignores customer filter when search is active', () => {
      const noSearch = filterProjectsByCustomerAndSearch(projects, ['c1'], '');
      expect(noSearch.map((p) => p.id)).toEqual(['p1']);

      const searching = filterProjectsByCustomerAndSearch(projects, ['c1'], 'alpha');
      expect(searching.map((p) => p.id)).toEqual(['p1', 'p2']);
    });

    it('filterProjectsByCustomerAndSearch ignores owner group filter when search is active', () => {
      const noSearch = filterProjectsByCustomerAndSearch(projects, [], '', ['g1']);
      expect(noSearch.map((p) => p.id)).toEqual(['p1']);

      const searching = filterProjectsByCustomerAndSearch(projects, [], 'alpha', ['g1']);
      expect(searching.map((p) => p.id)).toEqual(['p1', 'p2']);
    });

    it('filterAndSortMilestones ignores owner group filter when search is active', () => {
      const milestones = [
        makeMilestone({ id: 'm1', title: 'Sprint review', projectId: 'p1', date: '2026-02-01' }),
        makeMilestone({ id: 'm2', title: 'Sprint demo', projectId: 'p2', date: '2026-02-02' }),
        makeMilestone({ id: 'm3', title: 'Other', projectId: 'p3', date: '2026-02-03' }),
      ];
      const projectById = new Map(projects.map((p) => [p.id, p]));
      const customerById = new Map<string, Customer>();

      const noSearch = filterAndSortMilestones({
        milestones,
        projectById,
        customerById,
        trackedProjectIdSet: new Set(),
        milestoneSearch: '',
        nameSort: 'asc',
        ownerGroupFilterIds: ['g1'],
      });
      expect(noSearch.map((m) => m.id)).toEqual(['m1']);

      const searching = filterAndSortMilestones({
        milestones,
        projectById,
        customerById,
        trackedProjectIdSet: new Set(),
        milestoneSearch: 'sprint',
        nameSort: 'asc',
        ownerGroupFilterIds: ['g1'],
      });
      expect(searching.map((m) => m.id)).toEqual(['m1', 'm2']);
    });
  });
});
