import { type ComponentType, type LazyExoticComponent } from 'react';
import { lazyNamed } from '@/shared/lib/lazyComponent';

export interface EasterEgg {
  /** Supabase auth user id (auth.users.id) this egg targets. */
  match: string;
  /** Flip to false to turn this egg off without removing the entry. */
  enabled: boolean;
  /**
   * Lazily-loaded overlay component. The `import()` only runs when a matching
   * user actually renders the egg, so the egg's code + CSS ship as a separate
   * chunk and never load for anyone else.
   */
  Component: LazyExoticComponent<ComponentType>;
}

/** Master switch — set to false to disable every easter egg at once. */
export const EASTER_EGGS_ENABLED = true;

/**
 * One entry per user. To add an egg for someone new, drop in a new line here
 * (and a new lazily-imported component if the effect differs) — the daily-brief
 * modal does not need to change.
 */
// Shared "falling 6 and 7" egg — one chunk, reused for the three people below.
const SixSevenBrief = lazyNamed(
  () => import('./components/SixSevenBrief'),
  'SixSevenBrief',
);

export const EASTER_EGGS: EasterEgg[] = [
  {
    // a.kuprina@speech.su (Nastya) — matched by user id so SSO email quirks don't matter.
    match: 'f3d2d05e-9475-4d4c-813b-669b9eb32592',
    enabled: true,
    Component: lazyNamed(
      () => import('./components/ShabbatBrief'),
      'ShabbatBrief',
    ),
  },
  {
    // s.pavlova@speech.su (Светлана Павлова) — falling 6 & 7.
    match: '77fab19c-9f13-4732-872f-c920340404f8',
    enabled: true,
    Component: SixSevenBrief,
  },
  {
    // n.tokocheva@speech.su (Наиля Токочева) — falling 6 & 7.
    match: '32c03e77-eb1c-4be3-acb3-88080ed19237',
    enabled: true,
    Component: SixSevenBrief,
  },
  {
    // a.rerikh@speech.su (Александра «Саша» Рерих) — falling 6 & 7.
    match: '170ebc84-d358-4291-830d-e61cb2fad180',
    enabled: true,
    Component: SixSevenBrief,
  },
];
