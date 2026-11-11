import { useEffect, useState } from 'react';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useShallow } from 'zustand/react/shallow';
import { useLocaleStore } from '@/shared/store/localeStore';
import { localeLabels, type Locale } from '@/shared/lib/locale';
import { isPushEnabled } from '@/shared/lib/featureFlags';
import {
  getNotificationPermission,
  hasActivePushSubscription,
  isPushSupported,
  needsIosInstallForPush,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/shared/lib/push/pushClient';
import { useAppBasePath } from '@/features/demo/hooks/useIsDemo';
import { isWeekViewEnabled, WEEK_VIEW_PREFERENCE_KEY } from '@/features/planner/lib/weekViewPreference';
import { isWeekNumbersEnabled, WEEK_NUMBERS_PREFERENCE_KEY } from '@/features/planner/lib/weekNumbersPreference';
import { BOARD_VIEW_PREFERENCE_KEY, isBoardViewPreferenceOn } from '@/features/planner/lib/boardViewPreference';
import {
  DEFAULT_TIME_OFF_MOTIF_ID,
  getTimeOffMotifId,
  isValidTimeOffMotifId,
  TIME_OFF_MOTIF_PREFERENCE_KEY,
  type TimeOffMotifId,
} from '@/features/planner/lib/timeOffMotifs';
import {
  ACCENT_COLOR_PREFERENCE_KEY,
  DEFAULT_ACCENT_ID,
  getAccentColorId,
} from '@/shared/lib/accentColor';
import { useAccentColorStore } from '@/shared/store/accentColorStore';
import { t } from '@lingui/macro';

/**
 * Everything the account dialog reads and saves: the name, the language, and
 * the personal preferences (daily brief, emails, push, timeline views, accent,
 * time-off stamp). Loaded each time the dialog opens; every toggle saves at
 * once and rolls back if the save fails.
 */
export const useAccountSettings = (open: boolean) => {
  const {
    user,
    updateDisplayName,
    updateLocale,
    fetchProfileSettings,
    updateProfilePreferences,
    updateMarketingEmailsOptIn,
    updatePushNotificationsOptIn,
  } = useAuthStore(useShallow((state) => ({
    user: state.user,
    updateDisplayName: state.updateDisplayName,
    updateLocale: state.updateLocale,
    fetchProfileSettings: state.fetchProfileSettings,
    updateProfilePreferences: state.updateProfilePreferences,
    updateMarketingEmailsOptIn: state.updateMarketingEmailsOptIn,
    updatePushNotificationsOptIn: state.updatePushNotificationsOptIn,
  })));
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);
  const basePath = useAppBasePath();
  const [displayName, setDisplayName] = useState('');
  const [initialDisplayName, setInitialDisplayName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [localeSaving, setLocaleSaving] = useState(false);
  const [dailyBriefEnabled, setDailyBriefEnabled] = useState(true);
  const [marketingEmailsEnabled, setMarketingEmailsEnabled] = useState(false);
  // Browser push. `pushSupported` folds the feature flag together with runtime
  // capability detection so the whole block simply hides where push can't work.
  const [pushSupported] = useState(() => isPushEnabled() && isPushSupported());
  // iOS tab without push: show an "install to Home Screen" hint instead of the
  // toggle — that's the only way Safari delivers Web Push (iOS 16.4+).
  const [iosPushInstallHint] = useState(() => isPushEnabled() && needsIosInstallForPush());
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushOnAssignment, setPushOnAssignment] = useState(true);
  const [pushOnMention, setPushOnMention] = useState(true);
  const [pushOnTaskChange, setPushOnTaskChange] = useState(true);
  const [weekViewEnabled, setWeekViewEnabled] = useState(false);
  const [weekNumbersEnabled, setWeekNumbersEnabled] = useState(false);
  const [boardViewEnabled, setBoardViewEnabled] = useState(false);
  const [tourRestarting, setTourRestarting] = useState(false);
  const [tourRestarted, setTourRestarted] = useState(false);
  const [accentId, setAccentId] = useState<string>(DEFAULT_ACCENT_ID);
  const [timeOffMotifId, setTimeOffMotifId] = useState<TimeOffMotifId>(DEFAULT_TIME_OFF_MOTIF_ID);
  const [currentPrefs, setCurrentPrefs] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!open || !user) return;
    let active = true;

    const loadProfile = async () => {
      setLoading(true);
      setError('');
      setSaved(false);
      const { data, error } = await fetchProfileSettings();

      if (!active) return;
      if (error || !data) {
        setError(error ?? t`Failed to load profile.`);
        setLoading(false);
        return;
      }
      const nextDisplayName = data.displayName;
      setDisplayName(nextDisplayName);
      setInitialDisplayName(nextDisplayName);
      setIsEditingName(!nextDisplayName.trim());

      setCurrentPrefs(data.preferences);
      setDailyBriefEnabled(data.preferences.daily_brief_enabled !== false);
      setMarketingEmailsEnabled(data.marketingEmailsOptIn);
      setWeekViewEnabled(isWeekViewEnabled(data.preferences));
      setWeekNumbersEnabled(isWeekNumbersEnabled(data.preferences));
      setBoardViewEnabled(isBoardViewPreferenceOn(data.preferences));
      setAccentId(getAccentColorId(data.preferences));
      setTimeOffMotifId(getTimeOffMotifId(data.preferences));

      if (pushSupported) {
        const prefs = data.preferences;
        setPushOnAssignment(prefs.push_on_assignment !== false);
        setPushOnMention(prefs.push_on_mention !== false);
        setPushOnTaskChange(prefs.push_on_task_change !== false);
        // The toggle reflects THIS browser: on only when permission is granted
        // and an active push subscription actually exists here.
        const deviceSubscribed = getNotificationPermission() === 'granted'
          && (await hasActivePushSubscription());
        if (active) setPushEnabled(deviceSubscribed);
      }

      setLoading(false);
    };

    loadProfile();
    return () => {
      active = false;
    };
  }, [open, user, fetchProfileSettings]);

  const isDisplayNameDirty = displayName !== initialDisplayName;
  const showSave = Boolean(user && isEditingName && isDisplayNameDirty);
  const canCancelEditing = Boolean(initialDisplayName.trim());
  const canEditName = Boolean(user && !loading);
  const languageOptions: Array<{ value: Locale; label: string }> = [
    { value: 'en', label: localeLabels.en },
    { value: 'ru', label: localeLabels.ru },
    { value: 'de', label: localeLabels.de },
  ];
  const handleSave = async () => {
    if (!user) return;
    setError('');
    setSaved(false);
    const result = await updateDisplayName(displayName);
    if (result.error) {
      setError(result.error);
      return;
    }
    setInitialDisplayName(displayName);
    setIsEditingName(false);
    setSaved(true);
  };

  const handleLocaleChange = async (value: string) => {
    const nextLocale = value as Locale;
    if (nextLocale === locale) return;
    const previousLocale = locale;
    setError('');
    setLocale(nextLocale);
    if (!user) return;
    setLocaleSaving(true);
    const result = await updateLocale(nextLocale);
    setLocaleSaving(false);
    if (result.error) {
      setError(result.error);
      setLocale(previousLocale);
    }
  };

  /**
   * Optimistic preference write: shows the change at once, saves it, and puts
   * everything back (and shows the error) if the save fails. True on success.
   */
  const savePreference = async (
    patch: Record<string, unknown>,
    apply: () => void,
    revert: () => void,
  ): Promise<boolean> => {
    if (!user) return false;
    const previousPrefs = currentPrefs;
    apply();
    const updatedPrefs = { ...currentPrefs, ...patch };
    setCurrentPrefs(updatedPrefs);

    const { error: updateError } = await updateProfilePreferences(updatedPrefs);
    if (updateError) {
      revert();
      setCurrentPrefs(previousPrefs);
      setError(updateError);
      return false;
    }
    return true;
  };

  const handleDailyBriefToggle = async (checked: boolean) => {
    const previousEnabled = dailyBriefEnabled;
    await savePreference(
      { daily_brief_enabled: checked },
      () => setDailyBriefEnabled(checked),
      () => setDailyBriefEnabled(previousEnabled),
    );
  };

  const handleMarketingEmailsToggle = async (checked: boolean) => {
    if (!user) return;
    const previousEnabled = marketingEmailsEnabled;

    // Optimistic update — переключается мгновенно
    setMarketingEmailsEnabled(checked);
    const { error: updateError } = await updateMarketingEmailsOptIn(checked);

    if (updateError) {
      // Откат при ошибке
      setMarketingEmailsEnabled(previousEnabled);
      setError(updateError);
    }
  };

  const pushErrorMessage = (reason?: string) => {
    if (reason === 'denied') {
      return t`Notifications are blocked in this browser. Allow them in the site settings and try again.`;
    }
    if (reason === 'unsupported' || reason === 'sw-failed') {
      return t`This browser can't show notifications here.`;
    }
    if (reason === 'not-configured') {
      return t`Push notifications aren't available right now.`;
    }
    return t`Couldn't enable notifications. Please try again.`;
  };

  const handlePushMasterToggle = async (checked: boolean) => {
    if (!user || pushBusy) return;
    setPushBusy(true);
    setError('');

    if (checked) {
      const result = await subscribeToPush();
      if (!result.ok) {
        setPushEnabled(false);
        setError(pushErrorMessage(result.reason));
        setPushBusy(false);
        return;
      }
      setPushEnabled(true);
      await updatePushNotificationsOptIn(true);
    } else {
      await unsubscribeFromPush();
      setPushEnabled(false);
      await updatePushNotificationsOptIn(false);
    }
    setPushBusy(false);
  };

  const updatePushEventPref = async (
    key: 'push_on_assignment' | 'push_on_mention' | 'push_on_task_change',
    checked: boolean,
    setLocal: (value: boolean) => void,
    previous: boolean,
  ) => {
    await savePreference({ [key]: checked }, () => setLocal(checked), () => setLocal(previous));
  };

  // The planner reads the same preference from the store and shows or hides
  // the Week and Board buttons reactively.
  const handleWeekViewToggle = async (checked: boolean) => {
    const previousEnabled = weekViewEnabled;
    await savePreference(
      { [WEEK_VIEW_PREFERENCE_KEY]: checked },
      () => setWeekViewEnabled(checked),
      () => setWeekViewEnabled(previousEnabled),
    );
  };

  const handleWeekNumbersToggle = async (checked: boolean) => {
    const previousEnabled = weekNumbersEnabled;
    await savePreference(
      { [WEEK_NUMBERS_PREFERENCE_KEY]: checked },
      () => setWeekNumbersEnabled(checked),
      () => setWeekNumbersEnabled(previousEnabled),
    );
  };

  const handleBoardViewToggle = async (checked: boolean) => {
    const previousEnabled = boardViewEnabled;
    await savePreference(
      { [BOARD_VIEW_PREFERENCE_KEY]: checked },
      () => setBoardViewEnabled(checked),
      () => setBoardViewEnabled(previousEnabled),
    );
  };

  /**
   * Снимает отметку «тур пройден», и он снова запустится на таймлайне. Раньше
   * тур был одноразовым: закрыл — и больше никогда, даже случайно закрыл.
   */
  const handleRestartTour = async () => {
    if (!user) return;
    setTourRestarting(true);
    const saved = await savePreference({ onboarding_completed: false }, () => {}, () => {});
    setTourRestarting(false);
    if (!saved) return;
    setTourRestarted(true);

    // Отметку в базе мы сняли, но открытая страница о ней уже не спросит:
    // тур решает, показываться ли, один раз при своём монтировании. Поэтому
    // уходим на таймлайн полной перезагрузкой — иначе кнопка выглядела бы
    // нажатой, а тур бы не появился.
    // In the sandbox that is the sandbox's timeline, not the real app.
    if (typeof window !== 'undefined') {
      window.location.assign(basePath);
    }
  };

  const handleAccentChange = async (nextId: string) => {
    if (!user || nextId === accentId) return;
    const previousId = accentId;
    // Recolors instantly through the store, so the store is rolled back too.
    await savePreference(
      { [ACCENT_COLOR_PREFERENCE_KEY]: nextId },
      () => {
        setAccentId(nextId);
        useAccentColorStore.getState().setAccent(nextId);
      },
      () => {
        setAccentId(previousId);
        useAccentColorStore.getState().setAccent(previousId);
      },
    );
  };

  const handleTimeOffMotifChange = async (nextId: string) => {
    if (!user || !isValidTimeOffMotifId(nextId) || nextId === timeOffMotifId) return;
    const previousId = timeOffMotifId;
    // The timeline reads the motif straight off profilePreferences, which
    // updateProfilePreferences refreshes on success — my own rows repaint
    // without refetching the workspace.
    await savePreference(
      { [TIME_OFF_MOTIF_PREFERENCE_KEY]: nextId },
      () => setTimeOffMotifId(nextId),
      () => setTimeOffMotifId(previousId),
    );
  };

  return {
    user,
    languageOptions,
    displayName,
    setDisplayName,
    initialDisplayName,
    setInitialDisplayName,
    isEditingName,
    setIsEditingName,
    loading,
    setLoading,
    error,
    setError,
    saved,
    setSaved,
    localeSaving,
    setLocaleSaving,
    dailyBriefEnabled,
    setDailyBriefEnabled,
    marketingEmailsEnabled,
    setMarketingEmailsEnabled,
    pushSupported,
    iosPushInstallHint,
    pushEnabled,
    setPushEnabled,
    pushBusy,
    setPushBusy,
    pushOnAssignment,
    setPushOnAssignment,
    pushOnMention,
    setPushOnMention,
    pushOnTaskChange,
    setPushOnTaskChange,
    weekViewEnabled,
    setWeekViewEnabled,
    weekNumbersEnabled,
    boardViewEnabled,
    setBoardViewEnabled,
    tourRestarting,
    setTourRestarting,
    tourRestarted,
    setTourRestarted,
    accentId,
    setAccentId,
    timeOffMotifId,
    setTimeOffMotifId,
    currentPrefs,
    setCurrentPrefs,
    isDisplayNameDirty,
    showSave,
    canCancelEditing,
    canEditName,
    handleSave,
    handleLocaleChange,
    handleDailyBriefToggle,
    handleMarketingEmailsToggle,
    pushErrorMessage,
    handlePushMasterToggle,
    updatePushEventPref,
    handleWeekViewToggle,
    handleWeekNumbersToggle,
    handleBoardViewToggle,
    handleRestartTour,
    handleAccentChange,
    handleTimeOffMotifChange,
    locale,
  };
};

export type AccountSettings = ReturnType<typeof useAccountSettings>;
