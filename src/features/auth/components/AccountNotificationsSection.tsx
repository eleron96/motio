import React from 'react';
import { Label } from '@/shared/ui/label';
import { Switch } from '@/shared/ui/switch';
import { t } from '@lingui/macro';
import type { AccountSettings } from '@/features/auth/hooks/useAccountSettings';

interface AccountNotificationsSectionProps {
  settings: AccountSettings;
  isDemo: boolean;
  switchSize: 'touch' | 'default';
}

/** Account → Notifications: the daily brief, product emails and browser push. */
export const AccountNotificationsSection: React.FC<AccountNotificationsSectionProps> = ({
  settings,
  isDemo,
  switchSize,
}) => {
  const {
    dailyBriefEnabled,
    error,
    handleDailyBriefToggle,
    handleMarketingEmailsToggle,
    handlePushMasterToggle,
    iosPushInstallHint,
    loading,
    marketingEmailsEnabled,
    pushBusy,
    pushEnabled,
    pushOnAssignment,
    pushOnMention,
    pushOnTaskChange,
    pushSupported,
    setPushOnAssignment,
    setPushOnMention,
    setPushOnTaskChange,
    updatePushEventPref,
    user,
  } = settings;

  return (
    <div className="space-y-5">
      <div className="space-y-2 text-left">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="daily-brief-toggle" className="cursor-pointer">
            {t`Daily brief`}
          </Label>
          <Switch
            size={switchSize}
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
              size={switchSize}
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
              size={switchSize}
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
                  size={switchSize}
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
                  size={switchSize}
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
                  size={switchSize}
                  id="push-task-change"
                  checked={pushOnTaskChange}
                  onCheckedChange={(checked) => updatePushEventPref('push_on_task_change', checked, setPushOnTaskChange, pushOnTaskChange)}
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
  );
};
