import { beforeEach, describe, expect, it, vi } from 'vitest';

// Must be hoisted before any import that transitively pulls in authStore or supabaseClient.
const { functionsInvoke } = vi.hoisted(() => ({
  functionsInvoke: vi.fn(),
}));

vi.mock('@/shared/lib/supabaseClient', () => ({
  supabase: {
    functions: {
      invoke: functionsInvoke,
    },
  },
}));

import { useAuthStore } from '@/features/auth/store/authStore';

const asUser = { id: 'u1' } as never;

describe('resolveSuperAdmin via superAdmins.whoami', () => {
  beforeEach(() => {
    functionsInvoke.mockReset();
    useAuthStore.setState({ isSuperAdmin: false, superAdminLoading: false });
  });

  it('returns false without calling the function when there is no user', async () => {
    const result = await useAuthStore.getState().resolveSuperAdmin(null);
    expect(result).toBe(false);
    expect(functionsInvoke).not.toHaveBeenCalled();
  });

  it('asks the admin function and grants access when whoami confirms the role', async () => {
    functionsInvoke.mockResolvedValue({ data: { isSuperAdmin: true }, error: null });

    const result = await useAuthStore.getState().resolveSuperAdmin(asUser);

    expect(result).toBe(true);
    expect(useAuthStore.getState().isSuperAdmin).toBe(true);
    // Goes through the real gateway, so the whoami action must exist in the
    // admin request contract.
    expect(functionsInvoke).toHaveBeenCalledWith('admin', { body: { action: 'superAdmins.whoami' } });
  });

  it('keeps the working super admin\'s workspaces intact', async () => {
    functionsInvoke.mockResolvedValue({ data: { isSuperAdmin: true }, error: null });
    const workspace = { id: 'w1', name: 'Team', role: 'admin' } as never;
    useAuthStore.setState({ workspaces: [workspace] as never, currentWorkspaceId: 'w1' });

    await useAuthStore.getState().resolveSuperAdmin(asUser);

    // The owner with the Keycloak role keeps working in the app: resolving
    // super-admin must not wipe workspace state (the old service-account
    // behavior).
    expect(useAuthStore.getState().workspaces).toHaveLength(1);
    expect(useAuthStore.getState().currentWorkspaceId).toBe('w1');
  });

  it('denies access when whoami says the role is absent', async () => {
    functionsInvoke.mockResolvedValue({ data: { isSuperAdmin: false }, error: null });

    const result = await useAuthStore.getState().resolveSuperAdmin(asUser);

    expect(result).toBe(false);
    expect(useAuthStore.getState().isSuperAdmin).toBe(false);
  });

  it('fails closed when the admin function errors', async () => {
    functionsInvoke.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const result = await useAuthStore.getState().resolveSuperAdmin(asUser);

    expect(result).toBe(false);
    expect(useAuthStore.getState().isSuperAdmin).toBe(false);
  });
});
