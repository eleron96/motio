import { describe, expect, it } from 'vitest';
import { getMonogramColor, getMonogramTextColor } from '@/shared/lib/monogramColor';

const linear = (channel: number) =>
  (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);

// Independent of the code under test: hsl -> rgb through the CSS formula.
const luminanceOfHsl = (hue: number, saturation: number, lightness: number) => {
  const a = saturation * Math.min(lightness, 1 - lightness);
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    return lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return 0.2126 * linear(channel(0)) + 0.7152 * linear(channel(8)) + 0.0722 * linear(channel(4));
};

const contrast = (text: string, backgroundLuminance: number) => {
  const textLuminance = text === '#ffffff' ? 1 : 0;
  const [lighter, darker] = [textLuminance, backgroundLuminance].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
};

describe('getMonogramTextColor', () => {
  it('reads at 4.5:1 on every hue a monogram can have', () => {
    // Seeded monograms are hsl(h, 55%, 45%); picked person colours share the
    // lightness and differ in saturation, greys included.
    for (const saturation of [0, 55, 65, 80]) {
      for (let hue = 0; hue < 360; hue += 1) {
        const background = `hsl(${hue}, ${saturation}%, 45%)`;
        const text = getMonogramTextColor(background);
        expect(
          contrast(text, luminanceOfHsl(hue, saturation / 100, 0.45)),
          `${text} on ${background}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps white where white is enough and turns black on the light hues', () => {
    expect(getMonogramTextColor('hsl(240, 55%, 45%)')).toBe('#ffffff');
    expect(getMonogramTextColor('hsl(90, 55%, 45%)')).toBe('#000000');
  });

  it('works for the colours the avatar really generates and falls back to white otherwise', () => {
    expect(['#ffffff', '#000000']).toContain(getMonogramTextColor(getMonogramColor('anna@example.com')));
    expect(getMonogramTextColor('#73b234')).toBe('#ffffff');
  });
});
