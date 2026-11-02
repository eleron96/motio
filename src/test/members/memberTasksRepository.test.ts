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

import { fetchAssigneeTasks } from '@/infrastructure/members/memberTasksRepository';

type QueryResponse = {
  data: unknown[] | null;
  count?: number | null;
  error: { message: string } | null;
};

const createBuilder = (response: QueryResponse) => {
  const log = {
    gteCalls: [] as Array<[string, string]>,
    ltCalls: [] as Array<[string, string]>,
    lteCalls: [] as Array<[string, string]>,
    inCalls: [] as Array<[string, string[]]>,
    orCalls: [] as string[],
    orderCalls: [] as Array<[string, boolean]>,
    rangeCalls: [] as Array<[number, number]>,
  };

  const builder = {
    abortSignal: () => builder,
    eq: () => builder,
    gte: (column: string, value: string) => {
      log.gteCalls.push([column, value]);
      return builder;
    },
    lt: (column: string, value: string) => {
      log.ltCalls.push([column, value]);
      return builder;
    },
    lte: (column: string, value: string) => {
      log.lteCalls.push([column, value]);
      return builder;
    },
    in: (column: string, values: string[]) => {
      log.inCalls.push([column, values]);
      return builder;
    },
    ilike: () => builder,
    or: (filters: string) => {
      log.orCalls.push(filters);
      return builder;
    },
    order: (column: string, options: { ascending: boolean }) => {
      log.orderCalls.push([column, options.ascending]);
      return builder;
    },
    range: (from: number, to: number) => {
      log.rangeCalls.push([from, to]);
      return Promise.resolve(response);
    },
    then: (
      resolve: (value: QueryResponse) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(response).then(resolve, reject),
  };

  return { builder, log };
};

const createTaskRow = (id: string, overrides: Partial<Record<string, unknown>> = {}) => ({
  id,
  title: 'Task',
  project_id: 'p1',
  assignee_id: 'a1',
  assignee_ids: ['a1'],
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

const baseParams = {
  workspaceId: 'w1',
  assigneeId: 'a1',
  pastFromDate: '',
  pastToDate: '',
  pastSort: 'end_desc' as const,
  statusFilterIds: [],
  projectFilterIds: [],
  search: '',
  pageIndex: 1,
  pageSize: 50,
};

describe('memberTasksRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('treats tasks ending today as current and loads them without pagination', async () => {
    const taskQuery = createBuilder({ data: [createTaskRow('task-1')], count: 1, error: null });
    supabaseMocks.from.mockReturnValue({ select: () => taskQuery.builder });

    const result = await fetchAssigneeTasks({ ...baseParams, taskScope: 'current' });
    const today = format(new Date(), 'yyyy-MM-dd');

    expect(result?.totalCount).toBe(1);
    expect(taskQuery.log.gteCalls).toEqual([['end_date', today]]);
    expect(taskQuery.log.ltCalls).toEqual([]);
    expect(taskQuery.log.orCalls).toEqual(['assignee_id.eq.a1,assignee_ids.cs.{a1}']);
    expect(taskQuery.log.orderCalls).toEqual([['start_date', true]]);
    expect(taskQuery.log.rangeCalls).toEqual([]);
  });

  it('treats tasks ending before today as past and applies the past filters', async () => {
    const taskQuery = createBuilder({ data: [createTaskRow('task-2')], count: 7, error: null });
    supabaseMocks.from.mockReturnValue({ select: () => taskQuery.builder });

    const result = await fetchAssigneeTasks({
      ...baseParams,
      taskScope: 'past',
      pastFromDate: '2026-01-01',
      pastToDate: '2026-01-31',
      pastSort: 'title_asc',
      projectFilterIds: ['p1'],
      pageIndex: 2,
    });
    const today = format(new Date(), 'yyyy-MM-dd');

    expect(result?.totalCount).toBe(7);
    expect(taskQuery.log.ltCalls).toEqual([['end_date', today]]);
    expect(taskQuery.log.gteCalls).toEqual([['end_date', '2026-01-01']]);
    expect(taskQuery.log.lteCalls).toEqual([['start_date', '2026-01-31']]);
    expect(taskQuery.log.inCalls).toContainEqual(['project_id', ['p1']]);
    expect(taskQuery.log.orderCalls).toEqual([['title', true]]);
    expect(taskQuery.log.rangeCalls).toEqual([[50, 99]]);
  });
});
