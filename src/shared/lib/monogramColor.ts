/**
 * Generates a deterministic HSL background color from a userId string.
 * The color is consistent across all renders — no DB storage needed.
 */
export const getMonogramColor = (seed: string): string => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0; // Convert to 32bit integer
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 45%)`;
};

const HSL_PATTERN = /^hsl\(\s*(-?[\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)$/;

const linear = (channel: number) =>
  (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);

/** WCAG relative luminance of an `hsl(h, s%, l%)` colour; null for anything else. */
const hslLuminance = (color: string): number | null => {
  const match = HSL_PATTERN.exec(color.trim());
  if (!match) return null;
  const hue = ((Number(match[1]) % 360) + 360) % 360;
  const saturation = Number(match[2]) / 100;
  const lightness = Number(match[3]) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const second = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const base = lightness - chroma / 2;
  const [red, green, blue] = hue < 60 ? [chroma, second, 0]
    : hue < 120 ? [second, chroma, 0]
      : hue < 180 ? [0, chroma, second]
        : hue < 240 ? [0, second, chroma]
          : hue < 300 ? [second, 0, chroma]
            : [chroma, 0, second];
  return 0.2126 * linear(red + base) + 0.7152 * linear(green + base) + 0.0722 * linear(blue + base);
};

const AA_CONTRAST = 4.5;

/**
 * Colour of the initials on a monogram: white where it reads at 4.5:1 (WCAG
 * AA), black on the hues where it does not (yellows, greens, cyans). One of the
 * two always passes.
 */
export const getMonogramTextColor = (background: string): string => {
  const luminance = hslLuminance(background);
  if (luminance === null) return '#ffffff';
  return 1.05 / (luminance + 0.05) >= AA_CONTRAST ? '#ffffff' : '#000000';
};
