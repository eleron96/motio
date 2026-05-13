import type { CSSProperties } from 'react';

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

const expandShortHex = (hex: string): string => (
  hex.length === 3
    ? hex.split('').map((ch) => ch + ch).join('')
    : hex
);

const parseHexChannels = (hex: string): [number, number, number] | null => {
  const match = HEX_RE.exec(hex.trim());
  if (!match) return null;
  const expanded = expandShortHex(match[1]);
  return [
    parseInt(expanded.slice(0, 2), 16),
    parseInt(expanded.slice(2, 4), 16),
    parseInt(expanded.slice(4, 6), 16),
  ];
};

export const hexToRgba = (hex: string, alpha: number): string => {
  const channels = parseHexChannels(hex);
  if (!channels) return `rgba(15, 118, 110, ${alpha})`; // teal fallback
  const [r, g, b] = channels;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/**
 * CSS custom properties applied at the root of a project-card subtree so
 * descendants can use `var(--project-accent)` / `var(--project-accent-soft)`
 * without re-deriving the color.
 */
export const buildProjectAccentVars = (color: string): CSSProperties => ({
  ['--project-accent' as string]: color,
  ['--project-accent-soft' as string]: hexToRgba(color, 0.14),
  ['--project-accent-line' as string]: hexToRgba(color, 0.45),
});
