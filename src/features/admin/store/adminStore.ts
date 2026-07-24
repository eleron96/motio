import { create } from 'zustand';
import { supabase } from '@/shared/lib/supabaseClient';
import { ADMIN_ACTIONS } from '@/shared/contracts/actions';
import { invokeAdminFunction } from '@/infrastructure/auth/functionsGateway';
import { useAuthStore, type WorkspaceRole } from '@/features/auth/store/authStore';

export interface AdminUser {
  id: string;
  email: string | null;
  displayName: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  managedWorkspaceCount: number;
  ownedWorkspaceCount: number;
  workspaceCount: number;
  storageObjectsCount: number;
  storageUsedBytes: number;
  workspaces: Array<{ id: string; name: string; role: WorkspaceRole | 'owner' }>;
}

export interface AdminWorkspace {
  id: string;
  name: string;
  ownerId: string;
  ownerEmail: string | null;
  ownerDisplayName: string | null;
  membersCount: number;
  tasksCount: number;
  createdAt: string | null;
}

export interface SuperAdminUser {
  userId: string;
  email: string | null;
  displayName: string | null;
  createdAt: string | null;
}

export interface BackupEntry {
  name: string;
  type: 'daily' | 'manual' | 'pre-restore';
  createdAt: string;
  size: number;
}

interface AdminState {
  adminUsers: AdminUser[];
  adminUsersLoading: boolean;
  adminUsersError: string | null;
  adminWorkspaces: AdminWorkspace[];
  adminWorkspacesLoading: boolean;
  adminWorkspacesError: string | null;
  superAdmins: SuperAdminUser[];
  superAdminsLoading: boolean;
  superAdminsError: string | null;
  backups: BackupEntry[];
  backupsLoading: boolean;
  backupsError: string | null;
  fetchAdminUsers: (search?: string) => Promise<{ error?: string }>;
  fetchAdminWorkspaces: () => Promise<{ error?: string }>;
  updateAdminWorkspace: (workspaceId: string, name: string) => Promise<{ error?: string }>;
  deleteAdminWorkspace: (workspaceId: string) => Promise<{ error?: string }>;
  fetchSuperAdmins: () => Promise<{ error?: string }>;
  createSuperAdmin: (payload: { email: string; displayName?: string }) => Promise<{ error?: string; warning?: string }>;
  deleteSuperAdmin: (userId: string) => Promise<{ error?: string }>;
  fetchBackups: () => Promise<{ error?: string }>;
  createBackup: () => Promise<{ error?: string }>;
  restoreBackup: (name: string) => Promise<{ error?: string }>;
  uploadBackup: (file: File) => Promise<{ error?: string }>;
  downloadBackup: (name: string) => Promise<{ error?: string }>;
  renameBackup: (name: string, nextName: string) => Promise<{ error?: string }>;
  deleteBackup: (name: string) => Promise<{ error?: string }>;
  adminForcePurgeAccount: (
    targetUserId: string,
  ) => Promise<{ data?: { user_id: string; purge_after: string; forced_by: string }; error?: string }>;
  resetAdminState: () => void;
}

const getBackupBaseUrl = () => {
  const base = import.meta.env.VITE_SUPABASE_URL;
  return base ? `${base}/backup` : '';
};

const parseBackupApiError = async (response: Response) => {
  let message = response.statusText || 'Backup request failed.';
  try {
    const body = await response.clone().json();
    if (body && typeof body === 'object' && typeof (body as { error?: string }).error === 'string') {
      message = (body as { error: string }).error;
    }
  } catch (_error) {
    try {
      const text = await response.clone().text();
      if (text) message = text;
    } catch (_innerError) {
      // Ignore parsing errors.
    }
  }
  return message;
};

const callBackupApi = async <T>(token: string | null | undefined, path: string, options?: RequestInit) => {
  if (!token) {
    return { error: 'Not authenticated.' };
  }
  const baseUrl = getBackupBaseUrl();
  if (!baseUrl) {
    return { error: 'Backup service is not configured.' };
  }
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const message = await parseBackupApiError(response);
    return { error: message };
  }

  const data = await response.json().catch(() => ({}));
  return { data: data as T };
};

export const useAdminStore = create<AdminState>((set) => ({
  adminUsers: [],
  adminUsersLoading: false,
  adminUsersError: null,
  adminWorkspaces: [],
  adminWorkspacesLoading: false,
  adminWorkspacesError: null,
  superAdmins: [],
  superAdminsLoading: false,
  superAdminsError: null,
  backups: [],
  backupsLoading: false,
  backupsError: null,
  fetchAdminUsers: async (search) => {
    set({ adminUsersLoading: true, adminUsersError: null });
    const { data, error } = await invokeAdminFunction<{ users: AdminUser[] }>({
      action: ADMIN_ACTIONS.USERS_LIST,
      search: search?.trim(),
      page: 1,
      perPage: 1000,
      loadAll: true,
    });
    if (error) {
      set({ adminUsersLoading: false, adminUsersError: error });
      return { error };
    }
    set({
      adminUsers: data?.users ?? [],
      adminUsersLoading: false,
      adminUsersError: null,
    });
    return {};
  },
  fetchAdminWorkspaces: async () => {
    set({ adminWorkspacesLoading: true, adminWorkspacesError: null });
    const { data, error } = await invokeAdminFunction<{ workspaces: AdminWorkspace[] }>({
      action: ADMIN_ACTIONS.WORKSPACES_LIST,
    });
    if (error) {
      set({ adminWorkspacesLoading: false, adminWorkspacesError: error });
      return { error };
    }
    set({
      adminWorkspaces: data?.workspaces ?? [],
      adminWorkspacesLoading: false,
      adminWorkspacesError: null,
    });
    return {};
  },
  updateAdminWorkspace: async (workspaceId, name) => {
    const { error } = await invokeAdminFunction({
      action: ADMIN_ACTIONS.WORKSPACES_UPDATE,
      workspaceId,
      name,
    });
    if (error) return { error };
    return {};
  },
  deleteAdminWorkspace: async (workspaceId) => {
    const { error } = await invokeAdminFunction({
      action: ADMIN_ACTIONS.WORKSPACES_DELETE,
      workspaceId,
    });
    if (error) return { error };
    return {};
  },
  fetchSuperAdmins: async () => {
    set({ superAdminsLoading: true, superAdminsError: null });
    const { data, error } = await invokeAdminFunction<{ superAdmins: SuperAdminUser[] }>({
      action: ADMIN_ACTIONS.SUPER_ADMINS_LIST,
    });
    if (error) {
      set({ superAdminsLoading: false, superAdminsError: error });
      return { error };
    }
    set({
      superAdmins: data?.superAdmins ?? [],
      superAdminsLoading: false,
      superAdminsError: null,
    });
    return {};
  },
  createSuperAdmin: async (payload) => {
    const { data, error } = await invokeAdminFunction<{ warning?: string }>({
      action: ADMIN_ACTIONS.SUPER_ADMINS_CREATE,
      email: payload.email,
      displayName: payload.displayName,
    });
    if (error) return { error };
    return { warning: data?.warning };
  },
  deleteSuperAdmin: async (userId) => {
    const { error } = await invokeAdminFunction({
      action: ADMIN_ACTIONS.SUPER_ADMINS_DELETE,
      userId,
    });
    if (error) return { error };
    return {};
  },
  fetchBackups: async () => {
    set({ backupsLoading: true, backupsError: null });
    const { data, error } = await callBackupApi<{ backups: BackupEntry[] }>(
      useAuthStore.getState().session?.access_token,
      '/backups',
      { method: 'GET' },
    );
    if (error) {
      set({ backupsLoading: false, backupsError: error });
      return { error };
    }
    set({
      backups: data?.backups ?? [],
      backupsLoading: false,
      backupsError: null,
    });
    return {};
  },
  createBackup: async () => {
    const { data, error } = await callBackupApi<{ backup?: BackupEntry }>(
      useAuthStore.getState().session?.access_token,
      '/backups',
      { method: 'POST' },
    );
    if (error) return { error };
    if (data?.backup) {
      const createdBackup = data.backup;
      set((state) => ({
        backups: [createdBackup, ...state.backups.filter((item) => item.name !== createdBackup.name)],
      }));
    }
    return {};
  },
  restoreBackup: async (name) => {
    const encoded = encodeURIComponent(name);
    const { error } = await callBackupApi(
      useAuthStore.getState().session?.access_token,
      `/backups/${encoded}/restore`,
      { method: 'POST' },
    );
    if (error) return { error };
    return {};
  },
  uploadBackup: async (file) => {
    const token = useAuthStore.getState().session?.access_token;
    if (!token) return { error: 'Not authenticated.' };
    const baseUrl = getBackupBaseUrl();
    if (!baseUrl) return { error: 'Backup service is not configured.' };

    const fileName = file.name.trim();
    if (!fileName) return { error: 'Invalid backup file name.' };

    const response = await fetch(`${baseUrl}/backups/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'X-Backup-Name': fileName,
      },
      body: file,
    });

    if (!response.ok) {
      const message = await parseBackupApiError(response);
      return { error: message };
    }

    const data = await response.json().catch(() => ({})) as { backup?: BackupEntry };
    if (data.backup) {
      set((state) => ({
        backups: [data.backup!, ...state.backups.filter((item) => item.name !== data.backup?.name)],
      }));
    }
    return {};
  },
  downloadBackup: async (name) => {
    const token = useAuthStore.getState().session?.access_token;
    if (!token) return { error: 'Not authenticated.' };
    const baseUrl = getBackupBaseUrl();
    if (!baseUrl) return { error: 'Backup service is not configured.' };
    if (typeof window === 'undefined') return { error: 'Download is only available in browser.' };

    const encoded = encodeURIComponent(name);
    const response = await fetch(`${baseUrl}/backups/${encoded}/download`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const message = await parseBackupApiError(response);
      return { error: message };
    }

    const blob = await response.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 0);
    return {};
  },
  renameBackup: async (name, nextName) => {
    const trimmed = nextName.trim();
    if (!trimmed) return { error: 'Backup name is required.' };

    const encoded = encodeURIComponent(name);
    const { data, error } = await callBackupApi<{ backup?: BackupEntry }>(
      useAuthStore.getState().session?.access_token,
      `/backups/${encoded}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ name: trimmed }),
      },
    );
    if (error) return { error };
    if (data?.backup) {
      set((state) => ({
        backups: [data.backup!, ...state.backups.filter((item) => item.name !== name && item.name !== data.backup?.name)],
      }));
    }
    return {};
  },
  deleteBackup: async (name) => {
    const encoded = encodeURIComponent(name);
    const { error } = await callBackupApi(
      useAuthStore.getState().session?.access_token,
      `/backups/${encoded}`,
      { method: 'DELETE' },
    );
    if (error) return { error };
    set((state) => ({
      backups: state.backups.filter((item) => item.name !== name),
    }));
    return {};
  },
  adminForcePurgeAccount: async (targetUserId) => {
    if (!targetUserId) return { error: 'Target user id is required.' };
    const { data, error } = await supabase.rpc('admin_force_purge_account', {
      target_user_id: targetUserId,
    });
    if (error) return { error: error.message };
    return { data: data as { user_id: string; purge_after: string; forced_by: string } };
  },
  resetAdminState: () => set({
    adminUsers: [],
    adminUsersLoading: false,
    adminUsersError: null,
    adminWorkspaces: [],
    adminWorkspacesLoading: false,
    adminWorkspacesError: null,
    superAdmins: [],
    superAdminsLoading: false,
    superAdminsError: null,
    backups: [],
    backupsLoading: false,
    backupsError: null,
  }),
}));

// Sign-out cleanup: the auth store must not import this one (dependency
// direction is admin -> auth), so instead of signOut resetting these fields
// directly, the admin console state clears itself whenever the auth user
// disappears.
useAuthStore.subscribe((state) => {
  if (!state.user) useAdminStore.getState().resetAdminState();
});
