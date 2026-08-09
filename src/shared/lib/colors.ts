export const DEFAULT_NEUTRAL_COLOR = '#94a3b8';
export const DEFAULT_STATUS_COLOR = DEFAULT_NEUTRAL_COLOR;
export const DEFAULT_TAG_COLOR = DEFAULT_NEUTRAL_COLOR;
export const DEFAULT_COLOR_PICKER_VALUE = '#3b82f6';
export const DEFAULT_PROJECT_COLOR = DEFAULT_COLOR_PICKER_VALUE;
export const CHART_GRID_STROKE_COLOR = '#e5e7eb';

export const PROJECT_PRESET_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#ef4444',
  '#14b8a6',
  '#6366f1',
  '#f97316',
  '#84cc16',
] as const;

/**
 * Colours a person can be given in workspace settings, and the automatic
 * fallback the calendar hands out by position (see
 * features/planner/lib/timeOffPalette) — one list, so a hand-picked colour and
 * an auto-assigned one are the same kind of colour.
 *
 * Twenty hues, 18° apart, each with its own saturation and lightness picked to
 * push the colours apart: the closest pair is ΔE(Lab) ≈ 20, where the previous
 * twelve-colour list had pairs down to 7.7 — "violet" and "periwinkle" were
 * effectively the same swatch. src/test/shared/personPalette.test.ts enforces
 * that floor so a future edit cannot quietly reintroduce a lookalike.
 *
 * Staying light is a requirement, not a taste: the colour becomes the background
 * of a 28px day circle in the calendar with the day number drawn on top, and the
 * avatar monogram derives a darker shade of the same hue for white initials.
 */
export const PERSON_PRESET_COLORS = [
  '#e7cfcf', // rose mist — hue 0
  '#cea08d', // clay — hue 18
  '#deb373', // amber — hue 36
  '#e5d96c', // butter — hue 54
  '#bac68b', // olive — hue 72
  '#a8d779', // apple — hue 90
  '#84e56c', // lawn — hue 108
  '#bcf0c1', // mint cream — hue 126
  '#76db9e', // jade — hue 144
  '#89c8b5', // eucalyptus — hue 162
  '#c4f3f3', // ice — hue 180
  '#6fbfe2', // sky — hue 198
  '#c2d6f4', // powder blue — hue 216
  '#8088d0', // denim — hue 234
  '#afa6d3', // lavender — hue 252
  '#a86ce5', // amethyst — hue 270
  '#c27dd4', // orchid — hue 288
  '#e2a2db', // lilac — hue 306
  '#de73b3', // fuchsia — hue 324
  '#ce8da0', // dusty rose — hue 342
] as const;

export const DASHBOARD_PASTEL_SKY_COLORS = [
  '#aec6cf',
  '#ffb7c5',
  '#b5ead7',
  '#c9b1ff',
  '#ffdab9',
  '#fdeeb0',
  '#74b9e8',
  '#ff8c7a',
  '#78c9a2',
  '#a886d8',
  '#ffb347',
  '#8aabbd',
] as const;

export const DASHBOARD_PASTEL_DAWN_COLORS = [
  '#ff8c7a',
  '#74b9e8',
  '#ffb347',
  '#78c9a2',
  '#f4a7a1',
  '#a886d8',
  '#ffdab9',
  '#8aabbd',
  '#fdeeb0',
  '#b5ead7',
  '#ffb7c5',
  '#aec6cf',
] as const;

export const DASHBOARD_PASTEL_MINT_COLORS = [
  '#6ee7b7',
  '#67e8f9',
  '#bef264',
  '#c4b5fd',
  '#fde68a',
  '#fdba74',
  '#a7f3d0',
  '#93c5fd',
  '#f9a8d4',
  '#86efac',
  '#99f6e4',
  '#fca5a5',
] as const;

export const DASHBOARD_MONO_COLORS = [
  '#0f172a',
  '#1e293b',
  '#334155',
  '#475569',
  '#64748b',
  '#94a3b8',
  '#cbd5e1',
  '#e2e8f0',
  '#111827',
  '#1f2937',
  '#6b7280',
  '#9ca3af',
] as const;

export const DASHBOARD_CHECKER_COLORS = [
  '#1e293b',
  '#cbd5e1',
  '#334155',
  '#e2e8f0',
  '#475569',
  '#f1f5f9',
  '#64748b',
  '#94a3b8',
] as const;

export const TASK_PRIORITY_COLORS = {
  low: '#16a34a',
  medium: '#f59e0b',
  high: '#dc2626',
} as const;

export const normalizeHexColor = (color: string) => {
  const raw = color.startsWith('#') ? color.slice(1) : color;
  if (raw.length === 3) {
    return raw.split('').map((char) => `${char}${char}`).join('');
  }
  if (raw.length === 6) {
    return raw;
  }
  return null;
};

export const hexToRgba = (color: string, alpha: number) => {
  const hex = normalizeHexColor(color);
  if (!hex || !/^[0-9a-fA-F]{6}$/.test(hex)) {
    return null;
  }
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const isDarkHexColor = (color: string) => {
  const hex = normalizeHexColor(color);
  if (!hex || !/^[0-9a-fA-F]{6}$/.test(hex)) {
    return false;
  }
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.5;
};
