import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTaskActions } from '@/features/planner/store/plannerStore.taskActions';
import { mapTaskRow } from '@/shared/domain/taskRowMapper';
import type { TaskRow } from '@/features/planner/store/plannerStore.helpers';

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('@/shared/lib/supabaseClient', () => ({
  supabase: {
    from: supabaseMocks.from,
  },
}));

const makeTasksQueryBuilder = (rows: TaskRow[]) => {
  const filters: Array<(row: TaskRow) => boolean> = [];
  let updatePayload: Partial<TaskRow> | null = null;
  let deleteMode = false;

  const applyFilters = () => rows.filter((row) => filters.every((filter) => filter(row)));
  const cloneRows = (items: TaskRow[]) => items.map((item) => ({ ...item }));

  const resolveList = async () => {
    const matches = applyFilters();

    if (updatePayload) {
      matches.forEach((row) => {
        Object.assign(row, updatePayload);
      });
    }

    if (deleteMode) {
      const matchedIds = new Set(matches.map((row) => row.id));
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (matchedIds.has(rows[index].id)) {
          rows.splice(index, 1);
        }
      }
      return { data: [] as TaskRow[], error: null };
    }

    return { data: cloneRows(matches), error: null };
  };

  const builder = {
    select: vi.fn(() => builder),
    update: vi.fn((payload: Partial<TaskRow>) => {
      updatePayload = payload;
      return builder;
    }),
    delete: vi.fn(() => {
      deleteMode = true;
      return builder;
    }),
    insert: vi.fn(() => {
      throw new Error('insert should not be used in this test');
    }),
    eq: vi.fn((field: keyof TaskRow, value: unknown) => {
      filters.push((row) => row[field] === value);
      return builder;
    }),
    in: vi.fn((field: keyof TaskRow, values: unknown[]) => {
      filters.push((row) => values.includes(row[field]));
      return builder;
    }),
    single: vi.fn(async () => {
      const result = await resolveList();
      return {
        data: result.data[0] ?? null,
        error: result.data[0] ? null : { message: 'Not found.' },
      };
    }),
    then: (resolve: (value: { data: TaskRow[]; error: null }) => void, reject?: (reason?: unknown) => void) => (
      resolveList().then(resolve, reject)
    ),
  };

  return builder;
};

describe('plannerStore.updateRepeatSeries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rebuilds future dates in place when the cadence changes', async () => {
    const dbRows: TaskRow[] = [
      {
        id: 'task-1',
        workspace_id: 'workspace-1',
        title: 'Repeat task',
        project_id: 'project-1',
        assignee_id: null,
        assignee_ids: [],
        start_date: '2026-02-01',
        end_date: '2026-02-01',
        status_id: 'status-1',
        type_id: 'type-1',
        priority: null,
        tag_ids: [],
        description: null,
        repeat_id: 'repeat-1',
      },
      {
        id: 'task-2',
        workspace_id: 'workspace-1',
        title: 'Repeat task',
        project_id: 'project-1',
        assignee_id: null,
        assignee_ids: [],
        start_date: '2026-02-08',
        end_date: '2026-02-08',
        status_id: 'status-1',
        type_id: 'type-1',
        priority: null,
        tag_ids: [],
        description: null,
        repeat_id: 'repeat-1',
      },
    ];

    supabaseMocks.from.mockImplementation((table: string) => {
      if (table !== 'tasks') {
        throw new Error(`Unexpected table ${table}`);
      }
      return makeTasksQueryBuilder(dbRows);
    });

    let state = {
      workspaceId: 'workspace-1',
      tasks: dbRows.map(mapTaskRow),
      assignees: [] as Array<{ id: string; isActive: boolean }>,
      removeTasksByIds: (ids: string[]) => {
        state = {
          ...state,
          tasks: state.tasks.filter((task) => !ids.includes(task.id)),
        };
      },
    };

    const set = (partial: Record<string, unknown> | ((current: typeof state) => Record<string, unknown>)) => {
      const nextPartial = typeof partial === 'function' ? partial(state) : partial;
      state = { ...state, ...nextPartial };
    };
    const get = () => state;

    const actions = createTaskActions(set as never, get as never);
    const result = await actions.updateRepeatSeries('task-1', {
      frequency: 'biweekly',
      ends: 'after',
      count: 2,
    }, 'following');

    expect(result).toEqual({
      updated: 1,
      deleted: 0,
      created: 0,
    });
    expect(dbRows[1].start_date).toBe('2026-02-15');
    expect(dbRows[1].end_date).toBe('2026-02-15');
    expect(state.tasks.find((task) => task.id === 'task-2')?.startDate).toBe('2026-02-15');
  });
});
