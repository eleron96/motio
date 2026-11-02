import { Boxes, Code, DraftingCompass, HardHat, SquareDashed, type LucideIcon } from 'lucide-react';
import type { StarterTemplateId } from '@/shared/domain/starterTemplate';

/** One picture per starter template, the same in the chooser and in "Create workspace". */
export const STARTER_TEMPLATE_ICONS: Record<StarterTemplateId, LucideIcon> = {
  design: DraftingCompass,
  bim: Boxes,
  construction: HardHat,
  software: Code,
  empty: SquareDashed,
};
