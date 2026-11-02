import React, { useMemo, useState } from 'react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useDashboardStore } from '@/features/dashboard/store/dashboardStore';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Switch } from '@/shared/ui/switch';
import { Badge } from '@/shared/ui/badge';
import { t } from '@lingui/macro';
import { MobileStepper } from '@/shared/ui/mobile-stepper';
import { Block, SettingRow } from '@/features/workspace/components/settingsBlocks';
import { useShallow } from 'zustand/react/shallow';

interface WorkspaceDisplaySettingsProps {
  isAdmin: boolean;
  isMobile: boolean;
  /** The capacity field's draft; the panel owns it so it outlives section switches. */
  heatmapCapacityInput: string;
  setHeatmapCapacityInput: (value: string) => void;
}

/**
 * Settings → Display: whether the timeline shows unassigned tasks (a personal
 * filter), the workload heatmap and its capacity, and clearing the sample data.
 */
export const WorkspaceDisplaySettings: React.FC<WorkspaceDisplaySettingsProps> = ({
  isAdmin,
  isMobile,
  heatmapCapacityInput,
  setHeatmapCapacityInput,
}) => {
  const { filters, setFilters } = usePlannerStore(useShallow((state) => ({
    filters: state.filters,
    setFilters: state.setFilters,
  })));
  const { user, workspaces, currentWorkspaceId, updateWorkspaceHeatmapEnabled, updateWorkspaceHeatmapCapacity } = useAuthStore(
    useShallow((state) => ({
      user: state.user,
      workspaces: state.workspaces,
      currentWorkspaceId: state.currentWorkspaceId,
      updateWorkspaceHeatmapEnabled: state.updateWorkspaceHeatmapEnabled,
      updateWorkspaceHeatmapCapacity: state.updateWorkspaceHeatmapCapacity,
    })),
  );
  const currentWorkspace = workspaces.find((workspace) => workspace.id === currentWorkspaceId);

  const heatmapAutoCapacity = useDashboardStore((state) => state.heatmapAutoCapacity);
  const heatmapCapacityPlaceholder = heatmapAutoCapacity != null
    ? `${t`Auto`} ≈ ${Math.round(heatmapAutoCapacity * 10) / 10}`
    : t`Auto`;

  const [heatmapSaving, setHeatmapSaving] = useState(false);
  const [heatmapCapacitySaving, setHeatmapCapacitySaving] = useState(false);
  // The mobile stepper works on a number; an empty field means "auto".
  const heatmapCapacityValue = useMemo(() => {
    const parsed = Number(heatmapCapacityInput.trim().replace(',', '.'));
    return heatmapCapacityInput.trim() !== '' && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [heatmapCapacityInput]);

  const hasSampleData = usePlannerStore((state) => state.hasSampleData);
  const clearSampleData = usePlannerStore((state) => state.clearSampleData);
  const [clearingSamples, setClearingSamples] = useState(false);

  // Тот же выбор, что предлагается в конце тура, — на случай если тур закрыли
  // или человек пришёл с телефона, где тур не запускается.
  const handleClearSampleData = async () => {
    if (!currentWorkspaceId) return;
    setClearingSamples(true);
    const result = await clearSampleData(currentWorkspaceId);
    setClearingSamples(false);
    if (result.error) return;

    // Перезагружаем страницу, чтобы от примеров не осталось следов ни на одном
    // из открытых экранов — человек ведь просил «начать с чистого листа».
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  const showUnassigned = !filters.hideUnassigned;

  // "Show unassigned" stays a personal timeline filter — it just lives here now
  // instead of on the timeline toolbar. Persist immediately so the change sticks
  // even when settings are opened off the timeline page (where PlannerPage's
  // own filter-persist effect doesn't run).
  const handleToggleShowUnassigned = (checked: boolean) => {
    const hideUnassigned = !checked;
    setFilters({ hideUnassigned });
    if (user?.id && typeof window !== 'undefined') {
      const next = { ...usePlannerStore.getState().filters, hideUnassigned };
      window.localStorage.setItem(`planner-filters-${user.id}`, JSON.stringify(next));
    }
  };

  const handleToggleHeatmap = async (checked: boolean) => {
    if (!currentWorkspaceId) return;
    setHeatmapSaving(true);
    await updateWorkspaceHeatmapEnabled(currentWorkspaceId, checked);
    setHeatmapSaving(false);
  };

  const handleSaveHeatmapCapacity = async () => {
    if (!currentWorkspaceId) return;
    const trimmed = heatmapCapacityInput.trim();
    const parsed = trimmed === '' ? null : Number(trimmed.replace(',', '.'));
    const value = parsed !== null && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    setHeatmapCapacitySaving(true);
    await updateWorkspaceHeatmapCapacity(currentWorkspaceId, value);
    setHeatmapCapacitySaving(false);
  };

  return (
    <div className="space-y-5">
      {hasSampleData && (
        <Block title={t`Example data`}>
          <SettingRow
            title={t`Examples on the timeline`}
            description={t`Remove the sample projects, people and tasks this workspace started with`}
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClearSampleData}
              disabled={clearingSamples || !isAdmin}
            >
              {clearingSamples ? t`Clearing…` : t`Remove examples`}
            </Button>
          </SettingRow>
        </Block>
      )}
      <Block title={t`Tasks`}>
        <SettingRow
          title={t`Unassigned`}
          description={t`Show tasks without an assignee`}
          htmlFor="settings-show-unassigned"
        >
          <Switch
            id="settings-show-unassigned"
            size={isMobile ? 'touch' : 'default'}
            checked={showUnassigned}
            onCheckedChange={handleToggleShowUnassigned}
            aria-label={t`Show unassigned`}
          />
        </SettingRow>
      </Block>
      <Block title={t`Team workload`}>
        <SettingRow
          title={(
            <span className="inline-flex flex-wrap items-center gap-2">
              {t`Workload heatmap`}
              <Badge variant="secondary" className="font-normal">
                {t`experimental`}
              </Badge>
            </span>
          )}
          description={t`Show the department workload board on the dashboard`}
          htmlFor="settings-heatmap-enabled"
        >
          <Switch
            id="settings-heatmap-enabled"
            size={isMobile ? 'touch' : 'default'}
            checked={currentWorkspace?.heatmapEnabled ?? false}
            onCheckedChange={handleToggleHeatmap}
            disabled={!isAdmin || !currentWorkspaceId || heatmapSaving}
            aria-label={t`Toggle workload heatmap`}
          />
        </SettingRow>
        {(currentWorkspace?.heatmapEnabled ?? false) && (
          <div className="space-y-2 border-t border-border pt-4">
            <Label htmlFor="settings-heatmap-capacity">
              {t`Full working day (tasks per person)`}
            </Label>
            <div className="flex items-center gap-2">
              {isMobile ? (
                // A number field would summon the keyboard over half the
                // screen for a value that only ever moves in half steps.
                <MobileStepper
                  value={heatmapCapacityValue}
                  onChange={(next) => setHeatmapCapacityInput(String(next))}
                  fallback={Math.max(1, Math.round(heatmapAutoCapacity ?? 5))}
                  min={1}
                  max={20}
                  step={0.5}
                  placeholder={heatmapCapacityPlaceholder}
                  disabled={!isAdmin || !currentWorkspaceId || heatmapCapacitySaving}
                  aria-label={t`Full working day (tasks per person)`}
                />
              ) : (
                <Input
                  id="settings-heatmap-capacity"
                  type="number"
                  min="1"
                  step="0.5"
                  inputMode="decimal"
                  placeholder={heatmapCapacityPlaceholder}
                  value={heatmapCapacityInput}
                  onChange={(event) => setHeatmapCapacityInput(event.target.value)}
                  disabled={!isAdmin || !currentWorkspaceId || heatmapCapacitySaving}
                  className="w-32"
                />
              )}
              <Button
                className={isMobile ? 'h-11 flex-1' : undefined}
                onClick={handleSaveHeatmapCapacity}
                disabled={
                  !isAdmin
                  || !currentWorkspaceId
                  || heatmapCapacitySaving
                  || heatmapCapacityInput.trim() === (
                    currentWorkspace?.heatmapCapacityPerPerson != null
                      ? String(currentWorkspace.heatmapCapacityPerPerson)
                      : ''
                  )
                }
              >
                {t`Save`}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t`This is the load that counts as 100%. Leave empty to auto-tune it from your team's recent history.`}
            </p>
          </div>
        )}
      </Block>
    </div>
  );
};
