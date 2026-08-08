import { type ComponentType, type LazyExoticComponent } from 'react';
import { lazyNamed } from '@/shared/lib/lazyComponent';

/**
 * Easter-egg catalog: the EFFECTS live in code (lazy React overlay components),
 * keyed by a stable `EggKey`. WHO gets which key is data — resolved at runtime
 * from the DB (see `useEasterEgg` → RPC `get_my_daily_brief_egg`).
 *
 * To add a new effect: drop a component in `./components`, add a key to `EggKey`
 * and a line to `EGG_CATALOG`. Assigning it to a user is then a DB row, no deploy.
 * Each effect is a body-level portal overlay that respects prefers-reduced-motion.
 */
export type EggKey =
  | 'shabbat'
  | 'six-seven'
  | 'mashallah'
  // Anniversary effects: keyed by what they look like, not by whose
  // anniversary it is, so the next one can reuse them.
  | 'anniversary-blueprint'
  | 'anniversary-salute';

/** Master kill switch — set to false to disable every easter egg at once. */
export const EASTER_EGGS_ENABLED = true;

export const EGG_CATALOG: Record<EggKey, LazyExoticComponent<ComponentType>> = {
  shabbat: lazyNamed(() => import('./components/ShabbatBrief'), 'ShabbatBrief'),
  'six-seven': lazyNamed(() => import('./components/SixSevenBrief'), 'SixSevenBrief'),
  mashallah: lazyNamed(() => import('./components/MashallahBrief'), 'MashallahBrief'),
  'anniversary-blueprint': lazyNamed(
    () => import('./components/AnniversaryBlueprintBrief'),
    'AnniversaryBlueprintBrief',
  ),
  'anniversary-salute': lazyNamed(
    () => import('./components/AnniversarySaluteBrief'),
    'AnniversarySaluteBrief',
  ),
};

/** Narrows an unknown value (e.g. an RPC result) to a known catalog key. */
export const isEggKey = (value: unknown): value is EggKey =>
  typeof value === 'string'
  && Object.prototype.hasOwnProperty.call(EGG_CATALOG, value);
