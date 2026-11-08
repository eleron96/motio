import type { StoreApi } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { type Locale } from '@/shared/lib/locale';
import type { WorkspaceStart } from '@/shared/domain/starterTemplate';
import { WorkspaceMemberActivityEntry } from '@/shared/domain/workspaceMemberActivity';

export type InviteDelivery = 'email' | 'in_app';

export type WorkspaceRole = 'viewer' | 'editor' | 'admin';

export type AccountStatus = 'ACTIVE' | 'PENDING_DELETION' | 'PURGED';

export interface DeletionPreviewWorkspace {
  id: string;
  name: string;
  candidates: Array<{ user_id: string; display_name: string | null; role: WorkspaceRole }>;
}

interface DeletionPreviewAutoHandled {
  id: string;
  name: string;
}

export interface DeletionPreview {
  workspacesRequiringAction: DeletionPreviewWorkspace[];
  workspacesAutoHandled: DeletionPreviewAutoHandled[];
  pendingInvitesCount: number;
  purgeDelayDays: number;
}

export interface DeletionTransfer {
  workspace_id: string;
  action: 'transfer' | 'delete';
  new_owner_id?: string;
}

export type DataExportStatusValue =
  | 'none'
  | 'pending'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'expired';

export interface DataExportStatusRow {
  hasRequest: boolean;
  id: string | null;
  status: DataExportStatusValue;
  createdAt: string | null;
  readyAt: string | null;
  expiresAt: string | null;
  errorMessage: string | null;
  downloadUrl: string | null;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  holidayCountry: string;
  /** ISO 3166-2 region whose own holidays count too; null = the whole country. */
  holidayRegion: string | null;
  heatmapEnabled: boolean;
  heatmapCapacityPerPerson: number | null;
  role: WorkspaceRole;
  ownerId: string;
  /** New and still waiting for its owner to pick a starter template (0169). */
  templatePending: boolean;
}

export interface WorkspaceMember {
  userId: string;
  email: string;
  displayName: string | null;
  role: WorkspaceRole;
  groupId: string | null;
  avatarUrl: string | null;
  status: AccountStatus;
}

export interface WorkspaceMemberRow {
  workspace_id: string;
  role: WorkspaceRole;
  workspaces: {
    id: string;
    name: string;
    holiday_country: string | null;
    holiday_region: string | null;
    heatmap_enabled: boolean | null;
    heatmap_capacity_per_person: number | string | null;
    owner_id: string | null;
    template_pending?: boolean | null;
  } | null;
}

export interface WorkspaceMemberProfileRow {
  user_id: string;
  role: WorkspaceRole;
  group_id: string | null;
  profiles: {
    email: string;
    display_name: string | null;
    avatar_url: string | null;
    status: AccountStatus | null;
  } | null;
}

export type SentInviteStatus = 'pending' | 'accepted' | 'declined' | 'canceled' | 'expired';

export interface SentInviteSummary {
  token: string;
  workspaceId: string;
  email: string;
  status: SentInviteStatus;
  isPending: boolean;
  createdAt: string | null;
}

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOutRedirectInProgress: boolean;
  workspaces: WorkspaceSummary[];
  /** True after the first successful workspace load; pages use it to avoid
   * redirect decisions on the not-yet-loaded empty list. */
  workspacesLoaded: boolean;
  currentWorkspaceId: string | null;
  currentWorkspaceRole: WorkspaceRole | null;
  members: WorkspaceMember[];
  membersWorkspaceId: string | null;
  membersLoading: boolean;
  profileDisplayName: string | null;
  profileLocale: Locale | null;
  profileAvatarUrl: string | null;
  // null until the profile has been fetched; lets preference-driven UI
  // distinguish "not loaded yet" from "loaded, flag absent/false".
  profilePreferences: Record<string, unknown> | null;
  profileStatus: AccountStatus;
  profilePurgeAfter: string | null;
  isSuperAdmin: boolean;
  superAdminLoading: boolean;
  // "We could not ask" is not the same answer as "you are not an admin".
  superAdminCheckFailed: boolean;
  // The admin function refused the session itself: only a new sign-in helps.
  superAdminSessionExpired: boolean;
  // Self-hosted installs with KEYCLOAK_WORKSPACES_FROM_GROUPS: the admin console
  // shows its "Group access" section. Reported by whoami; false everywhere else.
  groupWorkspacesEnabled: boolean;
  setSession: (session: Session | null) => void;
  setLoading: (loading: boolean) => void;
  setSignOutRedirectInProgress: (value: boolean) => void;
  resolveSuperAdmin: (user: User | null) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signInWithKeycloak: (redirectTo?: string, options?: { forceLogin?: boolean; register?: boolean }) => Promise<{ error?: string }>;
  signUp: (email: string, password: string) => Promise<{ error?: string }>;
  sendPasswordReset: (email: string) => Promise<{ error?: string }>;
  updatePassword: (password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  fetchWorkspaces: () => Promise<void>;
  fetchProfile: () => Promise<void>;
  setCurrentWorkspaceId: (id: string | null) => void;
  /**
   * `start` — what the "Create workspace" dialog chose. Without it the new
   * workspace waits for a template and the chooser asks for one.
   */
  createWorkspace: (name: string, start?: WorkspaceStart | null) => Promise<{ error?: string }>;
  /** The starter template is in: stop offering the choice (no refetch needed). */
  markWorkspaceTemplateApplied: (workspaceId: string) => void;
  deleteWorkspace: (workspaceId?: string) => Promise<{ error?: string }>;
  updateWorkspaceName: (workspaceId: string, name: string) => Promise<{ error?: string }>;
  updateWorkspaceHolidayCountry: (
    workspaceId: string,
    countryCode: string,
    regionCode: string | null,
  ) => Promise<{ error?: string }>;
  updateWorkspaceHeatmapEnabled: (workspaceId: string, enabled: boolean) => Promise<{ error?: string }>;
  updateWorkspaceHeatmapCapacity: (workspaceId: string, capacity: number | null) => Promise<{ error?: string }>;
  fetchMembers: (workspaceId?: string) => Promise<void>;
  inviteMember: (
    email: string,
    role: WorkspaceRole,
    groupId?: string | null
  ) => Promise<{
    error?: string;
    actionLink?: string;
    warning?: string;
    inviteEmail?: string;
    inviteStatus?: string;
    /** How it reaches the person: by email, or only in Motio's notifications. */
    delivery?: InviteDelivery;
    inviteToken?: string;
    alreadyMember?: boolean;
  }>;
  listSentInvites: (options?: {
    workspaceId?: string | null;
    pendingOnly?: boolean;
  }) => Promise<{ invites: SentInviteSummary[]; error?: string }>;
  cancelSentInvite: (token: string) => Promise<{ error?: string }>;
  acceptInvite: (token: string) => Promise<{ error?: string; workspaceId?: string; warning?: string }>;
  listWorkspaceMemberActivity: (options?: { workspaceId?: string | null; limit?: number }) => Promise<{ entries: WorkspaceMemberActivityEntry[]; error?: string }>;
  updateMemberRole: (userId: string, role: WorkspaceRole) => Promise<{ error?: string }>;
  updateMemberGroup: (userId: string, groupId: string | null) => Promise<{ error?: string }>;
  removeMember: (userId: string) => Promise<{ error?: string }>;
  leaveWorkspace: (
    workspaceId: string,
  ) => Promise<{ error?: string; reason?: 'OWNER_MUST_TRANSFER_FIRST' | 'SOLE_ADMIN_MUST_PROMOTE_FIRST' }>;
  transferWorkspaceOwnership: (workspaceId: string, newOwnerId: string) => Promise<{ error?: string }>;
  updateDisplayName: (displayName: string) => Promise<{ error?: string }>;
  updateLocale: (locale: Locale) => Promise<{ error?: string }>;
  updateAvatarUrl: (url: string | null) => void;
  fetchProfileSettings: () => Promise<{
    data?: {
      displayName: string;
      marketingEmailsOptIn: boolean;
      pushOptIn: boolean;
      preferences: Record<string, unknown>;
    };
    error?: string;
  }>;
  updateMarketingEmailsOptIn: (value: boolean) => Promise<{ error?: string }>;
  updatePushNotificationsOptIn: (value: boolean) => Promise<{ error?: string }>;
  updateProfilePreferences: (
    preferences: Record<string, unknown>,
  ) => Promise<{ error?: string }>;
  previewAccountDeletion: () => Promise<{ data?: DeletionPreview; error?: string }>;
  requestAccountDeletion: (
    transfers: DeletionTransfer[],
    confirmationPhrase: string,
  ) => Promise<{ data?: { purge_after: string }; error?: string }>;
  cancelAccountDeletion: () => Promise<{ error?: string }>;
  requestDataExport: () => Promise<{ data?: { request_id: string }; error?: string; retryAfter?: number }>;
  getDataExportStatus: () => Promise<{ data?: DataExportStatusRow; error?: string }>;
  renamePurgedProfile: (targetUserId: string, newName: string) => Promise<{ error?: string }>;
}

export type AuthSetState = StoreApi<AuthState>['setState'];
export type AuthGetState = StoreApi<AuthState>['getState'];
