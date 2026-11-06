import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/shared/lib/supabaseClient', () => ({ supabase: { from: mocks.from } }));

import { fetchTaskAttribution } from '@/infrastructure/tasks/taskAttributionRepository';

const mockQueries = (
  task: { created_by: string | null; updated_by: string | null } | null,
  profiles: Array<{ id: string; display_name: string | null; status: string | null }>,
) => {
  const taskQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: task, error: null }),
  };
  const profilesQuery = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: profiles, error: null }),
  };
  mocks.from.mockImplementation((table: string) => table === 'tasks' ? taskQuery : profilesQuery);
  return { taskQuery, profilesQuery };
};

describe('task attribution repository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads the creator and last editor using display names without requesting email', async () => {
    const { taskQuery, profilesQuery } = mockQueries(
      { created_by: 'author-1', updated_by: 'author-2' },
      [
        { id: 'author-1', display_name: ' Anna ', status: 'ACTIVE' },
        { id: 'author-2', display_name: 'Max', status: 'ACTIVE' },
      ],
    );

    expect(await fetchTaskAttribution('task-1')).toEqual({ createdByName: 'Anna', updatedByName: 'Max' });
    expect(taskQuery.eq).toHaveBeenCalledWith('id', 'task-1');
    expect(taskQuery.select).toHaveBeenCalledWith('created_by, updated_by');
    expect(profilesQuery.select).toHaveBeenCalledWith('id, display_name, status');
    expect(profilesQuery.in).toHaveBeenCalledWith('id', ['author-1', 'author-2']);
  });

  it('looks up a shared creator/editor only once', async () => {
    const { profilesQuery } = mockQueries(
      { created_by: 'author-1', updated_by: 'author-1' },
      [{ id: 'author-1', display_name: 'Anna', status: 'ACTIVE' }],
    );
    expect(await fetchTaskAttribution('task-1')).toEqual({ createdByName: 'Anna', updatedByName: 'Anna' });
    expect(profilesQuery.in).toHaveBeenCalledWith('id', ['author-1']);
  });

  it('reads attribution only from the version whose date the card displays', async () => {
    const { taskQuery } = mockQueries(null, []);
    const updatedAt = '2026-11-06T12:00:00.000Z';

    expect(await fetchTaskAttribution('task-1', updatedAt)).toEqual({ createdByName: null, updatedByName: null });
    expect(taskQuery.eq).toHaveBeenCalledWith('updated_at', updatedAt);
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it.each([null, { created_by: null, updated_by: null }])('keeps unknown authors empty without a profile query', async (task) => {
    mockQueries(task, []);
    expect(await fetchTaskAttribution('task-1')).toEqual({ createdByName: null, updatedByName: null });
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it('does not expose purged names or substitute a missing profile', async () => {
    mockQueries(
      { created_by: 'author-1', updated_by: 'author-2' },
      [{ id: 'author-1', display_name: 'Former name', status: 'PURGED' }],
    );
    expect(await fetchTaskAttribution('task-1')).toEqual({ createdByName: null, updatedByName: null });
  });

  it('keeps blank names and system edits empty', async () => {
    mockQueries(
      { created_by: 'author-1', updated_by: null },
      [{ id: 'author-1', display_name: '   ', status: 'ACTIVE' }],
    );
    expect(await fetchTaskAttribution('task-1')).toEqual({ createdByName: null, updatedByName: null });
  });

  it('reports a denied task read without attempting a profile read', async () => {
    const { taskQuery } = mockQueries(null, []);
    taskQuery.maybeSingle.mockResolvedValue({ data: null, error: { message: 'Denied' } });
    await expect(fetchTaskAttribution('task-1')).rejects.toThrow('Denied');
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it('reports a failed profile read for the hook to degrade to dates only', async () => {
    const { profilesQuery } = mockQueries({ created_by: 'author-1', updated_by: null }, []);
    profilesQuery.in.mockResolvedValue({ data: null, error: { message: 'Unavailable' } });
    await expect(fetchTaskAttribution('task-1')).rejects.toThrow('Unavailable');
  });
});
