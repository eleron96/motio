import React, { useEffect, useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Database,
  LogOut,
  Palette,
  Pencil,
  Trash2,
  User,
  UserCog,
} from 'lucide-react';
import { cn } from '@/shared/lib/classNames';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useShallow } from 'zustand/react/shallow';
import { Switch } from '@/shared/ui/switch';
import { useLocaleStore } from '@/shared/store/localeStore';
import { localeLabels, type Locale } from '@/shared/lib/locale';
import { APP_VERSION } from '@/shared/lib/appVersion';
// Type-only: the module inlines both CHANGELOG files, so it is loaded on demand
// when the notes dialog opens (see the effect below), never with this component.
import type { ReleaseNotesEntry } from '@/shared/lib/releaseNotes';
import { getAccountInitials, getAccountSignedInLabel } from '@/shared/lib/accountIdentity';
import { AvatarWithEditButton } from './AvatarWithEditButton';
import { ReleaseNotesList } from './ReleaseNotesList';
import { ProfileSummary } from './ProfileSummary';
import { useProfileSummary } from '@/features/auth/hooks/useProfileSummary';
import { DeleteAccountWizard } from './DeleteAccountWizard';
import { DataExportButton } from './DataExportButton';
import { isAccountDeletionEnabled, isPushEnabled } from '@/shared/lib/featureFlags';
import {
  getNotificationPermission,
  hasActivePushSubscription,
  isPushSupported,
  needsIosInstallForPush,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/shared/lib/push/pushClient';
import { useIsDemo } from '@/features/demo/hooks/useIsDemo';
import { demoStore } from '@/features/demo/lib/demoDataStore';
import { isWeekViewEnabled, WEEK_VIEW_PREFERENCE_KEY } from '@/features/planner/lib/weekViewPreference';
import {
  DEFAULT_TIME_OFF_MOTIF_ID,
  getTimeOffMotifId,
  getTimeOffMotifLabel,
  isValidTimeOffMotifId,
  TIME_OFF_MOTIF_IDS,
  TIME_OFF_MOTIF_PREFERENCE_KEY,
  type TimeOffMotifId,
} from '@/features/planner/lib/timeOffMotifs';
import {
  ACCENT_COLOR_PREFERENCE_KEY,
  ACCENT_SWATCHES,
  DEFAULT_ACCENT_ID,
  getAccentColorId,
  getAccentLabel,
  getAccentSwatch,
} from '@/shared/lib/accentColor';
import { useAccentColorStore } from '@/shared/store/accentColorStore';
import { t } from '@lingui/macro';

interface AccountSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SectionId = 'profile' | 'appearance' | 'notifications' | 'data' | 'danger';

export const AccountSettingsDialog: React.FC<AccountSettingsDialogProps> = ({ open, onOpenChange }) => {
  const {
    user,
    updateDisplayName,
    updateLocale,
    updateAvatarUrl,
    profileAvatarUrl,
    signOut,
    fetchProfileSettings,
    updateProfilePreferences,
    updateMarketingEmailsOptIn,
    updatePushNotificationsOptIn,
  } = useAuthStore(useShallow((state) => ({
    user: state.user,
    updateDisplayName: state.updateDisplayName,
    updateLocale: state.updateLocale,
    updateAvatarUrl: state.updateAvatarUrl,
    profileAvatarUrl: state.profileAvatarUrl,
    signOut: state.signOut,
    fetchProfileSettings: state.fetchProfileSettings,
    updateProfilePreferences: state.updateProfilePreferences,
    updateMarketingEmailsOptIn: state.updateMarketingEmailsOptIn,
    updatePushNotificationsOptIn: state.updatePushNotificationsOptIn,
  })));
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);
  const [displayName, setDisplayName] = useState('');
  const [initialDisplayName, setInitialDisplayName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [localeSaving, setLocaleSaving] = useState(false);
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false);
  const [deleteWizardOpen, setDeleteWizardOpen] = useState(false);
  const isDemo = useIsDemo();
  const isMobile = useIsMobile();
  // The data tab (account deletion + export) is meaningless for an anon
  // demo session — the cleanup cron handles "deletion" automatically.
  const accountDeletionEnabled = isAccountDeletionEnabled() && !isDemo;
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
  const [pushOnDeadline, setPushOnDeadline] = useState(true);
  const [weekViewEnabled, setWeekViewEnabled] = useState(false);
  const [accentId, setAccentId] = useState<string>(DEFAULT_ACCENT_ID);
  const [timeOffMotifId, setTimeOffMotifId] = useState<TimeOffMotifId>(DEFAULT_TIME_OFF_MOTIF_ID);
  const [currentPrefs, setCurrentPrefs] = useState<Record<string, unknown>>({});
  const [activeSection, setActiveSection] = useState<SectionId>('profile');
  // Mobile drills in: the rail is a full-width list, picking a row swaps it for the
  // section. Same pattern as workspace settings.
  const [mobileSectionOpen, setMobileSectionOpen] = useState(false);

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
      setAccentId(getAccentColorId(data.preferences));
      setTimeOffMotifId(getTimeOffMotifId(data.preferences));

      if (pushSupported) {
        const prefs = data.preferences;
        setPushOnAssignment(prefs.push_on_assignment !== false);
        setPushOnMention(prefs.push_on_mention !== false);
        setPushOnTaskChange(prefs.push_on_task_change !== false);
        setPushOnDeadline(prefs.push_on_deadline !== false);
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

  useEffect(() => {
    if (open) return;
    setReleaseNotesOpen(false);
    setActiveSection('profile');
    setMobileSectionOpen(false);
  }, [open]);

  const signedInLabel = getAccountSignedInLabel(user, t`Unknown user`);
  const initials = getAccountInitials(displayName, signedInLabel);
  const summary = useProfileSummary();
  const months = summary.monthsInMotio ?? 0;

  const isDisplayNameDirty = displayName !== initialDisplayName;
  const showSave = Boolean(user && isEditingName && isDisplayNameDirty);
  const canCancelEditing = Boolean(initialDisplayName.trim());
  const canEditName = Boolean(user && !loading);
  const isRussianLocale = locale === 'ru';
  const languageOptions: Array<{ value: Locale; label: string }> = [
    { value: 'en', label: localeLabels.en },
    { value: 'ru', label: localeLabels.ru },
  ];
  // Fetched only once the dialog is open: the module carries the full changelog.
  // `null` means "not loaded yet" and renders a loading line; `[]` means loaded
  // and genuinely empty.
  const [releaseNotes, setReleaseNotes] = useState<ReleaseNotesEntry[] | null>(null);

  useEffect(() => {
    if (!releaseNotesOpen) return;

    let cancelled = false;
    void import('@/shared/lib/releaseNotes')
      .then(({ getRecentReleaseNotes }) => {
        if (cancelled) return;
        setReleaseNotes(getRecentReleaseNotes(locale));
      })
      .catch(() => {
        // A failed chunk load is handled globally (preloadErrorReload); locally
        // just fall back to the empty state instead of a stuck spinner.
        if (!cancelled) setReleaseNotes([]);
      });

    return () => {
      cancelled = true;
    };
  }, [releaseNotesOpen, locale]);

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

  const handleDailyBriefToggle = async (checked: boolean) => {
    if (!user) return;
    const previousEnabled = dailyBriefEnabled;
    const previousPrefs = currentPrefs;

    // Optimistic update — переключается мгновенно
    setDailyBriefEnabled(checked);
    const updatedPrefs = { ...currentPrefs, daily_brief_enabled: checked };
    setCurrentPrefs(updatedPrefs);

    const { error: updateError } = await updateProfilePreferences(updatedPrefs);

    if (updateError) {
      // Откат при ошибке
      setDailyBriefEnabled(previousEnabled);
      setCurrentPrefs(previousPrefs);
      setError(updateError);
    }
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
    key: 'push_on_assignment' | 'push_on_mention' | 'push_on_task_change' | 'push_on_deadline',
    checked: boolean,
    setLocal: (value: boolean) => void,
    previous: boolean,
  ) => {
    if (!user) return;
    const previousPrefs = currentPrefs;
    setLocal(checked);
    const updatedPrefs = { ...currentPrefs, [key]: checked };
    setCurrentPrefs(updatedPrefs);

    const { error: updateError } = await updateProfilePreferences(updatedPrefs);
    if (updateError) {
      setLocal(previous);
      setCurrentPrefs(previousPrefs);
      setError(updateError);
    }
  };

  const handleWeekViewToggle = async (checked: boolean) => {
    if (!user) return;
    const previousEnabled = weekViewEnabled;
    const previousPrefs = currentPrefs;

    // Optimistic update — toggles instantly; the planner reads the same
    // preference from the store and shows/hides the Week button reactively.
    setWeekViewEnabled(checked);
    const updatedPrefs = { ...currentPrefs, [WEEK_VIEW_PREFERENCE_KEY]: checked };
    setCurrentPrefs(updatedPrefs);

    const { error: updateError } = await updateProfilePreferences(updatedPrefs);

    if (updateError) {
      setWeekViewEnabled(previousEnabled);
      setCurrentPrefs(previousPrefs);
      setError(updateError);
    }
  };

  const handleAccentChange = async (nextId: string) => {
    if (!user || nextId === accentId) return;
    const previousId = accentId;
    const previousPrefs = currentPrefs;

    // Recolor instantly via the store, then persist; roll back on failure.
    setAccentId(nextId);
    useAccentColorStore.getState().setAccent(nextId);
    const updatedPrefs = { ...currentPrefs, [ACCENT_COLOR_PREFERENCE_KEY]: nextId };
    setCurrentPrefs(updatedPrefs);

    const { error: updateError } = await updateProfilePreferences(updatedPrefs);

    if (updateError) {
      setAccentId(previousId);
      useAccentColorStore.getState().setAccent(previousId);
      setCurrentPrefs(previousPrefs);
      setError(updateError);
    }
  };

  const handleTimeOffMotifChange = async (nextId: string) => {
    if (!user || !isValidTimeOffMotifId(nextId) || nextId === timeOffMotifId) return;
    const previousId = timeOffMotifId;
    const previousPrefs = currentPrefs;

    // Optimistic: the timeline reads the motif straight off profilePreferences,
    // which updateProfilePreferences refreshes on success — my own rows repaint
    // without refetching the workspace. Roll back on failure.
    setTimeOffMotifId(nextId);
    const updatedPrefs = { ...currentPrefs, [TIME_OFF_MOTIF_PREFERENCE_KEY]: nextId };
    setCurrentPrefs(updatedPrefs);

    const { error: updateError } = await updateProfilePreferences(updatedPrefs);

    if (updateError) {
      setTimeOffMotifId(previousId);
      setCurrentPrefs(previousPrefs);
      setError(updateError);
    }
  };

  // Export and deletion both hang off the same flag, so the rail loses two rows at
  // once when it is off — never a lone "Danger zone" with nothing above it.
  const sections: Array<{ id: SectionId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'profile', label: t`Profile`, icon: User },
    { id: 'appearance', label: t`Appearance`, icon: Palette },
    { id: 'notifications', label: t`Notifications`, icon: Bell },
    ...(accountDeletionEnabled
      ? ([
        { id: 'data' as const, label: t`Data`, icon: Database },
        { id: 'danger' as const, label: t`Danger zone`, icon: AlertTriangle },
      ])
      : []),
  ];

  const activeLabel = sections.find((section) => section.id === activeSection)?.label ?? '';

  const renderNav = (onPick?: () => void) => (
    <nav className="flex flex-col gap-1">
      {sections.map((section) => {
        const Icon = section.icon;
        const active = section.id === activeSection;
        const danger = section.id === 'danger';
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => {
              setActiveSection(section.id);
              onPick?.();
            }}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors',
              active
                ? 'bg-muted font-medium text-foreground'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              danger && (active ? 'text-destructive' : 'hover:text-destructive'),
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">{section.label}</span>
            {isMobile && <ChevronRight className="h-4 w-4 shrink-0 opacity-50" />}
          </button>
        );
      })}
    </nav>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        {/*
          A centered modal, matching workspace settings. Sheet and Dialog are the
          same Radix primitive, so role/aria/scroll-lock/Esc are unchanged — only
          the classes and the open animation differ.

          The height is FIXED, not a max: min-h-0 flex-1 on the row below only
          bounds the scroller if the card itself has a definite height. With a
          content height the pane stops scrolling and overflow-hidden clips it
          with no scrollbar to recover.

          svh, not dvh: dvh tracks the browser chrome, so on iOS a fixed-height
          card would resize under the finger mid-scroll. The other dvh uses in
          this repo are all max-h caps, where that movement is invisible.

          Same 980px cap as workspace settings, but expressed as w-[90vw] +
          max-w rather than its sm:w-[840px] md:w-[980px] steps: those are
          inverted, so between 640 and 767px the card is wider than the viewport
          and gets clipped by the centering transform.
        */}
        <DialogContent className="flex h-[90svh] w-[90vw] max-w-[980px] flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5" />
              {t`Account settings`}
            </DialogTitle>
            <DialogDescription>
              {t`Manage your profile and account preferences.`}
            </DialogDescription>
          </DialogHeader>

          {/*
            One rail, one content column, and each pane written exactly once: on
            mobile the rail becomes the full-width list and the content replaces it
            after a pick (drill-in), on desktop they sit side by side.
          */}
          <div className="mt-2 flex min-h-0 flex-1 gap-6">
            {(!isMobile || !mobileSectionOpen) && (
              <div className={cn(isMobile ? 'w-full' : 'w-[200px] shrink-0 border-r border-border pr-3')}>
                {renderNav(isMobile ? () => setMobileSectionOpen(true) : undefined)}
              </div>
            )}

            {(!isMobile || mobileSectionOpen) && (
              <div className="min-w-0 flex-1 overflow-y-auto pr-1">
                {isMobile && (
                  <button
                    type="button"
                    onClick={() => setMobileSectionOpen(false)}
                    className="-ml-1 mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {t`All settings`}
                  </button>
                )}
                <h2 className={cn('mb-4 text-base font-semibold', activeSection === 'danger' && 'text-destructive')}>
                  {activeLabel}
                </h2>
                {/* The card is 980px wide; settings rows read badly stretched across
                    the whole of it, so the pane keeps a comfortable measure. */}
                <div className="max-w-[560px] pb-2">
              {/* ---------------- PROFILE ---------------- */}
              {activeSection === 'profile' && (
              <div className="space-y-5">
                <div className="flex flex-col items-center space-y-4 text-center">
                  {user && (
                    <AvatarWithEditButton
                      userId={user.id}
                      avatarUrl={profileAvatarUrl ?? null}
                      initials={initials}
                      onAvatarChange={(url) => updateAvatarUrl(url)}
                      disabled={loading}
                    />
                  )}

                  <div className="w-full max-w-xs space-y-2">
                    {isEditingName ? (
                      <>
                        <Input
                          value={displayName}
                          onChange={(e) => {
                            setDisplayName(e.target.value);
                            setSaved(false);
                          }}
                          placeholder={t`Add your name`}
                          disabled={!user || loading}
                        />
                        <div className="flex items-center gap-2">
                          {showSave && (
                            <Button onClick={handleSave} disabled={!user || loading} className="w-full">
                              {t`Save`}
                            </Button>
                          )}
                          {canCancelEditing && (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                setDisplayName(initialDisplayName);
                                setIsEditingName(false);
                                setSaved(false);
                              }}
                              disabled={!canEditName}
                              className="w-full"
                            >
                              {t`Cancel`}
                            </Button>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="inline-flex items-start gap-1 text-lg font-semibold text-foreground">
                        <span>{displayName}</span>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-3.5 w-3.5 -mt-1 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setIsEditingName(true);
                            setSaved(false);
                          }}
                          disabled={!canEditName}
                          aria-label={t`Edit name`}
                        >
                          <Pencil className="h-2 w-2" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="text-sm text-muted-foreground">{signedInLabel}</div>

                  {error && <div className="text-sm text-destructive">{error}</div>}
                  {saved && <div className="text-sm text-emerald-600">{t`Saved.`}</div>}

                  <ProfileSummary summary={summary} animate={open} />
                </div>

                {/* No longer pinned with mt-auto: the pane scrolls inside the rail
                    layout instead of owning the full card height. */}
                <div className="flex flex-col items-center gap-3 border-t pt-5">
                  {summary.monthsInMotio !== null && (
                    <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                      <CalendarDays className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span>{t`${months} mo in Motio`}</span>
                    </div>
                  )}

                  {isDemo ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        demoStore.clear();
                        onOpenChange(false);
                        if (typeof window !== 'undefined') {
                          window.location.href = '/';
                        }
                      }}
                      className="gap-2"
                    >
                      <LogOut className="h-4 w-4" />
                      {t`Exit demo`}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => signOut()}
                      className="gap-2"
                    >
                      <LogOut className="h-4 w-4" />
                      {t`Sign out`}
                    </Button>
                  )}
                </div>
              </div>
              )}

              {/* ---------------- APPEARANCE ---------------- */}
              {activeSection === 'appearance' && (
                <div className="space-y-5">
                  <div className="space-y-2 text-left">
                    <Label htmlFor="account-language">{t`Language`}</Label>
                    <Select value={locale} onValueChange={handleLocaleChange} disabled={localeSaving}>
                      <SelectTrigger id="account-language">
                        <SelectValue placeholder={t`Select language`} />
                      </SelectTrigger>
                      <SelectContent>
                        {languageOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 border-t pt-4 text-left">
                    <Label htmlFor="account-accent">{t`Interface color`}</Label>
                    <Select
                      value={accentId}
                      onValueChange={handleAccentChange}
                      disabled={!user || loading}
                    >
                      <SelectTrigger id="account-accent" aria-label={t`Interface color`}>
                        {/* A div (not span) avoids the trigger's [&>span]:line-clamp
                            clobbering the flex layout; the swatch sits on the right. */}
                        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                          <span className="truncate">{getAccentLabel(accentId)}</span>
                          <span
                            aria-hidden
                            className="h-4 w-4 shrink-0 rounded-full border border-border"
                            style={{ backgroundColor: `hsl(${getAccentSwatch(accentId).primary})` }}
                          />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {ACCENT_SWATCHES.map((swatch) => (
                          <SelectItem key={swatch.id} value={swatch.id}>
                            <span className="flex items-center gap-2">
                              <span
                                aria-hidden
                                className="h-4 w-4 shrink-0 rounded-full border border-border"
                                style={{ backgroundColor: `hsl(${swatch.primary})` }}
                              />
                              {getAccentLabel(swatch.id)}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {t`Choose the accent color used across the interface`}
                    </p>
                  </div>

                  <div className="space-y-2 border-t pt-4 text-left">
                    <Label htmlFor="account-time-off-motif">{t`Time off pattern`}</Label>
                    <Select
                      value={timeOffMotifId}
                      onValueChange={handleTimeOffMotifChange}
                      disabled={!user || loading}
                    >
                      <SelectTrigger id="account-time-off-motif" aria-label={t`Time off pattern`}>
                        {/* A div, not a span: the trigger's [&>span]:line-clamp
                            would clobber the flex layout (see the accent row). */}
                        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                          <span className="truncate">{getTimeOffMotifLabel(timeOffMotifId)}</span>
                          <span
                            aria-hidden
                            data-time-off-motif={timeOffMotifId}
                            className="time-off-motif-swatch h-4 w-4 shrink-0 text-muted-foreground"
                          />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {TIME_OFF_MOTIF_IDS.map((motifId) => (
                          <SelectItem key={motifId} value={motifId}>
                            <span className="flex items-center gap-2">
                              <span
                                aria-hidden
                                data-time-off-motif={motifId}
                                className="time-off-motif-swatch h-4 w-4 shrink-0 text-muted-foreground"
                              />
                              {getTimeOffMotifLabel(motifId)}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {t`The pattern drawn on your days off. Your teammates see it too`}
                    </p>
                  </div>

                  <div className="space-y-2 border-t pt-4 text-left">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="week-view-toggle" className="cursor-pointer">
                        {t`Week view on the timeline`}
                      </Label>
                      <Switch
                        id="week-view-toggle"
                        checked={weekViewEnabled}
                        onCheckedChange={handleWeekViewToggle}
                        disabled={!user || loading}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t`Add a "Week" button next to Day and Calendar`}
                    </p>
                  </div>

                  {error && <div className="text-sm text-destructive">{error}</div>}
                </div>
              )}

              {/* ---------------- NOTIFICATIONS ---------------- */}
              {activeSection === 'notifications' && (
                <div className="space-y-5">
                  <div className="space-y-2 text-left">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="daily-brief-toggle" className="cursor-pointer">
                        {t`Daily brief`}
                      </Label>
                      <Switch
                        id="daily-brief-toggle"
                        checked={dailyBriefEnabled}
                        onCheckedChange={handleDailyBriefToggle}
                        disabled={!user || loading}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t`Show daily task summary each morning`}
                    </p>
                  </div>

                  {!isDemo && (
                    <div className="space-y-2 border-t pt-4 text-left">
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="marketing-emails-toggle" className="cursor-pointer">
                          {t`Product news by email`}
                        </Label>
                        <Switch
                          id="marketing-emails-toggle"
                          checked={marketingEmailsEnabled}
                          onCheckedChange={handleMarketingEmailsToggle}
                          disabled={!user || loading}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t`Occasional announcements and tips. Every email has a one-click unsubscribe.`}
                      </p>
                    </div>
                  )}

                  {pushSupported && (
                    <div className="space-y-3 border-t pt-4 text-left">
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="push-master-toggle" className="cursor-pointer">
                          {t`Browser notifications`}
                        </Label>
                        <Switch
                          id="push-master-toggle"
                          checked={pushEnabled}
                          onCheckedChange={handlePushMasterToggle}
                          disabled={!user || loading || pushBusy}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t`Get notified in this browser about your tasks, even when Motio isn't open.`}
                      </p>

                      {pushEnabled && (
                        <div className="space-y-3 pt-1">
                          <div className="flex items-center justify-between gap-3">
                            <Label htmlFor="push-assignment" className="cursor-pointer text-sm font-normal">
                              {t`A task is assigned to me`}
                            </Label>
                            <Switch
                              id="push-assignment"
                              checked={pushOnAssignment}
                              onCheckedChange={(checked) => updatePushEventPref('push_on_assignment', checked, setPushOnAssignment, pushOnAssignment)}
                              disabled={pushBusy}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <Label htmlFor="push-mention" className="cursor-pointer text-sm font-normal">
                              {t`I'm mentioned in a comment`}
                            </Label>
                            <Switch
                              id="push-mention"
                              checked={pushOnMention}
                              onCheckedChange={(checked) => updatePushEventPref('push_on_mention', checked, setPushOnMention, pushOnMention)}
                              disabled={pushBusy}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <Label htmlFor="push-task-change" className="cursor-pointer text-sm font-normal">
                              {t`One of my tasks changes`}
                            </Label>
                            <Switch
                              id="push-task-change"
                              checked={pushOnTaskChange}
                              onCheckedChange={(checked) => updatePushEventPref('push_on_task_change', checked, setPushOnTaskChange, pushOnTaskChange)}
                              disabled={pushBusy}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <Label htmlFor="push-deadline" className="cursor-pointer text-sm font-normal">
                              {t`A deadline is approaching`}
                            </Label>
                            <Switch
                              id="push-deadline"
                              checked={pushOnDeadline}
                              onCheckedChange={(checked) => updatePushEventPref('push_on_deadline', checked, setPushOnDeadline, pushOnDeadline)}
                              disabled={pushBusy}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {!isDemo && iosPushInstallHint && (
                    <div className="space-y-2 border-t pt-4 text-left">
                      <Label>{t`Notifications on iPhone and iPad`}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t`To get push notifications on iOS, add Motio to your Home Screen: tap Share in Safari, choose "Add to Home Screen", then enable notifications here in the installed app.`}
                      </p>
                    </div>
                  )}

                  {error && <div className="text-sm text-destructive">{error}</div>}
                </div>
              )}

              {/* ---------------- DATA ---------------- */}
              {activeSection === 'data' && (
                <div className="space-y-5">
                  <DataExportButton />
                  {error && <div className="text-sm text-destructive">{error}</div>}
                </div>
              )}

              {/* ---------------- DANGER ZONE ---------------- */}
              {activeSection === 'danger' && (
                <div className="space-y-5">
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                    <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                      {t`Account deletion is permanent. We will ask you to confirm your email.`}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full gap-2 border-destructive/40 bg-background text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setDeleteWizardOpen(true)}
                      disabled={!user || loading}
                    >
                      <Trash2 className="h-4 w-4" />
                      {t`Delete my account`}
                    </Button>
                  </div>

                  {error && <div className="text-sm text-destructive">{error}</div>}
                </div>
              )}
                </div>
              </div>
            )}
          </div>

          {/* Spans the full card, below both the rail and the content. -mx-6/-mb-6
              cancels the dialog's own padding so the rule reaches both edges. */}
          <div className="-mx-6 -mb-6 space-y-2 border-t px-6 py-3 text-center text-[11px] text-muted-foreground">
            <button
              type="button"
              onClick={() => setReleaseNotesOpen(true)}
              className="block w-full leading-none text-muted-foreground transition-colors hover:text-foreground"
            >
              {`v${APP_VERSION}`}
            </button>
            <div>
              © Motio,{` `}
              <a
                href="https://nikog.net"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                NIKO G.
              </a>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/*
        Siblings ON PURPOSE, not children: today they survive the settings surface
        closing and keep their own state. Moving them inside would break the focus
        trap and kill the delete wizard mid-flow. (AvatarEditModal is the opposite
        case — it is mounted inside so it resets with the surface.)
      */}
      {accountDeletionEnabled && (
        <DeleteAccountWizard
          open={deleteWizardOpen}
          onOpenChange={setDeleteWizardOpen}
        />
      )}

      <Dialog open={releaseNotesOpen} onOpenChange={setReleaseNotesOpen}>
        <DialogContent className="w-[95vw] max-w-xl">
          <DialogHeader>
            <DialogTitle>{isRussianLocale ? 'Последние изменения' : 'Latest changes'}</DialogTitle>
            <DialogDescription>
              {isRussianLocale ? `Версия ${APP_VERSION}` : `Version ${APP_VERSION}`}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-6 overflow-y-auto pr-1 text-left">
            <ReleaseNotesList entries={releaseNotes} isRussianLocale={isRussianLocale} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
