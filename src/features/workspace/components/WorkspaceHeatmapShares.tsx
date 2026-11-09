import React, { useEffect, useMemo, useState } from 'react';
import { t } from '@lingui/macro';
import { useShallow } from 'zustand/react/shallow';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useDashboardStore } from '@/features/dashboard/store/dashboardStore';
import { DEFAULT_CAPACITY_PERCENT, normalizeCapacityPercent } from '@/features/dashboard/lib/workloadHeatmap';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { MobileStepper } from '@/shared/ui/mobile-stepper';
import { toast } from '@/shared/ui/sonner';

interface WorkspaceHeatmapSharesProps {
  workspaceId: string;
  isAdmin: boolean;
  isMobile: boolean;
}

const ShareField: React.FC<{
  name: string;
  value: number;
  disabled: boolean;
  isMobile: boolean;
  onSave: (percent: number) => void;
}> = ({ name, value, disabled, isMobile, onSave }) => {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const trimmed = draft.trim();
    const next = trimmed === '' ? DEFAULT_CAPACITY_PERCENT : normalizeCapacityPercent(Number(trimmed.replace(',', '.')));
    setDraft(String(next));
    if (next !== value) onSave(next);
  };

  if (isMobile) {
    return (
      <MobileStepper
        value={value}
        onChange={(next) => onSave(normalizeCapacityPercent(next))}
        min={0}
        max={100}
        step={10}
        disabled={disabled}
        aria-label={t`Share of ${name}, percent`}
      />
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="number"
        min="0"
        max="100"
        step="10"
        inputMode="numeric"
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
        }}
        className="w-20 text-right"
        aria-label={t`Share of ${name}, percent`}
      />
      <span className="text-sm text-muted-foreground">%</span>
    </div>
  );
};

/**
 * Settings → Display → Team workload, with the server setting
 * heatmap.personCapacity on: each person's share of a full working day for the
 * heatmap. Not a permission and not part of anyone's account — only the
 * heatmap's arithmetic uses it.
 */
export const WorkspaceHeatmapShares: React.FC<WorkspaceHeatmapSharesProps> = ({ workspaceId, isAdmin, isMobile }) => {
  const assignees = usePlannerStore((state) => state.assignees);
  const { personCapacities, loadPersonCapacities, setPersonCapacity } = useDashboardStore(useShallow((state) => ({
    personCapacities: state.personCapacities,
    loadPersonCapacities: state.loadPersonCapacities,
    setPersonCapacity: state.setPersonCapacity,
  })));

  useEffect(() => {
    void loadPersonCapacities(workspaceId);
  }, [workspaceId, loadPersonCapacities]);

  const people = useMemo(
    () => assignees
      .filter((assignee) => assignee.isActive)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [assignees],
  );
  const values = personCapacities?.workspaceId === workspaceId ? personCapacities.values : null;

  const handleSave = async (assigneeId: string, percent: number) => {
    const result = await setPersonCapacity(workspaceId, assigneeId, percent);
    if (result.error) toast.error(result.error);
  };

  if (people.length === 0) return null;

  return (
    <div className="space-y-2 border-t border-border pt-4">
      <Label>{t`Each person's share`}</Label>
      <p className="text-xs text-muted-foreground">
        {t`100% is a full working day. Someone who plans but takes no tasks counts 0%, a part-timer 50%. Only the heatmap uses this.`}
      </p>
      <ul className="divide-y">
        {people.map((person) => (
          <li key={person.id} className="flex items-center justify-between gap-3 py-1.5">
            <span className="min-w-0 truncate text-sm">{person.name}</span>
            <ShareField
              name={person.name}
              value={values?.[person.id] ?? DEFAULT_CAPACITY_PERCENT}
              disabled={!isAdmin || !values}
              isMobile={isMobile}
              onSave={(percent) => void handleSave(person.id, percent)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
};
