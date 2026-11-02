import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@lingui/macro', () => ({
  t: (first: TemplateStringsArray | { message: string }, ...values: unknown[]) => (
    Array.isArray(first)
      ? (first as TemplateStringsArray).reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
      : (first as { message: string }).message
  ),
}));

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  applyPayload: vi.fn(),
  calls: [] as string[],
}));

vi.mock('@/shared/lib/supabaseClient', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mocks.rpc(...args),
    from: vi.fn(),
    auth: { onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })) },
  },
}));

vi.mock('@/infrastructure/workspace/starterTemplateRepository', () => ({
  applyStarterTemplatePayload: (...args: unknown[]) => mocks.applyPayload(...args),
}));

const { useAuthStore } = await import('@/features/auth/store/authStore');

describe('createWorkspace with a starting point', () => {
  beforeEach(() => {
    mocks.calls = [];
    mocks.rpc.mockReset();
    mocks.rpc.mockImplementation(async (name: string) => {
      mocks.calls.push(name);
      return { data: 'ws-new', error: null };
    });
    mocks.applyPayload.mockReset();
    mocks.applyPayload.mockImplementation(async () => {
      mocks.calls.push('apply');
      return {};
    });
    useAuthStore.setState({
      fetchWorkspaces: vi.fn(async () => { mocks.calls.push('fetch'); }),
      setCurrentWorkspaceId: vi.fn(() => { mocks.calls.push('switch'); }),
    });
  });

  /**
   * The template goes in before the switch, so the new workspace opens
   * already filled in rather than flashing the chooser first.
   */
  it('lays the chosen template in before opening the new workspace', async () => {
    await useAuthStore.getState().createWorkspace('Site crews', 'construction');

    expect(mocks.rpc).toHaveBeenCalledWith('create_workspace', expect.objectContaining({
      workspace_name: 'Site crews',
      p_await_template: true,
    }));
    const [workspaceId, payload] = mocks.applyPayload.mock.calls[0] as [string, { projects: unknown[] }];
    expect(workspaceId).toBe('ws-new');
    expect(payload.projects).toHaveLength(3);
    expect(mocks.calls).toEqual(['create_workspace', 'apply', 'fetch', 'switch']);
  });

  it('asks for no template when the own saved set is chosen', async () => {
    await useAuthStore.getState().createWorkspace('Mine', 'own');

    expect(mocks.rpc).toHaveBeenCalledWith('create_workspace', expect.objectContaining({ p_await_template: false }));
    expect(mocks.applyPayload).not.toHaveBeenCalled();
  });

  it('still opens the workspace when the template fails, which then keeps waiting for one', async () => {
    mocks.applyPayload.mockResolvedValue({ error: 'boom' });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await useAuthStore.getState().createWorkspace('Studio', 'design');

    expect(result).toEqual({});
    expect(useAuthStore.getState().setCurrentWorkspaceId).toHaveBeenCalledWith('ws-new');
  });
});
