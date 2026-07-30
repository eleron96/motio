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
 * Colours a person can be given in workspace settings. Deliberately the same
 * twelve pastel hues the calendar already assigns automatically (see
 * features/planner/lib/timeOffPalette), so a hand-picked colour is
 * indistinguishable from an auto-assigned one — hex here, HSL there, identical
 * values.
 *
 * Pastel is a requirement, not a taste: the colour becomes the background of a
 * 28px day circle in the calendar with the day number drawn on top.
 */
export const PERSON_PRESET_COLORS = [
  '#a7ccf1', // blue — hsl(210, 72%, 80%)
  '#a0e3c2', // green — hsl(150, 55%, 76%)
  '#f7c9a1', // orange — hsl(28, 85%, 80%)
  '#dab8ea', // violet — hsl(280, 55%, 82%)
  '#f4b9cc', // pink — hsl(340, 72%, 84%)
  '#9ddae7', // teal — hsl(190, 60%, 76%)
  '#f3e291', // yellow — hsl(50, 80%, 76%)
  '#cabeef', // periwinkle — hsl(255, 60%, 84%)
  '#f1bcb1', // coral — hsl(10, 70%, 82%)
  '#b0ddb0', // sage — hsl(120, 40%, 78%)
  '#e6bcd8', // mauve — hsl(320, 45%, 82%)
  '#c7e0a3', // lime — hsl(85, 50%, 76%)
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
