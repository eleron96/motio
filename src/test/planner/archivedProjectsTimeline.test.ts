import { describe, expect, it } from 'vitest';
import {
  selectArchivedProjectIds,
  selectFilteredTasks,
  selectTimelineGroupItems,
} from '@/features/planner/lib/timelineSelectors';
import { filterMilestonesByProjects } from '@/features/planner/lib/timelineMilestoneSelectors';
import type { Assignee, Filters, Milestone, Project, Task } from '@/features/planner/types/planner';

/**
 * Archiving a project takes it off the PROJECT board: no row, no tasks, no
 * milestones. Grouping by people is deliberately untouched — there a task
 * belongs to a person, and hiding it would misreport their workload.
 */

const makeProject = (overrides: Partial<Project>): Project => ({
  id: 'project-id',
  name: 'Project',
  code: null,
  color: '#000000',
  archived: false,
  customerId: null,
  ownerGroupId: null,
  status: null,
  ...overrides,
});

const makeTask = (overrides: Partial<Task>): Task => ({
  id: 'task-id',
  title: 'Task',
  projectId: null,
  assigneeIds: [],
  startDate: '2026-08-10',
  endDate: '2026-08-10',
  statusId: 'status-1',
  typeId: 'type-1',
  priority: null,
  tagIds: [],
  description: null,
  repeatId: null,
  ...overrides,
});

const makeFilters = (overrides?: Partial<Filters>): Filters => ({
  projectIds: [],
  assigneeIds: [],
  groupIds: [],
  statusIds: [],
  typeIds: [],
  tagIds: [],
  hideUnassigned: false,
  ...overrides,
});

const NO_ASSIGNEES: Assignee[] = [];
const NO_GROUPS = new Map<string, string>();

const PROJECTS = [
  makeProject({ id: 'live', name: 'Live' }),
  makeProject({ id: 'old', name: 'Old', archived: true }),
];

const TASKS = [
  makeTask({ id: 't-live', projectId: 'live' }),
  makeTask({ id: 't-old', projectId: 'old' }),
  makeTask({ id: 't-none', projectId: null }),
];

const archivedIds = selectArchivedProjectIds(PROJECTS);

describe('selectArchivedProjectIds', () => {
  it('collects only archived project ids', () => {
    expect([...archivedIds]).toEqual(['old']);
  });
});

describe('selectFilteredTasks — hidden projects', () => {
  it('drops tasks of hidden projects and keeps project-less ones', () => {
    const visible = selectFilteredTasks(TASKS, makeFilters(), NO_GROUPS, NO_ASSIGNEES, {
      hiddenProjectIds: archivedIds,
    });
    expect(visible.map((task) => task.id)).toEqual(['t-live', 't-none']);
  });

  it('hides nothing when no hidden set is passed — the people view keeps every task', () => {
    const visible = selectFilteredTasks(TASKS, makeFilters(), NO_GROUPS, NO_ASSIGNEES);
    expect(visible.map((task) => task.id)).toEqual(['t-live', 't-old', 't-none']);
  });

  it('still applies the explicit project filter alongside', () => {
    const visible = selectFilteredTasks(
      TASKS,
      makeFilters({ projectIds: ['live'] }),
      NO_GROUPS,
      NO_ASSIGNEES,
      { hiddenProjectIds: archivedIds },
    );
    // Задача без проекта проходит любой фильтр по проектам — это давнее правило.
    expect(visible.map((task) => task.id)).toEqual(['t-live', 't-none']);
  });
});

describe('selectTimelineGroupItems — archived projects', () => {
  it('gives an archived project no row on the project board', () => {
    const rows = selectTimelineGroupItems({
      groupMode: 'project',
      visibleAssignees: [],
      projects: PROJECTS,
      myAssigneeId: null,
    });
    expect(rows.map((row) => row.id)).toEqual(['live']);
  });

  it('leaves people grouping alone', () => {
    const rows = selectTimelineGroupItems({
      groupMode: 'assignee',
      visibleAssignees: [{
        id: 'a1', userId: 'u1', name: 'Anna', isActive: true, email: null, phone: null,
      } as Assignee],
      projects: PROJECTS,
      myAssigneeId: null,
    });
    expect(rows.map((row) => row.id)).toEqual(['a1']);
  });
});

describe('filterMilestonesByProjects — hidden projects', () => {
  const milestones = [
    { id: 'm-live', projectId: 'live', date: '2026-08-11', title: 'Live milestone' } as Milestone,
    { id: 'm-old', projectId: 'old', date: '2026-08-12', title: 'Old milestone' } as Milestone,
  ];

  it('drops milestones of hidden projects so no orphan lines stay on the scale', () => {
    const visible = filterMilestonesByProjects(milestones, [], archivedIds);
    expect(visible.map((milestone) => milestone.id)).toEqual(['m-live']);
  });

  it('keeps every milestone when nothing is hidden', () => {
    expect(filterMilestonesByProjects(milestones, [])).toHaveLength(2);
    expect(filterMilestonesByProjects(milestones, [], new Set())).toHaveLength(2);
  });

  it('still applies the explicit project filter on top', () => {
    const visible = filterMilestonesByProjects(milestones, ['live'], archivedIds);
    expect(visible.map((milestone) => milestone.id)).toEqual(['m-live']);
  });
});
