import { describe, expect, it } from 'vitest';
import { PERSON_PRESET_COLORS } from '@/shared/lib/colors';
import { assignPaletteColors, isStoredPaletteColor } from '@/shared/domain/paletteColors';
import {
  GROUP_PRESET_COLORS,
  buildGroupColorMap,
  buildGroupMarkColorMap,
  hasOwnGroupColor,
  readGroupColor,
  toGroupMarkColor,
} from '@/shared/domain/groupColor';

const SKY = '#6fbfe2';
const AMBER = '#deb373';

describe('assignPaletteColors', () => {
  const palette = ['#111111', '#222222', '#333333'];

  it('keeps a picked colour and hands the rest out by position in the id-sorted list', () => {
    const colors = assignPaletteColors(
      [{ id: 'c' }, { id: 'a' }, { id: 'b', color: '#222222' }],
      palette,
    );

    expect(colors.get('b')).toBe('#222222');
    // 'a' sorts first and takes the first free colour, 'c' the next one — the
    // picked colour is skipped, so nobody shares it.
    expect(colors.get('a')).toBe('#111111');
    expect(colors.get('c')).toBe('#333333');
  });

  it('does not depend on the order the list arrives in', () => {
    const forward = assignPaletteColors([{ id: 'a' }, { id: 'b' }, { id: 'c' }], palette);
    const backward = assignPaletteColors([{ id: 'c' }, { id: 'b' }, { id: 'a' }], palette);

    expect([...forward.entries()].sort()).toEqual([...backward.entries()].sort());
  });

  it('wraps around once the list outgrows the palette', () => {
    const colors = assignPaletteColors(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      palette,
    );

    expect(colors.get('d')).toBe(colors.get('a'));
  });

  it('falls back to the full palette when every colour is picked', () => {
    const colors = assignPaletteColors(
      [
        { id: 'a', color: '#111111' },
        { id: 'b', color: '#222222' },
        { id: 'c', color: '#333333' },
        { id: 'd' },
      ],
      palette,
    );

    expect(colors.get('d')).toBe('#111111');
  });

  it('treats anything that is not #rrggbb as "not picked"', () => {
    const colors = assignPaletteColors([{ id: 'a', color: 'teal' }, { id: 'b', color: null }], palette);

    expect(colors.get('a')).toBe('#111111');
    expect(colors.get('b')).toBe('#222222');
    expect(isStoredPaletteColor('#12ab9F')).toBe(true);
    expect(isStoredPaletteColor('#12ab9')).toBe(false);
    expect(isStoredPaletteColor(undefined)).toBe(false);
  });
});

describe('group colour', () => {
  it('offers the same twenty colours people are given', () => {
    expect(GROUP_PRESET_COLORS).toEqual(PERSON_PRESET_COLORS);
  });

  it('keeps the colour a team picked and gives the others a free one', () => {
    const colors = buildGroupColorMap([
      { id: 'g2', color: SKY },
      { id: 'g1', color: null },
      { id: 'g3' },
    ]);

    expect(colors.get('g2')).toBe(SKY);
    expect(new Set(colors.values()).size).toBe(3);
    expect(GROUP_PRESET_COLORS).toContain(colors.get('g1'));
    expect(GROUP_PRESET_COLORS).toContain(colors.get('g3'));
  });

  it('never hands an automatic team the colour another team picked', () => {
    GROUP_PRESET_COLORS.forEach((picked) => {
      const colors = buildGroupColorMap([{ id: 'g1' }, { id: 'g2', color: picked }]);

      expect(colors.get('g2')).toBe(picked);
      expect(colors.get('g1')).not.toBe(picked);
    });
  });

  it('starts a workspace that never picked anything on a calm blue', () => {
    expect(buildGroupColorMap([{ id: 'g1' }]).get('g1')).toBe(SKY);
  });

  it('keeps automatic colours far apart in hue, so small dots do not look alike', () => {
    // Neighbours in the palette are 18° apart — too close for two 8px dots.
    const hueStepsApart = (left: string, right: string) => {
      const direct = Math.abs(GROUP_PRESET_COLORS.indexOf(left) - GROUP_PRESET_COLORS.indexOf(right));
      return Math.min(direct, GROUP_PRESET_COLORS.length - direct);
    };
    const closestPair = (count: number) => {
      const colors = [...buildGroupColorMap(
        Array.from({ length: count }, (_, index) => ({ id: `g${index}` })),
      ).values()];
      let closest = Infinity;
      colors.forEach((left, leftIndex) => colors.slice(leftIndex + 1).forEach((right) => {
        closest = Math.min(closest, hueStepsApart(left, right));
      }));
      return closest;
    };

    expect(closestPair(2)).toBe(10); // opposite sides of the circle
    expect(closestPair(4)).toBe(5); // a quarter turn, 90°
    expect(closestPair(6)).toBeGreaterThanOrEqual(2);
    // Twenty teams still get twenty different colours.
    expect(closestPair(20)).toBe(1);
  });

  it('keeps an automatic colour away from the picked ones too', () => {
    const colors = buildGroupColorMap([{ id: 'g1', color: SKY }, { id: 'g2' }]);

    // Sky is hue 198; the automatic team lands on the opposite side.
    expect(colors.get('g2')).toBe(GROUP_PRESET_COLORS[1]);
  });

  it('does not move anybody\'s automatic colour when a newer team appears', () => {
    const older = [
      { id: 'zz', createdAt: '2026-01-01T00:00:00+00:00' },
      { id: 'mm', createdAt: '2026-02-01T00:00:00+00:00' },
    ];
    const before = buildGroupColorMap(older);
    // Its id sorts first, but it was created last: it is served last.
    const after = buildGroupColorMap([...older, { id: 'aa', createdAt: '2026-03-01T00:00:00+00:00' }]);

    expect(after.get('zz')).toBe(before.get('zz'));
    expect(after.get('mm')).toBe(before.get('mm'));
    expect(new Set(after.values()).size).toBe(3);
  });

  it('starts a second round once there are more teams than colours', () => {
    const colors = buildGroupColorMap(
      Array.from({ length: 21 }, (_, index) => ({ id: `g${String(index).padStart(2, '0')}` })),
    );

    expect(new Set(colors.values()).size).toBe(20);
    expect(colors.get('g20')).toBe(colors.get('g00'));
  });

  it('draws a mark in the deeper tone of the stored colour', () => {
    // A pastel dot disappears on a white card; the mark keeps the hue.
    expect(toGroupMarkColor(SKY)).toBe('hsl(198, 55%, 45%)');
    expect(toGroupMarkColor(AMBER)).toBe('hsl(36, 55%, 45%)');
    // Anything that is not a stored colour passes through rather than breaking.
    expect(toGroupMarkColor('hsl(10, 20%, 30%)')).toBe('hsl(10, 20%, 30%)');
  });

  it('gives every palette colour a distinct mark', () => {
    const marks = GROUP_PRESET_COLORS.map(toGroupMarkColor);

    expect(new Set(marks).size).toBe(GROUP_PRESET_COLORS.length);
  });

  it('builds the mark colours for a whole list', () => {
    const marks = buildGroupMarkColorMap([{ id: 'g1', color: SKY }, { id: 'g2' }]);

    expect(marks.get('g1')).toBe(toGroupMarkColor(SKY));
    expect(marks.get('g2')).toBe(toGroupMarkColor(GROUP_PRESET_COLORS[1]));
  });

  it('tells a picked colour from an automatic one', () => {
    expect(hasOwnGroupColor({ id: 'g1', color: SKY })).toBe(true);
    expect(hasOwnGroupColor({ id: 'g1', color: null })).toBe(false);
    expect(hasOwnGroupColor({ id: 'g1' })).toBe(false);
    expect(hasOwnGroupColor(null)).toBe(false);
  });

  it('reads a database value as a colour or nothing', () => {
    expect(readGroupColor(SKY)).toBe(SKY);
    expect(readGroupColor('sky')).toBeNull();
    expect(readGroupColor(null)).toBeNull();
    expect(readGroupColor(undefined)).toBeNull();
  });
});
