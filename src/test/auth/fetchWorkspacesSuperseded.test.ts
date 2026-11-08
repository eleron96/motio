import { beforeEach, describe, expect, it, vi } from 'vitest';

// whoami can put someone into workspaces from their Keycloak groups while the
// first workspace load is still waiting for it. The reload it starts is the
// one that counts: the older load must neither write its stale list nor create
// a "My Workspace" the person does not need.

const { memberQueries, rpc } = vi.hoisted(() => ({
  memberQueries: [] as Array<Promise<{ data: unknown[]; error: null }>>,
  rpc: vi.fn(),
}));

vi.mock('@/shared/lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => memberQueries.shift() ?? Promise.resolve({ data: [], error: null }),
      }),
    }),
    rpc,
  },
}));

import { useAuthStore } from '@/features/auth/store/authStore';

const designRow = {
  workspace_id: 'w-design',
  role: 'editor',
  workspaces: {
    id: 'w-design',
    name: 'Design',
    holiday_country: null,
    holiday_region: null,
    heatmap_enabled: false,
    heatmap_capacity_per_person: null,
    owner_id: 'someone-else',
    template_pending: false,
  },
};

describe('fetchWorkspaces after whoami changed the workspaces', () => {
  beforeEach(() => {
    rpc.mockReset().mockResolvedValue({ data: null, error: null });
    memberQueries.length = 0;
    useAuthStore.setState({
      user: { id: 'u1' } as never,
      workspaces: [],
      workspacesLoaded: false,
      isSuperAdmin: false,
      superAdminLoading: true,
    });
  });

  it('lets the newer load win and creates no first workspace', async () => {
    // First load: nothing yet. Second load (after the sync): the Design workspace.
    memberQueries.push(Promise.resolve({ data: [], error: null }));
    memberQueries.push(Promise.resolve({ data: [designRow], error: null }));

    const first = useAuthStore.getState().fetchWorkspaces();
    await Promise.resolve();
    const second = useAuthStore.getState().fetchWorkspaces();
    await second;
    useAuthStore.setState({ superAdminLoading: false });
    await first;

    expect(rpc).not.toHaveBeenCalled();
    expect(useAuthStore.getState().workspaces.map((workspace) => workspace.id)).toEqual(['w-design']);
    expect(useAuthStore.getState().currentWorkspaceId).toBe('w-design');
  });

  it('still creates the first workspace when nobody else loads', async () => {
    memberQueries.push(Promise.resolve({ data: [], error: null }));
    useAuthStore.setState({ superAdminLoading: false });

    await useAuthStore.getState().fetchWorkspaces();

    expect(rpc).toHaveBeenCalledWith('ensure_initial_workspace', expect.objectContaining({ p_locale: expect.any(String) }));
  });
});
