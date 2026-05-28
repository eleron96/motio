import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export interface EasterEgg {
  /** User email this egg targets (compared case-insensitively). */
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
    match: 'a.kuprina@speech.su',
    enabled: true,
    Component: lazy<ComponentType>(() =>
      import('./components/ShabbatBrief').then((m) => ({ default: m.ShabbatBrief })),
    ),
  },
];
