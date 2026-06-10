import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

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
export const EASTER_EGGS: EasterEgg[] = [
  {
    // a.kuprina@speech.su (Nastya) — matched by user id so SSO email quirks don't matter.
    match: 'f3d2d05e-9475-4d4c-813b-669b9eb32592',
    enabled: true,
    Component: lazy<ComponentType>(() =>
      import('./components/ShabbatBrief').then((m) => ({ default: m.ShabbatBrief })),
    ),
  },
];
