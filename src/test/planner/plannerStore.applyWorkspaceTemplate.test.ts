import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCatalogActions } from '@/features/planner/store/plannerStore.catalogActions';

vi.mock('@lingui/macro', () => ({
  t: (first: TemplateStringsArray | { message: string }, ...values: unknown[]) => (
    Array.isArray(first)
      ? (first as TemplateStringsArray).reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
      : (first as { message: string }).message
  ),
}));

const inserted = vi.hoisted(() => ({ rows: {} as Record<string, Array<{ name: string }>> }));

vi.mock('@/shared/lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      insert: async (rows: Array<{ name: string }>) => {
        inserted.rows[table] = rows;
        return { error: null };
      },
    }),
    rpc: vi.fn(),
  },
}));

const setup = () => {
  const state = {
    workspaceId: 'ws-1',
    loadedRange: { workspaceId: 'ws-1' } as { workspaceId: string } | null,
    // The usual starting catalogs of an English workspace.
    statuses: [{ name: 'To Do' }, { name: 'In Progress' }, { name: 'Done' }, { name: 'Cancelled' }],
    taskTypes: [{ name: 'Task' }, { name: 'Meeting' }],
    tags: [{ name: 'Urgent' }],
    loadWorkspaceData: vi.fn(async () => {}),
  };
  const set = vi.fn((patch: Partial<typeof state>) => Object.assign(state, patch));
  // The factory is typed against the whole store; this test touches a sliver of it.
  const actions = createCatalogActions(set as never, (() => state) as never);
  return { actions, state };
};

describe('applyWorkspaceTemplate from an industry template', () => {
  beforeEach(() => {
    inserted.rows = {};
  });

  it('adds only the catalogs the workspace lacks and rereads it', async () => {
    const { actions, state } = setup();

    const result = await actions.applyWorkspaceTemplate('software');

    // "In review" is the one status missing; the starting four match by name in any case.
    expect(inserted.rows.statuses?.map((row) => row.name)).toEqual(['In review']);
    expect(inserted.rows.task_types?.map((row) => row.name)).toEqual(['Feature', 'Bug']);
    expect(inserted.rows.tags?.map((row) => row.name)).toEqual(['Backend', 'Frontend', 'Design']);
    expect(result).toEqual({ added: { statuses: 1, taskTypes: 2, tags: 3 } });
    expect(state.loadWorkspaceData).toHaveBeenCalledWith('ws-1');
  });
});
