import { beforeEach, describe, expect, it, vi } from 'vitest';
import { demoSupabaseClient } from '@/features/demo/lib/demoSupabaseClient';
import { demoStore } from '@/features/demo/lib/demoDataStore';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, idx) => acc + str + (values[idx] ?? ''), ''),
}));

type TaskRow = { id: string; title: string; assignee_ids: string[]; assignee_id?: string | null };

const loadAllTasks = async () => {
  const { data } = await demoSupabaseClient
    .from('tasks')
    .select('*')
    .eq('workspace_id', demoStore.workspaceId());
  return data as unknown as TaskRow[];
};

// The member page, urgent tasks and project filters all ask for "tasks of
// this person" this way (memberTasksRepository, urgentTasksRepository).
const personFilter = (assigneeId: string) => `assignee_id.eq.${assigneeId},assignee_ids.cs.{${assigneeId}}`;

describe('demo query builder: or()', () => {
  beforeEach(() => {
    demoStore.__reset();
  });

  it('returns only the tasks of the person asked for, for every seeded person', async () => {
    const all = await loadAllTasks();
    const people = [...new Set(all.flatMap((task) => task.assignee_ids))];
    expect(people.length).toBeGreaterThan(1);

    for (const assigneeId of people) {
      const { data, error } = await demoSupabaseClient
        .from('tasks')
        .select('*')
        .eq('workspace_id', demoStore.workspaceId())
        .or(personFilter(assigneeId));
      expect(error).toBeNull();
      const ids = (data as unknown as TaskRow[]).map((task) => task.id).sort();
      const expected = all.filter((task) => task.assignee_ids.includes(assigneeId)).map((task) => task.id).sort();
      expect(ids).toEqual(expected);
      expect(ids.length).toBeLessThan(all.length);
    }
  });

  it('matches the single-assignee column as well as the array', async () => {
    const all = await loadAllTasks();
    const legacy = all.find((task) => task.assignee_ids.length > 0)!;
    await demoSupabaseClient.from('tasks').update({ assignee_id: 'legacy-person', assignee_ids: [] }).eq('id', legacy.id);

    const { data } = await demoSupabaseClient
      .from('tasks')
      .select('*')
      .or(personFilter('legacy-person'));
    expect((data as unknown as TaskRow[]).map((task) => task.id)).toEqual([legacy.id]);
  });

  it('joins several people with or, as the project filter does', async () => {
    const all = await loadAllTasks();
    const [first, second] = [...new Set(all.flatMap((task) => task.assignee_ids))];
    const { data } = await demoSupabaseClient
      .from('tasks')
      .select('*')
      .or([personFilter(first), personFilter(second)].join(','));
    const expected = all.filter((task) => task.assignee_ids.includes(first) || task.assignee_ids.includes(second));
    expect((data as unknown as TaskRow[]).length).toBe(expected.length);
  });

  it('requires every value of cs to be in the array', async () => {
    const all = await loadAllTasks();
    const shared = all.find((task) => task.assignee_ids.length >= 2);
    const lone = all.find((task) => task.assignee_ids.length === 1)!;
    if (shared) {
      const [a, b] = shared.assignee_ids;
      const { data } = await demoSupabaseClient.from('tasks').select('*').or(`assignee_ids.cs.{${a},${b}}`);
      expect((data as unknown as TaskRow[]).every((task) => task.assignee_ids.includes(a) && task.assignee_ids.includes(b))).toBe(true);
    }
    const { data } = await demoSupabaseClient
      .from('tasks')
      .select('*')
      .or(`assignee_ids.cs.{${lone.assignee_ids[0]},nobody}`);
    expect(data).toEqual([]);
  });

  it('supports eq, neq, in and is', async () => {
    const all = await loadAllTasks();
    const [a, b] = all;

    const byIn = await demoSupabaseClient.from('tasks').select('*').or(`id.in.(${a.id},${b.id})`);
    expect((byIn.data as unknown as TaskRow[]).map((task) => task.id).sort()).toEqual([a.id, b.id].sort());

    const byNeq = await demoSupabaseClient.from('tasks').select('*').or(`id.neq.${a.id}`);
    expect((byNeq.data as unknown as TaskRow[]).length).toBe(all.length - 1);

    // The demo store fills assignee_id with the first person; take it away
    // from one task so exactly that one is null.
    await demoSupabaseClient.from('tasks').update({ assignee_id: null, assignee_ids: [] }).eq('id', b.id);
    const byIsNull = await demoSupabaseClient.from('tasks').select('*').or(`assignee_id.is.null,id.eq.${a.id}`);
    expect((byIsNull.data as unknown as TaskRow[]).map((task) => task.id).sort()).toEqual([a.id, b.id].sort());
  });

  it('applies or to updates and deletes too', async () => {
    const all = await loadAllTasks();
    const target = all[0];
    await demoSupabaseClient.from('tasks').delete().or(`id.eq.${target.id}`);
    const after = await loadAllTasks();
    expect(after.length).toBe(all.length - 1);
    expect(after.some((task) => task.id === target.id)).toBe(false);
  });

  it.each([
    'and(id.eq.1,title.eq.x)',
    'title.ilike.*fix*',
    'not.id.eq.1',
    'assignee_ids.cs.oops',
    'id.in.1,2',
    'id.is.maybe',
  ])('fails like PostgREST on an expression it cannot read: %s', async (expr) => {
    const before = await loadAllTasks();
    const { data, error } = await demoSupabaseClient.from('tasks').select('*').or(expr);
    expect(data).toBeNull();
    expect(error?.code).toBe('PGRST100');

    const deleted = await demoSupabaseClient.from('tasks').delete().or(expr);
    expect(deleted.error?.code).toBe('PGRST100');
    expect((await loadAllTasks()).length).toBe(before.length);
  });
});
