import { supabase } from '@/shared/lib/supabaseClient';
import { type Locale } from '@/shared/lib/locale';
import { normalizeHolidayRegionCode } from '@/shared/domain/holidayRegion';
import { buildWorkspaceMemberActivityActorLabel } from '@/shared/domain/workspaceMemberActivity';
import type {
  AuthState,
  SentInviteStatus,
  SentInviteSummary,
  WorkspaceMember,
  WorkspaceMemberProfileRow,
  WorkspaceMemberRow,
  WorkspaceRole,
  WorkspaceSummary,
} from '@/features/auth/store/authStore.contract';

// Three quick tries cover a functions container that is restarting mid-deploy
// without making a genuinely signed-out tab wait.
export const SUPER_ADMIN_PROBE_ATTEMPTS = 3;
export const SUPER_ADMIN_PROBE_RETRY_MS = 400;
// Bootstrap waits for the probe, so it needs an end: retries plus slack.
export const SUPER_ADMIN_PROBE_TIMEOUT_MS = 10_000;

const DEFAULT_HOLIDAY_COUNTRY = 'RU';

export const normalizeHolidayCountryCode = (value: string | null | undefined) => {
  const code = (value ?? '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : DEFAULT_HOLIDAY_COUNTRY;
};

// numeric columns arrive from PostgREST as strings; keep a positive number or null.
const normalizeCapacity = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const mapWorkspaceRows = (rows: WorkspaceMemberRow[]): WorkspaceSummary[] => rows
  .map((row) => ({
    id: row.workspaces?.id ?? row.workspace_id,
    name: row.workspaces?.name ?? 'Workspace',
    holidayCountry: normalizeHolidayCountryCode(row.workspaces?.holiday_country),
    holidayRegion: normalizeHolidayRegionCode(
      row.workspaces?.holiday_region,
      normalizeHolidayCountryCode(row.workspaces?.holiday_country),
    ),
    heatmapEnabled: row.workspaces?.heatmap_enabled ?? false,
    heatmapCapacityPerPerson: normalizeCapacity(row.workspaces?.heatmap_capacity_per_person),
    role: row.role as WorkspaceRole,
    ownerId: row.workspaces?.owner_id ?? '',
    templatePending: row.workspaces?.template_pending ?? false,
  }))
  .filter((workspace) => Boolean(workspace.id));

export const getWorkspaceStorageKey = (userId: string) => `current-workspace-${userId}`;

/** The workspace this browser last opened for the user, before the list confirms it. */
export const readStoredWorkspaceId = (userId: string): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(getWorkspaceStorageKey(userId));
  } catch {
    return null;
  }
};

export const isTransientSchemaAuthError = (message: string) => (
  message.toLowerCase().includes('database error querying schema')
);

const sentInviteStatuses: ReadonlyArray<SentInviteStatus> = [
  'pending',
  'accepted',
  'declined',
  'canceled',
  'expired',
];

const isSentInviteStatus = (value: unknown): value is SentInviteStatus => (
  typeof value === 'string' && sentInviteStatuses.includes(value as SentInviteStatus)
);

export const parseSentInvites = (value: unknown): SentInviteSummary[] => {
  if (!Array.isArray(value)) return [];

  return value
    .filter((row): row is Partial<SentInviteSummary> => Boolean(row && typeof row === 'object'))
    .filter((row) => (
      typeof row.token === 'string'
      && typeof row.workspaceId === 'string'
      && isSentInviteStatus(row.status)
    ))
    .map((row) => ({
      token: row.token as string,
      workspaceId: row.workspaceId as string,
      email: typeof row.email === 'string' ? row.email : '',
      status: row.status as SentInviteStatus,
      isPending: typeof row.isPending === 'boolean' ? row.isPending : row.status === 'pending',
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : null,
    }));
};

export const getWorkspaceActivityActorSnapshot = (state: Pick<AuthState, 'user' | 'profileDisplayName'>) => ({
  actorUserId: state.user?.id ?? null,
  actorLabel: buildWorkspaceMemberActivityActorLabel(
    state.profileDisplayName,
    state.user?.email,
  ),
});

export const fetchWorkspaceMemberSnapshot = async (
  workspaceId: string,
  userId: string,
) => {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('user_id, role, group_id, profiles(email, display_name, avatar_url)')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    return { member: null as WorkspaceMember | null, error: error?.message };
  }

  const row = data as unknown as WorkspaceMemberProfileRow;
  return {
    member: {
      userId: row.user_id,
      role: row.role,
      groupId: row.group_id ?? null,
      email: row.profiles?.email ?? 'unknown',
      displayName: row.profiles?.display_name ?? null,
      avatarUrl: row.profiles?.avatar_url ?? null,
    },
  };
};

const POST_SIGN_OUT_LANDING_PATH = '/';

/** Name of the first workspace, in the language of the person it is created for. */
export const DEFAULT_WORKSPACE_NAMES: Record<Locale, string> = {
  en: 'My Workspace',
  ru: 'Моё пространство',
  de: 'Mein Arbeitsbereich',
};

export const getOauth2ProxySignOutPath = () => {
  const signOutPath = (import.meta.env.VITE_OAUTH2_PROXY_SIGN_OUT_PATH ?? '/oauth2/sign_out').trim();
  if (!signOutPath) return '/oauth2/sign_out';

  const [rawPath, rawQuery = ''] = signOutPath.split('?', 2);
  const params = new URLSearchParams(rawQuery);
  params.set('rd', POST_SIGN_OUT_LANDING_PATH);

  const query = params.toString();
  return query ? `${rawPath}?${query}` : rawPath;
};

// One-time welcome email: strictly `null` means "first sign-in, not greeted
// yet" (older sessions and the demo stub return undefined). The request is
// fire-and-forget — the edge function claims the send atomically, so repeated
// calls are harmless; the local flag just avoids re-requesting every
// fetchProfile within this tab.
let welcomeEmailRequested = false;

export const maybeRequestWelcomeEmail = (welcomeEmailSentAt: unknown) => {
  if (welcomeEmailSentAt !== null || welcomeEmailRequested) return;
  welcomeEmailRequested = true;
  void supabase.functions
    .invoke('mailer', { body: { action: 'welcome' } })
    .catch(() => {
      // A failed greeting must never disturb sign-in.
    });
};
