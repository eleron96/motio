import { t } from '@lingui/macro';
import type { HeatmapLevel } from '@/features/dashboard/lib/workloadHeatmap';

/** A short name for each level, for the day reading and the cell's label. */
export const heatmapLevelLabel = (level: HeatmapLevel): string => {
  switch (level) {
    case 1: return t`low`;
    case 2: return t`moderate`;
    case 3: return t`high`;
    case 4: return t`almost full`;
    case 5: return t`overloaded`;
    case 6: return t`heavily overloaded`;
    case 7: return t`critically overloaded`;
    default: return t`free`;
  }
};
