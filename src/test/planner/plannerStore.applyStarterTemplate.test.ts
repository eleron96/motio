import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkspaceActions } from '@/features/planner/store/plannerStore.workspaceActions';
import type { StarterTemplatePayload } from '@/shared/domain/starterTemplate';

vi.mock('@lingui/macro', () => ({
  t: (first: TemplateStringsArray | { message: string }, ...values: unknown[]) => (
    Array.isArray(first)
      ? (first as TemplateStringsArray).reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
      : (first as { message: string }).message
  ),
}));

const mocks = vi.hoisted(() => ({
  applyPayload: vi.fn(),
  markApplied: vi.fn(),
}));

vi.mock('@/shared/lib/supabaseClient', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

vi.mock('@/infrastructure/workspace/starterTemplateRepository', () => ({
  applyStarterTemplatePayload: (...args: unknown[]) => mocks.applyPayload(...args),
}));

vi.mock('@/features/auth/store/authStore', () => ({
  useAuthStore: { getState: () => ({ markWorkspaceTemplateApplied: mocks.markApplied }) },
}));

const setup = () => {
  const state = {
    loadedRange: { workspaceId: 'ws-1' } as { workspaceId: string } | null,
    loadWorkspaceData: vi.fn(async () => {}),
    refreshSampleDataFlag: vi.fn(async () => {}),
  };
  const set = vi.fn((patch: Partial<typeof state>) => Object.assign(state, patch));
  const get = () => state;
  // The factory is typed against the whole store; this test touches a sliver of it.
  const actions = createWorkspaceActions(set as never, get as never);
  return { actions, state, set };
};

describe('applyStarterTemplate', () => {
  beforeEach(() => {
    mocks.applyPayload.mockReset();
    mocks.markApplied.mockReset();
  });

  it('sends the chosen template and rereads the whole window, catalogs included', async () => {
    mocks.applyPayload.mockResolvedValue({});
    const { actions, state } = setup();

    const result = await actions.applyStarterTemplate('ws-1', 'construction');

    expect(result).toEqual({});
    const [workspaceId, payload] = mocks.applyPayload.mock.calls[0] as [string, StarterTemplatePayload];
    expect(workspaceId).toBe('ws-1');
    expect(payload.task_types.map((type) => type.name)).toContain('Site work');
    expect(payload.tasks.length).toBeGreaterThan(10);
    expect(mocks.markApplied).toHaveBeenCalledWith('ws-1');
    expect(state.loadedRange).toBeNull();
    expect(state.loadWorkspaceData).toHaveBeenCalledWith('ws-1');
    expect(state.refreshSampleDataFlag).toHaveBeenCalledWith('ws-1');
  });

  it('keeps offering the choice when the database refuses', async () => {
    mocks.applyPayload.mockResolvedValue({ error: 'workspace is not empty' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { actions, state } = setup();

    const result = await actions.applyStarterTemplate('ws-1', 'design');

    expect(result).toEqual({ error: 'workspace is not empty' });
    expect(mocks.markApplied).not.toHaveBeenCalled();
    expect(state.loadWorkspaceData).not.toHaveBeenCalled();
  });
});
