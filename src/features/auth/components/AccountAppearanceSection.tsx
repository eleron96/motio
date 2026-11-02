import React from 'react';
import { Button } from '@/shared/ui/button';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { SegmentedControl, SegmentedControlItem } from '@/shared/ui/segmented-control';
import { Switch } from '@/shared/ui/switch';
import { isBoardViewEnabled } from '@/shared/lib/featureFlags';
import { getTimeOffMotifLabel, TIME_OFF_MOTIF_IDS } from '@/features/planner/lib/timeOffMotifs';
import { ACCENT_SWATCHES, getAccentLabel, getAccentSwatch } from '@/shared/lib/accentColor';
import { t } from '@lingui/macro';
import type { AccountSettings } from '@/features/auth/hooks/useAccountSettings';

interface AccountAppearanceSectionProps {
  settings: AccountSettings;
  isMobile: boolean;
  switchSize: 'touch' | 'default';
}

/** Account → Appearance: language, accent, time-off stamp, timeline views, the tour. */
export const AccountAppearanceSection: React.FC<AccountAppearanceSectionProps> = ({
  settings,
  isMobile,
  switchSize,
}) => {
  const {
    accentId,
    boardViewEnabled,
    error,
    handleAccentChange,
    handleBoardViewToggle,
    handleLocaleChange,
    handleRestartTour,
    handleTimeOffMotifChange,
    handleWeekViewToggle,
    languageOptions,
    loading,
    locale,
    localeSaving,
    timeOffMotifId,
    tourRestarted,
    tourRestarting,
    user,
    weekViewEnabled,
  } = settings;

  return (
    <div className="space-y-5">
      <div className="space-y-2 text-left">
        <Label htmlFor="account-language">{t`Language`}</Label>
        {isMobile ? (
          // Two options — a dropdown that covers the screen to pick between them
          // is all cost and no benefit on a phone.
          <SegmentedControl surface="compact" className="w-full" aria-label={t`Language`}>
            {languageOptions.map((option) => (
              <SegmentedControlItem
                key={option.value}
                size="touch"
                fullWidth
                active={locale === option.value}
                activeClassName="bg-background text-foreground shadow-sm"
                inactiveClassName="text-muted-foreground"
                disabled={localeSaving}
                onClick={() => handleLocaleChange(option.value)}
              >
                {option.label}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
        ) : (
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
        )}
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
            size={switchSize}
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

      {isBoardViewEnabled() && (
        <div className="space-y-2 border-t pt-4 text-left">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="board-view-toggle" className="cursor-pointer">
              {t`Board view (beta)`}
            </Label>
            <Switch
              size={switchSize}
              id="board-view-toggle"
              checked={boardViewEnabled}
              onCheckedChange={handleBoardViewToggle}
              disabled={!user || loading}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {t`Add a "Board" button: tasks as cards in status columns`}
          </p>
        </div>
      )}

      <div className="space-y-2 border-t pt-4 text-left">
        <div className="flex items-center justify-between gap-3">
          <Label className="cursor-default">{t`Product tour`}</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRestartTour}
            disabled={!user || loading || tourRestarting}
          >
            {tourRestarted ? t`Will start on the timeline` : t`Show again`}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t`Walk through the timeline, dashboard, projects and team again`}
        </p>
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}
    </div>
  );
};
