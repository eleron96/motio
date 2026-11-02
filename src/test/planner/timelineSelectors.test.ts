import { describe, expect, it } from 'vitest';
import { Assignee, Filters, Project, Task } from '@/features/planner/types/planner';
import {
  buildTimelineDisplayRows,
  groupTasksByTimelineRow,
  selectFilteredTasks,
  selectTimelineGroupItems,
  selectVisibleAssignees,
} from '@/features/planner/lib/timelineSelectors';

const makeTask = (overrides: Partial<Task>): Task => ({
  id: 'task-id',
  title: 'Task',
  projectId: null,
  assigneeIds: [],
  startDate: '2026-02-20',
  endDate: '2026-02-20',
  statusId: 'status-1',
  typeId: 'type-1',
  priority: null,
  tagIds: [],
  description: null,
  repeatId: null,
  ...overrides,
});

const makeAssignee = (overrides: Partial<Assignee>): Assignee => ({
  id: 'assignee-id',
  name: 'Assignee',
  isActive: true,
  email: null,
  phone: null,
  ...overrides,
});

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

describe('timelineSelectors', () => {
  it('filters tasks by combined planner filters and group mapping', () => {
    const assignees = [
      makeAssignee({ id: 'a1', name: 'Ann', isActive: true }),
      makeAssignee({ id: 'a2', name: 'Bob', isActive: true }),
    ];
    const tasks = [
      makeTask({ id: 't1', projectId: 'p1', assigneeIds: ['a1'], statusId: 's1', typeId: 'type-a', tagIds: ['tag-1'] }),
      makeTask({ id: 't2', projectId: 'p2', assigneeIds: ['a2'], statusId: 's1', typeId: 'type-a', tagIds: ['tag-1'] }),
      makeTask({ id: 't3', projectId: null, assigneeIds: [], statusId: 's1', typeId: 'type-a', tagIds: [] }),
      makeTask({ id: 't4', projectId: 'p1', assigneeIds: ['a1'], statusId: 's2', typeId: 'type-b', tagIds: ['tag-2'] }),
    ];

    const filtered = selectFilteredTasks(
      tasks,
      makeFilters({
        projectIds: ['p1'],
        assigneeIds: ['a1'],
        groupIds: ['g1'],
        statusIds: ['s1'],
        typeIds: ['type-a'],
        tagIds: ['tag-1'],
      }),
      new Map([['a1', 'g1'], ['a2', 'g2']]),
      assignees,
    );

    expect(filtered.map((task) => task.id)).toEqual(['t1']);

    const withoutUnassigned = selectFilteredTasks(
      tasks,
      makeFilters({ hideUnassigned: true }),
      new Map([['a1', 'g1']]),
      assignees,
    );
    expect(withoutUnassigned.some((task) => task.id === 't3')).toBe(false);
  });

  it('hides tasks assigned only to disabled assignees', () => {
    const assignees = [
      makeAssignee({ id: 'a1', name: 'Ann', isActive: true }),
      makeAssignee({ id: 'a2', name: 'Bob', isActive: false }),
    ];
    const tasks = [
      makeTask({ id: 'disabled-only', assigneeIds: ['a2'] }),
      makeTask({ id: 'mixed', assigneeIds: ['a1', 'a2'] }),
      makeTask({ id: 'active-only', assigneeIds: ['a1'] }),
      makeTask({ id: 'unassigned', assigneeIds: [] }),
    ];

    const filtered = selectFilteredTasks(tasks, makeFilters(), new Map(), assignees);
    expect(filtered.map((task) => task.id)).toEqual(['mixed', 'active-only', 'unassigned']);
  });

  it('applies assignee and group filters only in assignee mode', () => {
    const assignees = [
      makeAssignee({ id: 'a1', name: 'Ann' }),
      makeAssignee({ id: 'a2', name: 'Bob' }),
      makeAssignee({ id: 'a3', name: 'Cara' }),
    ];
    const filters = makeFilters({ assigneeIds: ['a1', 'a3'], groupIds: ['g1'] });
    const map = new Map([['a1', 'g1'], ['a2', 'g2']]);

    const assigneeMode = selectVisibleAssignees({
      groupMode: 'assignee',
      filteredAssignees: assignees,
      filters,
      assigneeGroupMap: map,
    });
    expect(assigneeMode.map((assignee) => assignee.id)).toEqual(['a1']);

    const projectMode = selectVisibleAssignees({
      groupMode: 'project',
      filteredAssignees: assignees,
      filters,
      assigneeGroupMap: map,
    });
    expect(projectMode.map((assignee) => assignee.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('builds timeline groups, row lanes and display rows', () => {
    const assignees = [
      makeAssignee({ id: 'a2', name: 'Bob' }),
      makeAssignee({ id: 'a1', name: 'Ann' }),
      makeAssignee({ id: 'a3', name: 'Mike' }),
    ];
    const projects = [
      makeProject({ id: 'p1', name: 'Alpha', code: 'AL' }),
      makeProject({ id: 'p2', name: 'Beta', code: null }),
    ];

    const assigneeGroups = selectTimelineGroupItems({
      groupMode: 'assignee',
      visibleAssignees: assignees,
      projects,
      myAssigneeId: 'a3',
    });
    expect(assigneeGroups.map((group) => group.id)).toEqual(['a3', 'a1', 'a2']);

    const projectGroups = selectTimelineGroupItems({
      groupMode: 'project',
      visibleAssignees: assignees,
      projects,
      myAssigneeId: null,
    });
    expect(projectGroups.map((group) => group.name)).toEqual(['[AL] Alpha', 'Beta']);

    const rowTasks = groupTasksByTimelineRow({
      filteredTasks: [
        makeTask({ id: 'shared', assigneeIds: ['a1', 'a2'], startDate: '2026-02-20', endDate: '2026-02-22' }),
        makeTask({ id: 'a1-only', assigneeIds: ['a1'], startDate: '2026-02-21', endDate: '2026-02-23' }),
        makeTask({ id: 'no-assignee', assigneeIds: [] }),
      ],
      groupItems: assigneeGroups,
      groupMode: 'assignee',
    });

    expect(rowTasks.a1.map((task) => task.id)).toEqual(['shared', 'a1-only']);
    expect(rowTasks.a2.map((task) => task.id)).toEqual(['shared']);
    expect(rowTasks.unassigned.map((task) => task.id)).toEqual(['no-assignee']);

    const heights = { a1: 104, a2: 60, a3: 60, unassigned: 60 };

    const displayRows = buildTimelineDisplayRows({
      groupItems: assigneeGroups,
      tasksByRow: rowTasks,
      rowHeights: heights,
      groupMode: 'assignee',
      assigneeFilterCount: 0,
      hideUnassigned: false,
      labels: {
        unassigned: 'Unassigned',
        noProject: 'No project',
      },
      minRowHeight: 56,
      assigneeRowGap: 20,
    });
    expect(displayRows.map((row) => row.id)).toEqual(['a3', 'a1', 'a2', 'unassigned']);

    const hiddenUnassignedRows = buildTimelineDisplayRows({
      groupItems: assigneeGroups,
      tasksByRow: rowTasks,
      rowHeights: heights,
      groupMode: 'assignee',
      assigneeFilterCount: 1,
      hideUnassigned: true,
      labels: {
        unassigned: 'Unassigned',
        noProject: 'No project',
      },
      minRowHeight: 56,
      assigneeRowGap: 20,
    });
    expect(hiddenUnassignedRows.some((row) => row.id === 'unassigned')).toBe(false);
  });

  it('packs task lanes around the reserved period, per row', () => {
    const rowTasks = groupTasksByTimelineRow({
      filteredTasks: [
        makeTask({ id: 'before', assigneeIds: ['a1'], startDate: '2026-08-01', endDate: '2026-08-05' }),
        makeTask({ id: 'during', assigneeIds: ['a1'], startDate: '2026-08-12', endDate: '2026-08-14' }),
        // Same dates, different person — nobody reserved a lane in that row.
        makeTask({ id: 'other', assigneeIds: ['a2'], startDate: '2026-08-12', endDate: '2026-08-14' }),
      ],
      groupItems: [
        { id: 'a1', name: 'A1', color: undefined },
        { id: 'a2', name: 'A2', color: undefined },
      ],
      groupMode: 'assignee',
      reservedLaneZeroByRow: { a1: [{ startDate: '2026-08-10', endDate: '2026-08-23' }] },
    });

    expect(rowTasks.a1.find((task) => task.id === 'before')?.lane).toBe(0);
    expect(rowTasks.a1.find((task) => task.id === 'during')?.lane).toBe(1);
    expect(rowTasks.a2.find((task) => task.id === 'other')?.lane).toBe(0);
  });
});
