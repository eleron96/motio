import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTaskActions } from '@/features/planner/store/plannerStore.taskActions';
import { mapTaskRow } from '@/shared/domain/taskRowMapper';
import type { TaskRow } from '@/features/planner/store/plannerStore.helpers';

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

const mediaMocks = vi.hoisted(() => ({
  deleteTaskMedia: vi.fn(async () => true),
  deleteTaskMediaBatch: vi.fn(async () => undefined),
}));

vi.mock('@/shared/lib/supabaseClient', () => ({
  supabase: {
    from: supabaseMocks.from,
  },
}));

vi.mock('@/infrastructure/tasks/taskMediaRepository', () => ({
  deleteTaskMedia: mediaMocks.deleteTaskMedia,
  deleteTaskMediaBatch: mediaMocks.deleteTaskMediaBatch,
  // Серверная проверка сирот здесь прозрачна: БД «подтверждает» всех
  // кандидатов, так что ассерты про deleteTaskMediaBatch остаются прежними.
  filterOrphanTaskMediaIds: vi.fn(
    async (_workspaceId: string, candidateIds: string[]) => candidateIds,
  ),
}));

const mediaUrl = (id: string) =>
  `<img src="https://api.motio.dev/functions/v1/task-media/${id}?token=t" />`;

const makeTasksQueryBuilder = (rows: TaskRow[]) => {
  const filters: Array<(row: TaskRow) => boolean> = [];
  let updatePayload: Partial<TaskRow> | null = null;
  let deleteMode = false;
  let selectProjection: string | null = null;

  const applyFilters = () => rows.filter((row) => filters.every((filter) => filter(row)));

  const resolveList = async () => {
    const matches = applyFilters();
    if (updatePayload) {
      matches.forEach((row) => Object.assign(row, updatePayload));
    }
    if (deleteMode) {
      const matchedIds = new Set(matches.map((row) => row.id));
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (matchedIds.has(rows[index].id)) rows.splice(index, 1);
      }
      return { data: [] as TaskRow[], error: null };
    }
    if (selectProjection === 'description') {
      return {
        data: matches.map((row) => ({ description: row.description })) as unknown as TaskRow[],
        error: null,
      };
    }
    return { data: matches.map((row) => ({ ...row })), error: null };
  };

  const builder = {
    select: vi.fn((projection?: string) => {
      if (projection === 'description') selectProjection = 'description';
      return builder;
    }),
    update: vi.fn((payload: Partial<TaskRow>) => {
      updatePayload = payload;
      return builder;
    }),
    delete: vi.fn(() => {
      deleteMode = true;
      return builder;
    }),
    eq: vi.fn((field: keyof TaskRow, value: unknown) => {
      filters.push((row) => row[field] === value);
      return builder;
    }),
    in: vi.fn((field: keyof TaskRow, values: unknown[]) => {
      filters.push((row) => values.includes(row[field]));
      return builder;
    }),
    gte: vi.fn((field: keyof TaskRow, value: string) => {
      filters.push((row) => String(row[field] ?? '') >= value);
      return builder;
    }),
    single: vi.fn(async () => {
      const result = await resolveList();
      return {
        data: result.data[0] ?? null,
        error: result.data[0] ? null : { message: 'Not found.' },
      };
    }),
    then: (
      resolve: (value: { data: unknown; error: null }) => void,
      reject?: (reason?: unknown) => void,
    ) => resolveList().then(resolve, reject),
  };

  return builder;
};

const baseRow = (overrides: Partial<TaskRow>): TaskRow => ({
  id: 'task-x',
  workspace_id: 'workspace-1',
  title: 'Task',
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
  repeat_id: null,
  ...overrides,
});

const makeStoreHarness = (rows: TaskRow[]) => {
  supabaseMocks.from.mockImplementation((table: string) => {
    if (table !== 'tasks') throw new Error(`Unexpected table ${table}`);
    return makeTasksQueryBuilder(rows);
  });

  let state = {
    workspaceId: 'workspace-1',
    tasks: rows.map(mapTaskRow),
    assignees: [] as Array<{ id: string; isActive: boolean }>,
    selectedTaskId: null as string | null,
    highlightedTaskId: null as string | null,
    highlightedTaskRowAssigneeId: null as string | null,
    removeTasksByIds: (ids: string[]) => {
      state = { ...state, tasks: state.tasks.filter((task) => !ids.includes(task.id)) };
    },
  };

  const set = (
    partial: Record<string, unknown> | ((current: typeof state) => Record<string, unknown>),
  ) => {
    const nextPartial = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...nextPartial };
  };
  const get = () => state;

  return { actions: createTaskActions(set as never, get as never), getState: get };
};

describe('plannerStore task-media garbage collection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deleteTask removes orphaned task-media after successful delete', async () => {
    const rows = [
      baseRow({ id: 'task-1', description: `${mediaUrl('m1')}${mediaUrl('m2')}` }),
      baseRow({ id: 'task-2', description: mediaUrl('m2') }), // still references m2
    ];
    const { actions } = makeStoreHarness(rows);

    await actions.deleteTask('task-1');

    expect(mediaMocks.deleteTaskMediaBatch).toHaveBeenCalledTimes(1);
    expect(mediaMocks.deleteTaskMediaBatch).toHaveBeenCalledWith(['m1']);
  });

  it('deleteTasks removes every orphaned media across the batch', async () => {
    const rows = [
      baseRow({ id: 'task-1', description: mediaUrl('m1') }),
      baseRow({ id: 'task-2', description: `${mediaUrl('m2')}${mediaUrl('m3')}` }),
      baseRow({ id: 'task-3', description: mediaUrl('m3') }), // keeps m3 alive
    ];
    const { actions } = makeStoreHarness(rows);

    await actions.deleteTasks(['task-1', 'task-2']);

    expect(mediaMocks.deleteTaskMediaBatch).toHaveBeenCalledTimes(1);
    const argument = (mediaMocks.deleteTaskMediaBatch.mock.calls[0] as unknown[])[0] as string[];
    expect([...argument].sort()).toEqual(['m1', 'm2']);
  });

  it('updateTask removes media that were dropped from the description', async () => {
    const rows = [
      baseRow({ id: 'task-1', description: `${mediaUrl('m1')}${mediaUrl('m2')}` }),
    ];
    const { actions } = makeStoreHarness(rows);

    await actions.updateTask('task-1', { description: mediaUrl('m2') }, 'single');

    expect(mediaMocks.deleteTaskMediaBatch).toHaveBeenCalledTimes(1);
    expect(mediaMocks.deleteTaskMediaBatch).toHaveBeenCalledWith(['m1']);
  });

  it('updateTask does not fire cleanup when description is unchanged', async () => {
    const rows = [
      baseRow({ id: 'task-1', description: mediaUrl('m1'), title: 'Old title' }),
    ];
    const { actions } = makeStoreHarness(rows);

    await actions.updateTask('task-1', { title: 'New title' }, 'single');

    expect(mediaMocks.deleteTaskMediaBatch).not.toHaveBeenCalled();
  });

  it('deleteTaskSeries removes media referenced only inside the deleted series', async () => {
    const rows = [
      baseRow({
        id: 'task-1',
        repeat_id: 'repeat-1',
        start_date: '2026-02-01',
        description: mediaUrl('m1'),
      }),
      baseRow({
        id: 'task-2',
        repeat_id: 'repeat-1',
        start_date: '2026-02-08',
        description: mediaUrl('m2'),
      }),
      baseRow({
        id: 'task-3',
        repeat_id: 'repeat-1',
        start_date: '2026-01-25',
        description: mediaUrl('m1'),
      }),
    ];
    const { actions } = makeStoreHarness(rows);

    await actions.deleteTaskSeries('repeat-1', '2026-02-01');

    expect(mediaMocks.deleteTaskMediaBatch).toHaveBeenCalledTimes(1);
    expect(mediaMocks.deleteTaskMediaBatch).toHaveBeenCalledWith(['m2']);
  });
});
