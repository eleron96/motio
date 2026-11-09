import React, { useEffect } from 'react';
import { t } from '@lingui/macro';
import { useShallow } from 'zustand/react/shallow';
import { useTimelineDensityStore } from '@/features/planner/store/timelineDensityStore';
import { TIMELINE_DENSITIES, type TimelineDensity } from '@/features/planner/lib/timelineDensity';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/sonner';
import { cn } from '@/shared/lib/classNames';
import { Block } from '@/features/workspace/components/settingsBlocks';

interface WorkspaceTimelineDensitySettingProps {
  workspaceId: string;
  isAdmin: boolean;
}

const densityText = (density: TimelineDensity) => {
  switch (density) {
    case 'normal': return { label: t`Normal`, hint: t`Large photos, two lines on each task.` };
    case 'small_photos': return { label: t`Small photos`, hint: t`A small photo next to the name; rows only as tall as their tasks.` };
    case 'compact': return { label: t`Compact`, hint: t`Small photos and one-line tasks: about twice as many people on screen.` };
  }
};

/**
 * Settings → Display, with the server setting timeline.density on: how dense
 * the timeline is for everyone in this workspace on a computer. Phones keep the
 * usual layout.
 */
export const WorkspaceTimelineDensitySetting: React.FC<WorkspaceTimelineDensitySettingProps> = ({
  workspaceId,
  isAdmin,
}) => {
  const { density, load, setDensity } = useTimelineDensityStore(useShallow((state) => ({
    density: state.byWorkspace[workspaceId] ?? 'normal',
    load: state.load,
    setDensity: state.setDensity,
  })));

  useEffect(() => {
    void load(workspaceId);
  }, [workspaceId, load]);

  const handleSelect = async (next: TimelineDensity) => {
    if (next === density) return;
    const result = await setDensity(workspaceId, next);
    if (result.error) toast.error(result.error);
  };

  return (
    <Block
      title={t`Timeline density`}
      description={t`For everyone in this workspace on a computer; phones keep the usual layout.`}
    >
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t`Timeline density`}>
        {TIMELINE_DENSITIES.map((option) => (
          <Button
            key={option}
            type="button"
            role="radio"
            aria-checked={option === density}
            variant={option === density ? 'secondary' : 'outline'}
            className={cn(option === density && 'ring-1 ring-primary')}
            disabled={!isAdmin}
            onClick={() => void handleSelect(option)}
          >
            {densityText(option).label}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{densityText(density).hint}</p>
    </Block>
  );
};
