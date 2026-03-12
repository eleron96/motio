import { beforeEach, describe, expect, it, vi } from 'vitest';
import { format } from 'date-fns';

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('@/shared/lib/supabaseClient', () => ({
  supabase: {
    from: supabaseMocks.from,
  },
}));

import { fetchProjectTasks } from '@/infrastructure/projects/projectTasksRepository';

type QueryResponse = {
  data: unknown[] | null;
  count?: number | null;
  error: { message: string } | null;
};

type BuilderLog = {
  selectArgs: Array<{ columns: string; options?: { count?: 'exact' } }>;
  eqCalls: Array<[string, string]>;
  gteCalls: Array<[string, string]>;
  ltCalls: Array<[string, string]>;
  lteCalls: Array<[string, string]>;
  inCalls: Array<[string, string[]]>;
  ilikeCalls: Array<[string, string]>;
  orCalls: string[];
  orderCalls: Array<[string, boolean]>;
  rangeCalls: Array<[number, number]>;
  abortSignals: number;
};

const createBuilder = (response: QueryResponse) => {
  const log: BuilderLog = {
    selectArgs: [],
    eqCalls: [],
    gteCalls: [],
    ltCalls: [],
    lteCalls: [],
    inCalls: [],
    ilikeCalls: [],
    orCalls: [],
    orderCalls: [],
    rangeCalls: [],
    abortSignals: 0,
  };

  const builder: {
    abortSignal: (signal: AbortSignal) => typeof builder;
    eq: (column: string, value: string) => typeof builder;
    gte: (column: string, value: string) => typeof builder;
    lt: (column: string, value: string) => typeof builder;
    lte: (column: string, value: string) => typeof builder;
    in: (column: string, values: string[]) => typeof builder;
    ilike: (column: string, value: string) => typeof builder;
    or: (filters: string) => typeof builder;
    order: (column: string, options: { ascending: boolean }) => typeof builder;
    range: (from: number, to: number) => Promise<QueryResponse>;
    then: Promise<QueryResponse>['then'];
  } = {
    abortSignal: () => {
      log.abortSignals += 1;
      return builder;
    },
    eq: (column, value) => {
      log.eqCalls.push([column, value]);
      return builder;
    },
    gte: (column, value) => {
      log.gteCalls.push([column, value]);
      return builder;
    },
    lt: (column, value) => {
      log.ltCalls.push([column, value]);
      return builder;
    },
    lte: (column, value) => {
      log.lteCalls.push([column, value]);
      return builder;
    },
    in: (column, values) => {
      log.inCalls.push([column, values]);
      return builder;
    },
    ilike: (column, value) => {
      log.ilikeCalls.push([column, value]);
      return builder;
    },
    or: (filters) => {
      log.orCalls.push(filters);
      return builder;
    },
    order: (column, options) => {
      log.orderCalls.push([column, options.ascending]);
      return builder;
    },
    range: (from, to) => {
      log.rangeCalls.push([from, to]);
      return Promise.resolve(response);
    },
    then: (resolve, reject) => Promise.resolve(response).then(resolve, reject),
  };

  return { builder, log };
};

const createTaskRow = (id: string, overrides: Partial<Record<string, unknown>> = {}) => ({
  id,
  title: 'Task',
  project_id: 'p1',
  assignee_id: 'a1',
  assignee_ids: ['a2'],
  start_date: '2026-03-10',
  end_date: '2026-03-12',
  status_id: 's1',
  type_id: 'type-1',
  priority: null,
  tag_ids: [],
  description: null,
  repeat_id: null,
  ...overrides,
});

describe('projectTasksRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads current project tasks without pagination and extracts available assignees', async () => {
    const assigneeQuery = createBuilder({
      data: [{ assignee_id: 'a1', assignee_ids: ['a2'] }],
      error: null,
    });
    const taskQuery = createBuilder({
      data: [createTaskRow('task-1')],
      count: 1,
      error: null,
    });
    const queued = [assigneeQuery, taskQuery];

    supabaseMocks.from.mockImplementation((table: string) => {
      expect(table).toBe('tasks');
      return {
        select: (columns: string, options?: { count?: 'exact' }) => {
          const next = queued.shift();
          if (!next) {
            throw new Error('Missing queued builder');
          }
          next.log.selectArgs.push({ columns, options });
          return next.builder;
        },
      };
    });

    const result = await fetchProjectTasks({
      workspaceId: 'w1',
      projectId: 'p1',
      taskScope: 'current',
      pastFromDate: '',
      pastToDate: '',
      pastSort: 'end_desc',
      statusFilterIds: [],
      assigneeFilterIds: [],
      search: '',
      pageIndex: 1,
      pageSize: 100,
      signal: new AbortController().signal,
    });

    const today = format(new Date(), 'yyyy-MM-dd');

    expect(result.totalCount).toBe(1);
    expect(result.availableAssigneeIds).toEqual(['a1', 'a2']);
    expect(result.tasks[0].id).toBe('task-1');
    expect(taskQuery.log.gteCalls).toContainEqual(['end_date', today]);
    expect(taskQuery.log.rangeCalls).toEqual([]);
    expect(taskQuery.log.orderCalls).toContainEqual(['start_date', true]);
  });

  it('loads paginated past tasks with past filters and assignee matching', async () => {
    const assigneeQuery = createBuilder({
      data: [],
      error: null,
    });
    const taskQuery = createBuilder({
      data: [createTaskRow('task-2', { title: 'Archive docs', end_date: '2026-01-15' })],
      count: 5,
      error: null,
    });
    const queued = [assigneeQuery, taskQuery];

    supabaseMocks.from.mockImplementation(() => ({
      select: (columns: string, options?: { count?: 'exact' }) => {
        const next = queued.shift();
        if (!next) {
          throw new Error('Missing queued builder');
        }
        next.log.selectArgs.push({ columns, options });
        return next.builder;
      },
    }));

    const result = await fetchProjectTasks({
      workspaceId: 'w1',
      projectId: 'p1',
      taskScope: 'past',
      pastFromDate: '2026-01-01',
      pastToDate: '2026-01-31',
      pastSort: 'title_asc',
      statusFilterIds: ['s1'],
      assigneeFilterIds: ['a1', 'a2'],
      search: 'docs',
      pageIndex: 2,
      pageSize: 50,
      signal: new AbortController().signal,
    });

    const today = format(new Date(), 'yyyy-MM-dd');

    expect(result.totalCount).toBe(5);
    expect(taskQuery.log.ltCalls).toContainEqual(['end_date', today]);
    expect(taskQuery.log.gteCalls).toContainEqual(['end_date', '2026-01-01']);
    expect(taskQuery.log.lteCalls).toContainEqual(['start_date', '2026-01-31']);
    expect(taskQuery.log.inCalls).toContainEqual(['status_id', ['s1']]);
    expect(taskQuery.log.ilikeCalls).toContainEqual(['title', '%docs%']);
    expect(taskQuery.log.orCalls).toEqual([
      'assignee_id.eq.a1,assignee_ids.cs.{a1},assignee_id.eq.a2,assignee_ids.cs.{a2}',
    ]);
    expect(assigneeQuery.log.orCalls).toEqual([]);
    expect(taskQuery.log.orderCalls).toContainEqual(['title', true]);
    expect(taskQuery.log.rangeCalls).toEqual([[50, 99]]);
  });
});
