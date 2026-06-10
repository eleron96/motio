import React, { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { AlertTriangle, Database, LogOut, Pencil, Sliders, Trash2, User } from 'lucide-react';
import { useAuthStore } from '@/features/auth/store/authStore';
import { Switch } from '@/shared/ui/switch';
import { useLocaleStore } from '@/shared/store/localeStore';
import { localeLabels, type Locale } from '@/shared/lib/locale';
import { APP_VERSION, getLatestReleaseNotes } from '@/shared/lib/releaseNotes';
import { getAccountInitials, getAccountSignedInLabel } from '@/shared/lib/accountIdentity';
import { AvatarWithEditButton } from './AvatarWithEditButton';
import { DeleteAccountWizard } from './DeleteAccountWizard';
import { DataExportButton } from './DataExportButton';
import { isAccountDeletionEnabled } from '@/shared/lib/featureFlags';
import { useIsDemo } from '@/features/demo/hooks/useIsDemo';
import { demoStore } from '@/features/demo/lib/demoDataStore';
import { t } from '@lingui/macro';

interface AccountSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Shared trigger class — underline style (active tab gets a bottom border + primary color)
// rather than the default filled pill, to match the handoff "Variant B" design.
// On mobile we let tabs keep their natural width (left-aligned), on >=sm we stretch
// them evenly across the sheet so the underline feels balanced.
const TAB_TRIGGER_CLASS = [
  'gap-2 rounded-none border-b-2 border-transparent bg-transparent px-3 py-2.5',
  'sm:flex-1 sm:px-2',
  '-mb-px text-sm font-medium text-muted-foreground shadow-none',
  'data-[state=active]:border-primary data-[state=active]:bg-transparent',
  'data-[state=active]:text-primary data-[state=active]:shadow-none',
  'data-[state=active]:font-semibold',
].join(' ');

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
  } = useAuthStore();
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
  // The data tab (account deletion + export) is meaningless for an anon
  // demo session — the cleanup cron handles "deletion" automatically.
  const accountDeletionEnabled = isAccountDeletionEnabled() && !isDemo;
  const [dailyBriefEnabled, setDailyBriefEnabled] = useState(true);
  const [currentPrefs, setCurrentPrefs] = useState<Record<string, unknown>>({});
  // When the delete wizard opens the user elsewhere on the Profile tab (to fix their
  // display name), we need to switch tabs. Controlled value lets us do that.
  const [activeTab, setActiveTab] = useState<'profile' | 'preferences' | 'data'>('profile');

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
    setActiveTab('profile');
  }, [open]);

  const signedInLabel = getAccountSignedInLabel(user, t`Unknown user`);
  const initials = getAccountInitials(displayName, signedInLabel);

  const isDisplayNameDirty = displayName !== initialDisplayName;
  const showSave = Boolean(user && isEditingName && isDisplayNameDirty);
  const canCancelEditing = Boolean(initialDisplayName.trim());
  const canEditName = Boolean(user && !loading);
  const isRussianLocale = locale === 'ru';
  const languageOptions: Array<{ value: Locale; label: string }> = [
    { value: 'en', label: localeLabels.en },
    { value: 'ru', label: localeLabels.ru },
  ];
  const releaseNotes = useMemo(() => getLatestReleaseNotes(locale), [locale]);

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

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="flex h-full w-full max-w-full flex-col gap-0 p-0 sm:w-[480px] sm:max-w-[480px]">
          <SheetHeader className="px-6 pb-3 pt-6 text-left">
            <SheetTitle>{t`Account settings`}</SheetTitle>
            <SheetDescription className="sr-only">
              {t`Manage your profile and account preferences.`}
            </SheetDescription>
          </SheetHeader>

          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as typeof activeTab)}
            className="flex flex-1 flex-col overflow-hidden"
          >
            <TabsList className="h-auto w-full justify-start rounded-none border-b bg-transparent p-0 px-5 sm:justify-stretch">
              <TabsTrigger value="profile" className={TAB_TRIGGER_CLASS}>
                <User className="h-4 w-4" />
                {t`Profile`}
              </TabsTrigger>
              <TabsTrigger value="preferences" className={TAB_TRIGGER_CLASS}>
                <Sliders className="h-4 w-4" />
                {t`Preferences`}
              </TabsTrigger>
              {accountDeletionEnabled && (
                <TabsTrigger value="data" className={TAB_TRIGGER_CLASS}>
                  <Database className="h-4 w-4" />
                  {t`Data`}
                </TabsTrigger>
              )}
            </TabsList>

            <div className="flex-1 overflow-y-auto">
              {/* ---------------- PROFILE TAB ---------------- */}
              <TabsContent value="profile" className="mt-0 px-6 py-5 focus-visible:outline-none">
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
                      className="mt-2 gap-2"
                    >
                      <LogOut className="h-4 w-4" />
                      {t`Exit demo`}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => signOut()}
                      className="mt-2 gap-2"
                    >
                      <LogOut className="h-4 w-4" />
                      {t`Sign out`}
                    </Button>
                  )}
                </div>
              </TabsContent>

              {/* ---------------- PREFERENCES TAB ---------------- */}
              <TabsContent value="preferences" className="mt-0 px-6 py-5 focus-visible:outline-none">
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

                  {error && <div className="text-sm text-destructive">{error}</div>}
                </div>
              </TabsContent>

              {/* ---------------- DATA TAB ---------------- */}
              {accountDeletionEnabled && (
                <TabsContent value="data" className="mt-0 px-6 py-5 focus-visible:outline-none">
                  <div className="space-y-5">
                    <DataExportButton />

                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                      <div className="mb-2 flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span className="text-xs font-semibold uppercase tracking-wide">
                          {t`Danger zone`}
                        </span>
                      </div>
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
                </TabsContent>
              )}
            </div>
          </Tabs>

          <div className="space-y-2 border-t px-6 py-3 text-center text-[11px] text-muted-foreground">
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
        </SheetContent>
      </Sheet>

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
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1 text-left">
            {releaseNotes.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {isRussianLocale ? 'Нет записей о последних изменениях.' : 'No recent change entries available.'}
              </p>
            )}
            {releaseNotes.map((section) => (
              <section key={section.title} className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground">{section.title}</h4>
                <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
                  {section.items.map((item) => (
                    <li key={`${section.title}-${item}`}>{item}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
