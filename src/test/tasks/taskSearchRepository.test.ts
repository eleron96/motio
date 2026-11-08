import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/shared/lib/supabaseClient', () => ({ supabase: { rpc: mocks.rpc } }));

import { fetchTaskSearchHits } from '@/infrastructure/tasks/taskSearchRepository';

describe('task search repository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('normalizes the query and maps a subtask match to its parent without loading the description', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{
        id: 'task-1', title: 'Parent', project_id: null,
        assignee_id: 'person-1', assignee_ids: ['person-1'],
        start_date: '2030-04-01', end_date: '2030-04-02',
        status_id: 'open', type_id: 'task', priority: null,
        tag_ids: [], repeat_id: null, updated_at: '2026-11-06T12:00:00Z',
        matched_subtask_title: 'Проверить расчёт',
      }],
      error: null,
    });

    const result = await fetchTaskSearchHits('workspace-1', '  Проверить\n  РАСЧЁТ\u00a0');

    expect(mocks.rpc).toHaveBeenCalledWith('search_workspace_tasks', {
      p_workspace_id: 'workspace-1', p_query: 'проверить расчет',
    });
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]).toMatchObject({
      id: 'task-1', title: 'Parent', assigneeIds: ['person-1'],
      startDate: '2030-04-01', matchedSubtaskTitle: 'Проверить расчёт', description: undefined,
    });
  });

  it.each(['', ' ', ' Я ', '\u00a0\n\t'])('does not send a query shorter than two normalized characters: %j', async (query) => {
    expect(await fetchTaskSearchHits('workspace-1', query)).toEqual({ tasks: [] });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('does not request data without a workspace', async () => {
    expect(await fetchTaskSearchHits('', 'review')).toEqual({ tasks: [] });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('passes percent, underscore and backslash literally to the RPC', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    await fetchTaskSearchHits('workspace-1', 'A%_\\B');
    expect(mocks.rpc).toHaveBeenCalledWith('search_workspace_tasks', {
      p_workspace_id: 'workspace-1', p_query: 'a%_\\b',
    });
  });

  it('returns a repository error without pretending it found any tasks', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Unavailable' } });
    expect(await fetchTaskSearchHits('workspace-1', 'review')).toEqual({ tasks: [], error: 'Unavailable' });
  });
});
