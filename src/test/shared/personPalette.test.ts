import { describe, expect, it } from 'vitest';
import { PERSON_PRESET_COLORS } from '@/shared/lib/colors';
import { toMonogramColor } from '@/shared/lib/personColor';

// The palette's job is to tell people apart at a glance — on a 28px calendar
// circle, in a chart legend, behind two letters. "Looks different" is measurable,
// so it is measured here rather than left to whoever edits the list next: the
// twelve-colour predecessor had pairs at ΔE 7.7 (violet vs periwinkle), which
// read as one colour.

/** Perceptual distance floor. Below ~10 two swatches read as the same colour. */
const MIN_DELTA_E = 18;

const hexToRgb = (hex: string): [number, number, number] => (
  [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)) as [number, number, number]
);

/** CIE76: crude next to CIEDE2000, but monotonic enough to guard a palette. */
const rgbToLab = ([r, g, b]: [number, number, number]): [number, number, number] => {
  const [red, green, blue] = [r, g, b].map((value) => {
    const channel = value / 255;
    return channel > 0.04045 ? ((channel + 0.055) / 1.055) ** 2.4 : channel / 12.92;
  });
  const x = (red * 0.4124 + green * 0.3576 + blue * 0.1805) / 0.95047;
  const y = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  const z = (red * 0.0193 + green * 0.1192 + blue * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};

const deltaE = (left: string, right: string) => {
  const a = rgbToLab(hexToRgb(left));
  const b = rgbToLab(hexToRgb(right));
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
};

describe('person colour palette', () => {
  it('offers twenty colours', () => {
    expect(PERSON_PRESET_COLORS).toHaveLength(20);
  });

  it('spells every colour as #rrggbb, which is what the column accepts', () => {
    PERSON_PRESET_COLORS.forEach((color) => {
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    });
  });

  it('holds no two colours a person could confuse', () => {
    const tooClose: Array<[string, string, string]> = [];
    for (let i = 0; i < PERSON_PRESET_COLORS.length; i += 1) {
      for (let j = i + 1; j < PERSON_PRESET_COLORS.length; j += 1) {
        const distance = deltaE(PERSON_PRESET_COLORS[i], PERSON_PRESET_COLORS[j]);
        if (distance < MIN_DELTA_E) {
          tooClose.push([PERSON_PRESET_COLORS[i], PERSON_PRESET_COLORS[j], distance.toFixed(1)]);
        }
      }
    }
    expect(tooClose, `pairs below ΔE ${MIN_DELTA_E}`).toEqual([]);
  });

  it('gives every colour a hue, so the monogram shade never collapses to grey', () => {
    PERSON_PRESET_COLORS.forEach((color) => {
      expect(toMonogramColor(color)).not.toBe('hsl(0, 0%, 45%)');
    });
  });

  it('keeps monograms apart too — they inherit the hue, not the pastel', () => {
    const monograms = new Set(PERSON_PRESET_COLORS.map((color) => toMonogramColor(color)));
    expect(monograms.size).toBe(PERSON_PRESET_COLORS.length);
  });
});
