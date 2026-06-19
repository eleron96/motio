import { t } from '@lingui/macro';

// Per-user accent color. The whole app reads the accent from a single CSS
// variable (--primary, mirrored by --ring / --timeline-today / --sidebar-*),
// so switching the accent is just overriding those vars on :root. Keep the
// palette + readers here so the settings UI, the runtime applier and the
// persisted preference all agree. Values are bare HSL channels ("H S% L%") to
// match src/app/index.css (consumed as hsl(var(--primary))).

export const ACCENT_COLOR_PREFERENCE_KEY = 'accent_color';

export interface AccentSwatch {
  id: string;
  /** Bare HSL channels "H S% L%" written into --primary and its mirror tokens. */
  primary: string;
}

// Default reproduces the original terracotta brand exactly, so existing users
// are unchanged until they pick another color.
export const DEFAULT_ACCENT_ID = 'terracotta';

// Soft, slightly muted pastels — light enough to read as "pastel" yet saturated
// enough that the white --primary-foreground stays legible on filled buttons.
export const ACCENT_SWATCHES: AccentSwatch[] = [
  { id: 'terracotta', primary: '17 51% 54%' },
  { id: 'rose', primary: '345 58% 62%' },
  { id: 'sky', primary: '205 60% 56%' },
  { id: 'teal', primary: '175 42% 45%' },
  { id: 'sage', primary: '150 30% 46%' },
  { id: 'lavender', primary: '262 44% 63%' },
  { id: 'ink', primary: '222 18% 16%' },
];

const SWATCH_BY_ID = new Map(ACCENT_SWATCHES.map((swatch) => [swatch.id, swatch]));

export const isValidAccentId = (value: unknown): value is string =>
  typeof value === 'string' && SWATCH_BY_ID.has(value);

export const getAccentColorId = (
  preferences: Record<string, unknown> | null | undefined,
): string => {
  const value = preferences?.[ACCENT_COLOR_PREFERENCE_KEY];
  return isValidAccentId(value) ? value : DEFAULT_ACCENT_ID;
};

export const getAccentSwatch = (id: string): AccentSwatch =>
  SWATCH_BY_ID.get(id) ?? SWATCH_BY_ID.get(DEFAULT_ACCENT_ID)!;

// Human-readable label resolved at call time so it follows the active locale.
export const getAccentLabel = (id: string): string => {
  switch (id) {
    case 'rose':
      return t`Rose`;
    case 'sky':
      return t`Sky`;
    case 'teal':
      return t`Teal`;
    case 'sage':
      return t`Sage`;
    case 'lavender':
      return t`Lavender`;
    case 'ink':
      return t`Ink`;
    case 'terracotta':
    default:
      return t`Terracotta`;
  }
};
