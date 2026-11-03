import { supabase } from '@/shared/lib/supabaseClient';
import { useLocaleStore } from '@/shared/store/localeStore';
import { workspaceSyncService } from '@/application/workspace/workspaceSyncService';
import { normalizeHolidayRegionCode } from '@/shared/domain/holidayRegion';
import { buildStarterTemplatePayloadFor } from '@/features/workspace/lib/starterTemplates';
import { applyStarterTemplatePayload } from '@/infrastructure/workspace/starterTemplateRepository';
import type {
  AuthGetState,
  AuthSetState,
  AuthState,
  WorkspaceMemberRow,
} from '@/features/auth/store/authStore.contract';
import {
  DEFAULT_WORKSPACE_NAMES,
  SUPER_ADMIN_PROBE_TIMEOUT_MS,
  getWorkspaceStorageKey,
  mapWorkspaceRows,
  normalizeHolidayCountryCode,
  readStoredWorkspaceId,
} from '@/features/auth/store/authStore.helpers';

// The workspaces the person belongs to: the list, the current one, and
// workspace-level settings.
type WorkspaceListActions = Pick<
  AuthState,
  | 'fetchWorkspaces'
  | 'setCurrentWorkspaceId'
  | 'createWorkspace'
  | 'markWorkspaceTemplateApplied'
  | 'deleteWorkspace'
  | 'updateWorkspaceName'
  | 'updateWorkspaceHolidayCountry'
  | 'updateWorkspaceHeatmapEnabled'
  | 'updateWorkspaceHeatmapCapacity'
>;

export const createWorkspaceListActions = (
  set: AuthSetState,
  get: AuthGetState,
): WorkspaceListActions => ({
  fetchWorkspaces: async () => {
    const user = get().user;
    if (!user) return;

    const loadWorkspaces = async () => {
      const { data, error } = await supabase
        .from('workspace_members')
        .select('workspace_id, role, workspaces(id, name, holiday_country, holiday_region, heatmap_enabled, heatmap_capacity_per_person, owner_id, template_pending)')
        .eq('user_id', user.id);

      if (error) {
        console.error(error);
        return null;
      }

      return mapWorkspaceRows((data ?? []) as unknown as WorkspaceMemberRow[]);
    };

    let workspaces = await loadWorkspaces();
    if (!workspaces) return;

    if (workspaces.length === 0) {
      // The provisioning decision below depends on the super-admin probe,
      // which runs concurrently in AuthProvider. It flips superAdminLoading
      // on synchronously before this fetch can reach here, so waiting it out
      // closes the race without sequencing the whole bootstrap.
      const probeDeadline = Date.now() + SUPER_ADMIN_PROBE_TIMEOUT_MS;
      while (get().superAdminLoading && Date.now() < probeDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      // A workspace-less super admin is the break-glass service account: it
      // lives in the admin console, so don't auto-provision "My Workspace"
      // for it. Working super admins (owner with the Keycloak role) come
      // through here with their real workspaces like everyone else.
      if (get().isSuperAdmin) {
        set({
          workspaces: [],
          currentWorkspaceId: null,
          currentWorkspaceRole: null,
          workspacesLoaded: true,
        });
        return;
      }
      // Язык передаём явно: профиль дописывается параллельно этой загрузке,
      // так что читать его на стороне БД было бы гонкой. Стартовые статусы,
      // типы и теги создаются сразу на языке человека.
      const seedLocale = useLocaleStore.getState().locale;
      const { error: ensureError } = await supabase.rpc('ensure_initial_workspace', {
        default_workspace_name: DEFAULT_WORKSPACE_NAMES[seedLocale],
        p_locale: seedLocale,
      });
      if (ensureError) {
        console.error(ensureError);
        return;
      }
      workspaces = await loadWorkspaces();
      if (!workspaces || workspaces.length === 0) return;
    }

    const storedId = readStoredWorkspaceId(user.id);
    const nextId = storedId && workspaces.some((workspace) => workspace.id === storedId)
      ? storedId
      : workspaces[0]?.id ?? null;

    const nextRole = workspaces.find((workspace) => workspace.id === nextId)?.role ?? null;

    set({
      workspaces,
      currentWorkspaceId: nextId,
      currentWorkspaceRole: nextRole,
      workspacesLoaded: true,
    });
  },
  setCurrentWorkspaceId: (id) => {
    const user = get().user;
    if (user && typeof window !== 'undefined') {
      const storageKey = getWorkspaceStorageKey(user.id);
      if (id) {
        window.localStorage.setItem(storageKey, id);
      } else {
        window.localStorage.removeItem(storageKey);
      }
    }
    const role = get().workspaces.find((workspace) => workspace.id === id)?.role ?? null;
    set((state) => ({
      currentWorkspaceId: id,
      currentWorkspaceRole: role,
      members: state.currentWorkspaceId === id ? state.members : [],
      membersWorkspaceId: state.currentWorkspaceId === id ? state.membersWorkspaceId : null,
      membersLoading: state.currentWorkspaceId === id ? state.membersLoading : false,
    }));
  },
  createWorkspace: async (name, start = null) => {
    const { data, error } = await supabase.rpc('create_workspace', {
      workspace_name: name,
      p_locale: useLocaleStore.getState().locale,
      p_await_template: start === null ? null : start !== 'own',
    });
    if (error) return { error: error.message };
    const createdId = typeof data === 'string' ? data : null;

    // Template first, switch second: the new workspace opens already filled
    // in instead of flashing the chooser. Should laying the template in fail,
    // the workspace keeps waiting for one and the chooser offers it again.
    if (createdId && start && start !== 'own') {
      const payload = buildStarterTemplatePayloadFor(start, new Date());
      const applied = payload ? await applyStarterTemplatePayload(createdId, payload) : {};
      if (applied.error) {
        console.error({
          module: 'auth.store',
          action: 'createWorkspace',
          workspaceId: createdId,
          result: 'error',
          message: applied.error,
        });
      }
    }

    await get().fetchWorkspaces();
    if (createdId) {
      get().setCurrentWorkspaceId(createdId);
    }
    return {};
  },
  markWorkspaceTemplateApplied: (workspaceId) => {
    set((state) => ({
      workspaces: state.workspaces.map((workspace) => (
        workspace.id === workspaceId ? { ...workspace, templatePending: false } : workspace
      )),
    }));
  },
  deleteWorkspace: async (workspaceId) => {
    const targetWorkspaceId = workspaceId ?? get().currentWorkspaceId;
    if (!targetWorkspaceId) return { error: 'Workspace not selected.' };

    const { currentWorkspaceId, user } = get();
    const isCurrentWorkspace = currentWorkspaceId === targetWorkspaceId;

    if (isCurrentWorkspace) {
      set({
        currentWorkspaceId: null,
        currentWorkspaceRole: null,
        members: [],
        membersWorkspaceId: null,
        membersLoading: false,
      });
      workspaceSyncService.resetWorkspaceState();

      if (user && typeof window !== 'undefined') {
        const storageKey = getWorkspaceStorageKey(user.id);
        const storedWorkspaceId = window.localStorage.getItem(storageKey);
        if (storedWorkspaceId === targetWorkspaceId) {
          window.localStorage.removeItem(storageKey);
        }
      }
    }

    const { error } = await supabase.rpc('delete_workspace', { workspace_id: targetWorkspaceId });
    if (error) {
      if (isCurrentWorkspace) {
        await get().fetchWorkspaces();
      }
      return { error: error.message };
    }

    await get().fetchWorkspaces();
    return {};
  },
  updateWorkspaceName: async (workspaceId, name) => {
    const trimmedName = name.trim();
    if (!trimmedName) return { error: 'Workspace name cannot be empty.' };

    const { error } = await supabase
      .from('workspaces')
      .update({ name: trimmedName })
      .eq('id', workspaceId);

    if (error) return { error: error.message };

    await get().fetchWorkspaces();
    return {};
  },
  updateWorkspaceHolidayCountry: async (workspaceId, countryCode, regionCode) => {
    const normalizedCode = normalizeHolidayCountryCode(countryCode);

    // Country and region are written together: a region of the previous
    // country would violate workspaces_holiday_region_check.
    const { error } = await supabase
      .from('workspaces')
      .update({
        holiday_country: normalizedCode,
        holiday_region: normalizeHolidayRegionCode(regionCode, normalizedCode),
      })
      .eq('id', workspaceId);

    if (error) return { error: error.message };

    await get().fetchWorkspaces();
    return {};
  },
  updateWorkspaceHeatmapEnabled: async (workspaceId, enabled) => {
    const { error } = await supabase
      .from('workspaces')
      .update({ heatmap_enabled: enabled })
      .eq('id', workspaceId);

    if (error) return { error: error.message };

    await get().fetchWorkspaces();
    return {};
  },
  updateWorkspaceHeatmapCapacity: async (workspaceId, capacity) => {
    const value = capacity !== null && Number.isFinite(capacity) && capacity > 0 ? capacity : null;
    const { error } = await supabase
      .from('workspaces')
      .update({ heatmap_capacity_per_person: value })
      .eq('id', workspaceId);

    if (error) return { error: error.message };

    await get().fetchWorkspaces();
    return {};
  },
});
