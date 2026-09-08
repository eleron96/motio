/**
 * Free-form per-project status («В РАБОТЕ», «ЗАМОРОЖЕН», …) — column
 * `public.projects.status`, added in migration 0087.
 *
 * The UI renders the status in caps everywhere (chip in the card header, card
 * sidebar, mobile list), so the stored value is kept in caps too. Otherwise the
 * same status typed in two different dialogs produces two different rows —
 * visually identical because of the CSS, but distinct as data: the raw value
 * still leaks into `title` / `aria-label`, and grouping or filtering by status
 * would split «в работе» from «В РАБОТЕ».
 *
 * Every entry point (create dialog, project settings, inline chip, mobile
 * sheet) goes through these two helpers: `format…` for the controlled input,
 * `normalize…` for the value that reaches the database.
 */

/** Caps a draft while the user types. Used for the controlled input value. */
export const formatProjectStatusInput = (value: string): string => value.toUpperCase();

/**
 * Value to persist: trimmed and capped, with an empty status stored as `null`
 * rather than an empty string (the column is nullable and "no status" is a
 * real state — the card shows an "Add status" affordance for it).
 */
export const normalizeProjectStatus = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed ? formatProjectStatusInput(trimmed) : null;
};
