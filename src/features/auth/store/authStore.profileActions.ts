import { supabase } from '@/shared/lib/supabaseClient';
import { parseInvokeError } from '@/shared/lib/parseInvokeError';
import { invokeFunction } from '@/shared/lib/invokeFunction';
import { useLocaleStore } from '@/shared/store/localeStore';
import { useAccentColorStore } from '@/shared/store/accentColorStore';
import { isSupportedLocale } from '@/shared/lib/locale';
import { clearPendingLocale, getPendingLocale } from '@/features/auth/lib/pendingLocale';
import { workspaceSyncService } from '@/application/workspace/workspaceSyncService';
import type {
  AccountStatus,
  AuthGetState,
  AuthSetState,
  AuthState,
  DataExportStatusRow,
  DataExportStatusValue,
  DeletionPreview,
} from '@/features/auth/store/authStore.contract';
import { maybeRequestWelcomeEmail } from '@/features/auth/store/authStore.helpers';

// The person's own profile: name, language, avatar, preferences, and the
// account lifecycle (data export, deletion).
type ProfileActions = Pick<
  AuthState,
  | 'fetchProfile'
  | 'updateDisplayName'
  | 'updateLocale'
  | 'updateAvatarUrl'
  | 'fetchProfileSettings'
  | 'updateMarketingEmailsOptIn'
  | 'updatePushNotificationsOptIn'
  | 'updateProfilePreferences'
  | 'previewAccountDeletion'
  | 'requestAccountDeletion'
  | 'cancelAccountDeletion'
  | 'requestDataExport'
  | 'getDataExportStatus'
  | 'renamePurgedProfile'
>;

export const createProfileActions = (
  set: AuthSetState,
  get: AuthGetState,
): ProfileActions => ({
  fetchProfile: async () => {
    const user = get().user;
    if (!user) {
      set({ profileDisplayName: null });
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('display_name, locale, avatar_url, status, purge_after, preferences, welcome_email_sent_at')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error(error);
      return;
    }

    const displayName = data?.display_name?.trim();
    const profileLocale = isSupportedLocale(data?.locale) ? data.locale : null;
    const pendingLocale = getPendingLocale();
    // Профиль без языка = аккаунт, который ещё ни разу не высказывался. Тогда
    // языком становится тот, на котором человек прямо сейчас смотрит
    // приложение: угаданный по браузеру либо выбранный им до входа.
    const currentUiLocale = useLocaleStore.getState().locale;
    const nextLocale = pendingLocale ?? profileLocale ?? currentUiLocale;
    const rawStatus = (data?.status as string | null) ?? 'ACTIVE';
    const profileStatus: AccountStatus = (
      rawStatus === 'PENDING_DELETION' || rawStatus === 'PURGED' ? rawStatus : 'ACTIVE'
    );

    set({
      profileDisplayName: displayName ? displayName : null,
      profileLocale: nextLocale,
      profileAvatarUrl: (data?.avatar_url as string | null) ?? null,
      profilePreferences: (data?.preferences ?? {}) as Record<string, unknown>,
      profileStatus,
      profilePurgeAfter: (data?.purge_after as string | null) ?? null,
    });

    // Apply the user's saved interface accent color.
    useAccentColorStore
      .getState()
      .setAccentFromProfile((data?.preferences ?? null) as Record<string, unknown> | null);

    if (pendingLocale) {
      useLocaleStore.getState().setLocale(pendingLocale);
      clearPendingLocale();
      if (profileLocale !== pendingLocale) {
        const { error: localeError } = await supabase
          .from('profiles')
          .update({ locale: pendingLocale })
          .eq('id', user.id);
        if (localeError) {
          console.error(localeError);
        }
      }
      // Requested only after the pending locale is persisted: on the very
      // first sign-in the profile row is born with the default locale, and
      // the welcome email must render in the language the user actually
      // picked before signing in.
      maybeRequestWelcomeEmail(data?.welcome_email_sent_at);
      return;
    }

    if (!profileLocale) {
      // Первый вход: закрепляем угаданный язык за аккаунтом, чтобы письма и
      // другие устройства говорили на нём же. Запись идёт до запроса
      // приветственного письма — иначе оно уйдёт на языке пустого профиля.
      const { error: localeError } = await supabase
        .from('profiles')
        .update({ locale: currentUiLocale })
        .eq('id', user.id);
      if (localeError) {
        console.error(localeError);
      }
      maybeRequestWelcomeEmail(data?.welcome_email_sent_at);
      return;
    }

    useLocaleStore.getState().setLocaleFromProfile(profileLocale);
    maybeRequestWelcomeEmail(data?.welcome_email_sent_at);
  },
  updateDisplayName: async (displayName) => {
    const user = get().user;
    if (!user) return { error: 'You are not signed in.' };

    const nextName = displayName.trim();
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: nextName.length > 0 ? nextName : null })
      .eq('id', user.id);

    if (error) {
      return { error: error.message };
    }

    const nextDisplayName = nextName.length > 0 ? nextName : null;
    set({ profileDisplayName: nextDisplayName });

    const workspaceId = get().currentWorkspaceId;
    if (workspaceId) {
      await get().fetchMembers(workspaceId);
    }
    await workspaceSyncService.refreshAssignees();
    return {};
  },
  updateLocale: async (locale) => {
    const user = get().user;
    if (!user) return { error: 'You are not signed in.' };

    const { error } = await supabase
      .from('profiles')
      .update({ locale })
      .eq('id', user.id);

    if (error) {
      return { error: error.message };
    }

    set({ profileLocale: locale });
    return {};
  },
  updateAvatarUrl: (url) => {
    const currentUserId = get().user?.id;
    // Also update the matching member in the members array so that
    // timeline and other places that read members[x].avatarUrl reflect
    // the change immediately without a page refresh.
    const updatedMembers = currentUserId
      ? get().members.map((m) =>
          m.userId === currentUserId ? { ...m, avatarUrl: url } : m,
        )
      : get().members;
    set({ profileAvatarUrl: url, members: updatedMembers });
  },
  fetchProfileSettings: async () => {
    const user = get().user;
    if (!user) return { error: 'You are not signed in.' };

    const { data, error } = await supabase
      .from('profiles')
      .select('display_name, preferences, marketing_emails_opt_in, push_notifications_opt_in')
      .eq('id', user.id)
      .single();

    if (error) {
      return { error: error.message };
    }

    return {
      data: {
        displayName: data?.display_name ?? '',
        marketingEmailsOptIn: Boolean(data?.marketing_emails_opt_in),
        pushOptIn: Boolean(data?.push_notifications_opt_in),
        preferences: (data?.preferences ?? {}) as Record<string, unknown>,
      },
    };
  },
  updateMarketingEmailsOptIn: async (value) => {
    const user = get().user;
    if (!user) return { error: 'You are not signed in.' };

    const { error } = await supabase
      .from('profiles')
      .update({ marketing_emails_opt_in: value })
      .eq('id', user.id);

    if (error) {
      return { error: error.message };
    }
    return {};
  },
  updatePushNotificationsOptIn: async (value) => {
    const user = get().user;
    if (!user) return { error: 'You are not signed in.' };

    const { error } = await supabase
      .from('profiles')
      .update({ push_notifications_opt_in: value })
      .eq('id', user.id);

    if (error) {
      return { error: error.message };
    }
    return {};
  },
  updateProfilePreferences: async (preferences) => {
    const user = get().user;
    if (!user) return { error: 'You are not signed in.' };

    const { error } = await supabase
      .from('profiles')
      .update({ preferences })
      .eq('id', user.id);

    if (error) {
      return { error: error.message };
    }

    // Keep the reactive copy in sync so preference-driven UI (e.g. the optional
    // Week timeline view) updates without a refetch.
    set({ profilePreferences: preferences });
    return {};
  },
  previewAccountDeletion: async () => {
    const { data, error } = await supabase.rpc('preview_account_deletion');
    if (error) return { error: error.message };
    return { data: data as DeletionPreview };
  },
  requestAccountDeletion: async (transfers, confirmationPhrase) => {
    const { data, error } = await supabase.rpc('request_account_deletion', {
      p_transfers: transfers,
      p_confirmation_phrase: confirmationPhrase,
    });
    if (error) return { error: error.message };
    const row = data as { purge_after: string } | null;
    if (row?.purge_after) {
      set({ profileStatus: 'PENDING_DELETION', profilePurgeAfter: row.purge_after });
    }
    return { data: row ?? undefined };
  },
  cancelAccountDeletion: async () => {
    const { error } = await supabase.rpc('cancel_account_deletion');
    if (error) return { error: error.message };
    set({ profileStatus: 'ACTIVE', profilePurgeAfter: null });
    return {};
  },
  requestDataExport: async () => {
    const { data, error } = await supabase.rpc('request_data_export');
    if (error) {
      // Parse "data export rate limit: retry_after=Ns" (see migration 0074:414).
      const match = /retry_after=(\d+)/.exec(error.message);
      const retryAfter = match ? Number(match[1]) : undefined;
      return { error: error.message, retryAfter };
    }
    return { data: data as { request_id: string } };
  },
  getDataExportStatus: async () => {
    // Call the data-export edge function (action=status). It proxies
    // get_data_export_status and additionally issues a signed download URL
    // when the request is ready — we can't sign from the browser client.
    const { data, error, response } = await invokeFunction('data-export', { action: 'status' });
    if (error) {
      const message = await parseInvokeError(error, response);
      return { error: message };
    }
    const raw = (data ?? {}) as Record<string, unknown>;
    const status = (raw.status as DataExportStatusValue | undefined) ?? 'none';
    const row: DataExportStatusRow = {
      hasRequest: Boolean(raw.hasRequest),
      id: (raw.requestId as string | null) ?? null,
      status,
      createdAt: (raw.createdAt as string | null) ?? null,
      readyAt: (raw.readyAt as string | null) ?? null,
      expiresAt: (raw.expiresAt as string | null) ?? null,
      errorMessage: (raw.errorMessage as string | null) ?? null,
      downloadUrl: (raw.downloadUrl as string | null) ?? null,
    };
    return { data: row };
  },
  renamePurgedProfile: async (targetUserId, newName) => {
    const workspaceId = get().currentWorkspaceId;
    if (!workspaceId) return { error: 'Workspace not selected.' };
    if (!targetUserId) return { error: 'Target user id is required.' };
    const { error } = await supabase.rpc('rename_purged_profile', {
      p_target_user_id: targetUserId,
      p_workspace_id: workspaceId,
      p_new_name: newName,
    });
    if (error) return { error: error.message };
    // Optimistically update local members list so the change appears without a refetch.
    const members = get().members.map((member) => (
      member.userId === targetUserId
        ? { ...member, displayName: newName.trim() }
        : member
    ));
    set({ members });
    return {};
  },
});
