import { beforeEach, describe, expect, it, vi } from 'vitest';
import { demoSupabaseClient } from '@/features/demo/lib/demoSupabaseClient';
import { demoStore } from '@/features/demo/lib/demoDataStore';
import type { Row } from '@/features/demo/lib/demoClientCore';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const task = (id: string, title: string, date = '2030-01-01'): Row => ({
  id, workspace_id: demoStore.workspaceId(), title,
  start_date: date, end_date: date, assignee_ids: [], tag_ids: [],
  status_id: 'open', type_id: 'task', description: 'Not searched',
});

const search = async (query: string, workspaceId = demoStore.workspaceId()): Promise<Row[]> => {
  const result = await demoSupabaseClient.rpc('search_workspace_tasks', {
    p_workspace_id: workspaceId, p_query: query,
  });
  expect(result.error).toBeNull();
  return result.data as Row[];
};

describe('demo task search RPC', () => {
  beforeEach(() => {
    demoStore.__reset();
    demoStore.table('tasks').splice(0);
    demoStore.table('task_subtasks').splice(0);
  });

  it('returns parent and subtask matches in date/id order with the first matching subtask', async () => {
    const workspaceId = demoStore.workspaceId();
    demoStore.table('tasks').push(task('b', 'Main needle'), task('a', 'Parent'), task('c', 'Other'));
    demoStore.table('task_subtasks').push(
      { id: 'z', workspace_id: workspaceId, task_id: 'a', title: 'Needle later', position: 2 },
      { id: 'b', workspace_id: workspaceId, task_id: 'a', title: 'Needle second', position: 1 },
      { id: 'a', workspace_id: workspaceId, task_id: 'a', title: 'Needle first', position: 1 },
    );

    const rows = await search('needle');
    expect(rows.map((row) => [row.id, row.matched_subtask_title])).toEqual([
      ['a', 'Needle first'], ['b', null],
    ]);
  });

  it('uses shared case/ё/query-whitespace normalization and literal special characters', async () => {
    const workspaceId = demoStore.workspaceId();
    demoStore.table('tasks').push(task('a', 'Сверить РАСЧЁТ'), task('b', 'Parent'), task('c', 'rate 100x ab'));
    demoStore.table('task_subtasks').push({
      id: 's1', workspace_id: workspaceId, task_id: 'b', title: 'rate 100%_\\ab', position: 0,
    });

    expect((await search('\u00a0Сверить\n\tрасчет\ufeff')).map((row) => row.id)).toEqual(['a']);
    expect((await search('%_\\')).map((row) => row.id)).toEqual(['b']);
  });

  it('caps unique parents after matching, so one parent with many subtasks cannot consume the limit', async () => {
    const workspaceId = demoStore.workspaceId();
    for (let index = 0; index < 205; index += 1) {
      const id = `task-${String(index).padStart(3, '0')}`;
      demoStore.table('tasks').push(task(id, 'Parent'));
      demoStore.table('task_subtasks').push({
        id: `sub-${index}`, workspace_id: workspaceId, task_id: id, title: 'Needle', position: 0,
      });
    }
    for (let index = 0; index < 300; index += 1) {
      demoStore.table('task_subtasks').push({
        id: `extra-${index}`, workspace_id: workspaceId, task_id: 'task-000', title: 'Needle', position: index + 1,
      });
    }

    const rows = await search('needle');
    expect(rows).toHaveLength(200);
    expect(new Set(rows.map((row) => row.id)).size).toBe(200);
    expect(rows[rows.length - 1]?.id).toBe('task-199');
  });

  it('never reads or serializes descriptions', async () => {
    const row = task('a', 'Needle');
    Object.defineProperty(row, 'description', { get: () => { throw new Error('Description was accessed'); } });
    demoStore.table('tasks').push(row);

    const rows = await search('needle');
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty('description');
  });

  it('ignores short queries and records from other workspaces', async () => {
    demoStore.table('tasks').push(task('a', 'Needle'), { ...task('b', 'Needle'), workspace_id: 'another-workspace' });
    demoStore.table('task_subtasks').push({
      id: 'foreign', workspace_id: 'another-workspace', task_id: 'a', title: 'Foreign text', position: 0,
    });

    expect(await search(' n ')).toEqual([]);
    expect(await search('needle', 'another-workspace')).toEqual([]);
    expect((await search('needle')).map((row) => row.id)).toEqual(['a']);
    expect(await search('foreign')).toEqual([]);
  });
});
