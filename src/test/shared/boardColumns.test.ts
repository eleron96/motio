import { describe, expect, it } from 'vitest';
import {
  buildBoardColumns,
  collapseRepeatSeries,
  isBoardTaskOverdue,
  orderBoardStatuses,
  sortBoardCards,
} from '@/shared/domain/boardColumns';
import type { Status, Task } from '@/features/planner/types/planner';
import type { TaskBoardScope } from '@/shared/domain/taskLoadScopes';

const status = (overrides: Partial<Status> & { id: string }): Status => ({
  name: overrides.id,
  emoji: null,
  color: '#999999',
  isFinal: false,
  isCancelled: false,
  ...overrides,
});

const makeTask = (overrides: Partial<Task> & { id: string }): Task => ({
  title: overrides.id,
  projectId: null,
  assigneeIds: [],
  startDate: '2026-10-20',
  endDate: '2026-10-20',
  statusId: 'todo',
  typeId: 'type-1',
  priority: null,
  tagIds: [],
  description: undefined,
  repeatId: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const TODAY = '2026-10-26';

describe('boardColumns', () => {
  it('orders columns: open by creation, then finished, then cancelled', () => {
    const ordered = orderBoardStatuses([
      status({ id: 'done', isFinal: true, createdAt: '2026-01-01T00:00:00Z' }),
      status({ id: 'review', createdAt: '2026-05-01T00:00:00Z' }),
      status({ id: 'cancelled', isCancelled: true, createdAt: '2026-01-01T00:00:00Z' }),
      status({ id: 'todo', createdAt: '2026-01-01T00:00:00Z' }),
      status({ id: 'doing', createdAt: '2026-01-02T00:00:00Z' }),
    ]);
    expect(ordered.map((item) => item.id)).toEqual(['todo', 'doing', 'review', 'done', 'cancelled']);
  });

  it('keeps the incoming order for statuses without a creation date', () => {
    const ordered = orderBoardStatuses([status({ id: 'b' }), status({ id: 'a' })]);
    expect(ordered.map((item) => item.id)).toEqual(['b', 'a']);
  });

  it('collapses a series to the current or next occurrence per status', () => {
    const collapsed = collapseRepeatSeries([
      makeTask({ id: 'past', repeatId: 'r1', startDate: '2026-10-19', endDate: '2026-10-19' }),
      makeTask({ id: 'next', repeatId: 'r1', startDate: '2026-10-27', endDate: '2026-10-27' }),
      makeTask({ id: 'later', repeatId: 'r1', startDate: '2026-11-03', endDate: '2026-11-03' }),
      makeTask({ id: 'done-one', repeatId: 'r1', statusId: 'done', startDate: '2026-10-12', endDate: '2026-10-12' }),
      makeTask({ id: 'single' }),
    ], TODAY);
    expect(collapsed.map((task) => task.id).sort()).toEqual(['done-one', 'next', 'single']);
  });

  it('picks the latest occurrence when the whole series is in the past', () => {
    const collapsed = collapseRepeatSeries([
      makeTask({ id: 'old', repeatId: 'r1', endDate: '2026-09-01' }),
      makeTask({ id: 'recent', repeatId: 'r1', endDate: '2026-10-20' }),
    ], TODAY);
    expect(collapsed.map((task) => task.id)).toEqual(['recent']);
  });

  it('sorts open cards by due date then priority, finished cards by last change', () => {
    const open = sortBoardCards([
      makeTask({ id: 'later', endDate: '2026-11-01' }),
      makeTask({ id: 'low', endDate: '2026-10-25', priority: 'low' }),
      makeTask({ id: 'high', endDate: '2026-10-25', priority: 'high' }),
    ], 'open');
    expect(open.map((task) => task.id)).toEqual(['high', 'low', 'later']);

    const finished = sortBoardCards([
      makeTask({ id: 'older', updatedAt: '2026-10-01T00:00:00Z' }),
      makeTask({ id: 'newer', updatedAt: '2026-10-25T00:00:00Z' }),
    ], 'final');
    expect(finished.map((task) => task.id)).toEqual(['newer', 'older']);
  });

  it('marks only open cards past their end date as overdue', () => {
    expect(isBoardTaskOverdue({ endDate: '2026-10-25' }, 'open', TODAY)).toBe(true);
    expect(isBoardTaskOverdue({ endDate: TODAY }, 'open', TODAY)).toBe(false);
    expect(isBoardTaskOverdue({ endDate: '2026-10-25' }, 'final', TODAY)).toBe(false);
  });

  const statuses = [
    status({ id: 'todo', createdAt: '2026-01-01T00:00:00Z' }),
    status({ id: 'done', isFinal: true, createdAt: '2026-01-01T00:00:00Z' }),
  ];
  const scope: TaskBoardScope = {
    workspaceId: 'ws-1',
    openStatusIds: ['todo'],
    recentlySince: '2026-10-12T00:00:00.000Z',
  };

  it('puts board-scope tasks into their status columns', () => {
    const columns = buildBoardColumns({
      statuses,
      tasks: [
        makeTask({ id: 'open-far', endDate: '2027-03-01' }),
        makeTask({ id: 'done-recent', statusId: 'done', updatedAt: '2026-10-20T00:00:00Z' }),
        makeTask({ id: 'done-old', statusId: 'done', updatedAt: '2026-06-01T00:00:00Z' }),
        makeTask({ id: 'unknown-status', statusId: 'gone' }),
      ],
      scope,
      today: TODAY,
    });
    expect(columns.map((column) => [column.status.id, column.kind, column.tasks.map((task) => task.id)])).toEqual([
      ['todo', 'open', ['open-far']],
      ['done', 'final', ['done-recent']],
    ]);
  });

  it('shows only open tasks while the scope is loading', () => {
    const columns = buildBoardColumns({
      statuses,
      tasks: [makeTask({ id: 'open' }), makeTask({ id: 'done', statusId: 'done', updatedAt: '2026-10-20T00:00:00Z' })],
      scope: null,
      today: TODAY,
    });
    expect(columns.map((column) => column.tasks.map((task) => task.id))).toEqual([['open'], []]);
  });

  it('narrows the columns to the status filter', () => {
    const columns = buildBoardColumns({ statuses, tasks: [], scope, today: TODAY, statusFilterIds: ['done'] });
    expect(columns.map((column) => column.status.id)).toEqual(['done']);
  });
});
