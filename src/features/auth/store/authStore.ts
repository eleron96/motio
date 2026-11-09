import { create } from 'zustand';
import { forgetPersistedSession, supabase } from '@/shared/lib/supabaseClient';
import { useLocaleStore } from '@/shared/store/localeStore';
import { useAccentColorStore } from '@/shared/store/accentColorStore';
import { markRecentSignOut } from '@/features/auth/lib/recentSignOut';
import { broadcastAuthSessionSync } from '@/features/auth/lib/authSessionSync';
import { ADMIN_ACTIONS } from '@/shared/contracts/actions';
import { invokeAdminFunction } from '@/infrastructure/auth/functionsGateway';
import type { AuthState } from '@/features/auth/store/authStore.contract';
import {
  SUPER_ADMIN_PROBE_ATTEMPTS,
  SUPER_ADMIN_PROBE_RETRY_MS,
  getOauth2ProxySignOutPath,
  isTransientSchemaAuthError,
} from '@/features/auth/store/authStore.helpers';
import { createWorkspaceListActions } from '@/features/auth/store/authStore.workspaceActions';
import { createMemberActions } from '@/features/auth/store/authStore.memberActions';
import { createProfileActions } from '@/features/auth/store/authStore.profileActions';
import { useInstanceSettingsStore } from '@/shared/store/instanceSettingsStore';

export type {
  DataExportStatusRow,
  DeletionPreview,
  DeletionPreviewWorkspace,
  DeletionTransfer,
  WorkspaceRole,
} from '@/features/auth/store/authStore.contract';
export { getOauth2ProxySignOutPath, readStoredWorkspaceId } from '@/features/auth/store/authStore.helpers';

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: true,
  signOutRedirectInProgress: false,
  workspaces: [],
  workspacesLoaded: false,
  currentWorkspaceId: null,
  currentWorkspaceRole: null,
  members: [],
  membersWorkspaceId: null,
  membersLoading: false,
  profileDisplayName: null,
  profileLocale: null,
  profileAvatarUrl: null,
  profilePreferences: null,
  profileStatus: 'ACTIVE',
  profilePurgeAfter: null,
  isSuperAdmin: false,
  superAdminLoading: false,
  superAdminCheckFailed: false,
  superAdminSessionExpired: false,
  groupWorkspacesEnabled: false,
  setSession: (session) => {
    const user = session?.user ?? null;
    set({
      session,
      user,
      members: [],
      membersWorkspaceId: null,
      membersLoading: false,
      profileDisplayName: null,
      profileLocale: null,
      profileAvatarUrl: null,
      profilePreferences: null,
      profileStatus: 'ACTIVE',
      profilePurgeAfter: null,
      isSuperAdmin: false,
      groupWorkspacesEnabled: false,
      superAdminLoading: Boolean(user),
      superAdminCheckFailed: false,
      superAdminSessionExpired: false,
    });
  },
  setLoading: (loading) => set({ loading }),
  setSignOutRedirectInProgress: (value) => set({ signOutRedirectInProgress: value }),
  resolveSuperAdmin: async (user) => {
    if (!user) {
      set({ isSuperAdmin: false, superAdminLoading: false, superAdminCheckFailed: false });
      return false;
    }
    set({ superAdminLoading: true, superAdminCheckFailed: false, superAdminSessionExpired: false });
    try {
      // Keycloak is the source of truth: whoami checks the app_super_admin
      // realm role server-side (and syncs the cache table), so granting or
      // revoking the role in Keycloak takes effect on the next sign-in —
      // no in-app admin lists involved.
      //
      // The probe runs once per session, so a single failed call used to lock
      // the console out until a reload: a deploy that restarts the functions
      // container is enough. Retry briefly, and when it still will not answer,
      // record that the check failed instead of pretending the role is absent.
      for (let attempt = 0; attempt < SUPER_ADMIN_PROBE_ATTEMPTS; attempt += 1) {
        const { data, error, status } = await invokeAdminFunction<{
          isSuperAdmin?: boolean;
          groupWorkspaces?: boolean;
          workspacesChanged?: boolean;
          // Server settings the app needs (Admin → Settings), all off by default.
          settings?: Record<string, unknown>;
        }>({
          action: ADMIN_ACTIONS.SUPER_ADMINS_WHOAMI,
        });
        if (status === 401) {
          // The session is not accepted even after a refresh: retrying will
          // not help, only signing in again.
          set({ isSuperAdmin: false, superAdminLoading: false, superAdminSessionExpired: true });
          return false;
        }
        if (!error) {
          // A super admin with workspaces is a regular working account (the
          // owner with the Keycloak role), so their workspace state must stay
          // intact — no reset here. The workspace-less service account is
          // steered to the admin console by the pages' redirect instead.
          const isSuperAdmin = Boolean(data?.isSuperAdmin);
          useInstanceSettingsStore.getState().applyServerValues(data?.settings);
          set({
            isSuperAdmin,
            superAdminLoading: false,
            superAdminCheckFailed: false,
            groupWorkspacesEnabled: Boolean(data?.groupWorkspaces),
          });
          // Workspaces from Keycloak groups: whoami has just put the person
          // into (or out of) workspaces. Reload the list; the load that ran
          // alongside whoami is older and gives way (fetchWorkspaces).
          if (data?.workspacesChanged) {
            void get().fetchWorkspaces().catch(() => undefined);
          }
          return isSuperAdmin;
        }
        if (attempt < SUPER_ADMIN_PROBE_ATTEMPTS - 1) {
          await new Promise((resolve) => {
            setTimeout(resolve, SUPER_ADMIN_PROBE_RETRY_MS * (attempt + 1));
          });
        }
      }
      set({ isSuperAdmin: false, superAdminLoading: false, superAdminCheckFailed: true });
      return false;
    } catch (_error) {
      set({ isSuperAdmin: false, superAdminLoading: false, superAdminCheckFailed: true });
      return false;
    }
  },
  signIn: async (email, password) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (!error) return {};
      if (attempt === 0 && isTransientSchemaAuthError(error.message)) {
        await new Promise((resolve) => setTimeout(resolve, 700));
        continue;
      }
      return { error: error.message };
    }
    return { error: 'Authentication failed.' };
  },
  signInWithKeycloak: async (redirectTo, options) => {
    const destination = redirectTo
      ?? (typeof window !== 'undefined' ? `${window.location.origin}/auth` : undefined);
    const locale = useLocaleStore.getState().locale;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'keycloak',
      options: {
        ...(destination ? { redirectTo: destination } : {}),
        scopes: 'openid profile email',
        queryParams: {
          ...(locale ? { ui_locales: locale } : {}),
          ...(options?.forceLogin ? { prompt: 'login' } : {}),
          // OIDC "Initiating User Registration" (Keycloak 26.1+): open the
          // registration form instead of the sign-in form. Wins over
          // forceLogin — a user who explicitly chose "create account" should
          // never land on the login screen.
          ...(options?.register ? { prompt: 'create' } : {}),
        },
      },
    });
    if (error) return { error: error.message };
    return {};
  },
  signUp: async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    return {};
  },
  sendPasswordReset: async (email) => {
    const redirectTo = typeof window !== 'undefined'
      ? `${window.location.origin}/auth`
      : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) return { error: error.message };
    return {};
  },
  updatePassword: async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { error: error.message };
    return {};
  },
  signOut: async () => {
    set({ signOutRedirectInProgress: true });
    markRecentSignOut();
    broadcastAuthSessionSync('signed-out');
    const { error: globalSignOutError } = await supabase.auth.signOut({ scope: 'global' });
    if (globalSignOutError) {
      const localSignOut = await supabase.auth.signOut({ scope: 'local' }).catch((error: unknown) => ({ error }));
      // Both fail when the auth server no longer knows the session; the
      // stored one must still go, or the person stays signed in.
      if (localSignOut.error) {
        forgetPersistedSession();
      }
    }
    set({
      user: null,
      session: null,
      workspaces: [],
      workspacesLoaded: false,
      currentWorkspaceId: null,
      currentWorkspaceRole: null,
      members: [],
      membersWorkspaceId: null,
      membersLoading: false,
      profileDisplayName: null,
      profileLocale: null,
      profilePreferences: null,
      isSuperAdmin: false,
      groupWorkspacesEnabled: false,
      superAdminLoading: false,
      signOutRedirectInProgress: true,
    });

    // Reset the accent to the default so one account's color doesn't linger.
    useAccentColorStore.getState().setAccentFromProfile(null);

    if (typeof window !== 'undefined') {
      const oauth2ProxyEnabled = import.meta.env.VITE_OAUTH2_PROXY_ENABLED === 'true';
      if (oauth2ProxyEnabled) {
        window.location.replace(getOauth2ProxySignOutPath());
        return;
      }
      window.location.replace('/');
      return;
    }
    set({ signOutRedirectInProgress: false });
  },
  ...createWorkspaceListActions(set, get),
  ...createMemberActions(set, get),
  ...createProfileActions(set, get),
}));
