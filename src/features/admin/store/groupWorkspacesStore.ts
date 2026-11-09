import { create } from 'zustand';
import { ADMIN_ACTIONS } from '@/shared/contracts/actions';
import { invokeAdminFunction } from '@/infrastructure/auth/functionsGateway';
import type { WorkspaceRole } from '@/features/auth/store/authStore';

// Admin console → Group access: which Keycloak group puts people into which workspace
// (self-hosted installs with KEYCLOAK_WORKSPACES_FROM_GROUPS=true).

export type GroupWorkspaceMapping = {
  id: string;
  groupPath: string;
  workspaceId: string;
  workspaceName: string | null;
  role: WorkspaceRole;
  createdAt: string;
};

type GroupWorkspacesList = {
  enabled: boolean;
  removeEnabled: boolean;
  // groups.syncRoles: a group change also changes the role it gave.
  syncRoles: boolean;
  mappings: GroupWorkspaceMapping[];
  groups: string[];
  groupsError: string | null;
};

type GroupWorkspacesState = GroupWorkspacesList & {
  loading: boolean;
  loaded: boolean;
  error: string | null;
  load: () => Promise<void>;
  createMapping: (input: { groupPath: string; workspaceId: string; role: WorkspaceRole }) =>
    Promise<{ outcome?: 'created' | 'exists'; error?: string }>;
  deleteMapping: (id: string) => Promise<{ error?: string }>;
};

const empty: GroupWorkspacesList = {
  enabled: false,
  removeEnabled: false,
  syncRoles: false,
  mappings: [],
  groups: [],
  groupsError: null,
};

export const useGroupWorkspacesStore = create<GroupWorkspacesState>((set, get) => ({
  ...empty,
  loading: false,
  loaded: false,
  error: null,
  load: async () => {
    set({ loading: true, error: null });
    const { data, error } = await invokeAdminFunction<GroupWorkspacesList>({
      action: ADMIN_ACTIONS.GROUP_WORKSPACES_LIST,
    });
    if (error || !data) {
      set({ loading: false, loaded: true, error: error ?? null });
      return;
    }
    set({
      loading: false,
      loaded: true,
      enabled: Boolean(data.enabled),
      removeEnabled: Boolean(data.removeEnabled),
      syncRoles: Boolean(data.syncRoles),
      mappings: data.mappings ?? [],
      groups: data.groups ?? [],
      groupsError: data.groupsError ?? null,
    });
  },
  createMapping: async (input) => {
    const { data, error } = await invokeAdminFunction<{ outcome?: 'created' | 'exists' }>({
      action: ADMIN_ACTIONS.GROUP_WORKSPACES_CREATE,
      ...input,
    });
    if (error) return { error };
    await get().load();
    return { outcome: data?.outcome ?? 'created' };
  },
  deleteMapping: async (id) => {
    const { error } = await invokeAdminFunction<{ success?: boolean }>({
      action: ADMIN_ACTIONS.GROUP_WORKSPACES_DELETE,
      id,
    });
    if (error) return { error };
    set((state) => ({ mappings: state.mappings.filter((mapping) => mapping.id !== id) }));
    return {};
  },
}));
