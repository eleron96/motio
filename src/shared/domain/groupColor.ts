// A team's colour (member_groups.color, 0191).
//
// Teams share the people palette on purpose: one list of twenty colours, one
// kind of stored value, so a team and a person can be coloured by the same
// picker and a future chart by team needs no second palette.
//
// The stored value is a pastel. A team is drawn as a small dot beside its name,
// and a 6–10px pastel dot on a white card is nearly invisible, so marks use the
// deeper tone of the same hue — the one a person's monogram already uses
// (toMonogramColor). The picker shows that deeper tone too: what you pick is
// what the dot looks like.
//
// Who may recolour a team is not decided here: workspace admins, the only people
// who create, rename and delete teams (policy "workspace admins can update
// member groups", 0023).

import { PERSON_PRESET_COLORS } from '@/shared/lib/colors';
import { toMonogramColor } from '@/shared/lib/personColor';
import { assignPaletteColors, isStoredPaletteColor } from '@/shared/domain/paletteColors';

type GroupWithColor = { id: string; color?: string | null; createdAt?: string | null };

/** The colours a team can be given. */
export const GROUP_PRESET_COLORS: readonly string[] = PERSON_PRESET_COLORS;

/** True when the team has a colour of its own rather than an automatic one. */
export const hasOwnGroupColor = (group: GroupWithColor | null | undefined): boolean => (
  isStoredPaletteColor(group?.color)
);

/** What a database row holds, narrowed to "a colour or nothing". */
export const readGroupColor = (value: unknown): string | null => (
  isStoredPaletteColor(value) ? value : null
);

/** The tone a dot or a swatch is drawn in for a stored (pastel) colour. */
export const toGroupMarkColor = (color: string): string => toMonogramColor(color) ?? color;

/** The first automatic colour of a workspace: sky, calm and unlike an alert. */
const FIRST_AUTOMATIC_COLOR = GROUP_PRESET_COLORS[11];

const paletteIndex = (color: string): number => (
  GROUP_PRESET_COLORS.findIndex((preset) => preset.toLowerCase() === color.toLowerCase())
);

/** Steps between two palette colours around the hue circle (the palette is one). */
const hueSteps = (left: number, right: number): number => {
  const direct = Math.abs(left - right);
  return Math.min(direct, GROUP_PRESET_COLORS.length - direct);
};

/**
 * The free colour furthest in hue from every colour already in use. Neighbours
 * in the palette are 18° apart — fine in a picker, too close for two 8px dots in
 * one list — so an automatic colour keeps as far from the others as it can.
 */
const chooseFarthestHue = (free: readonly string[], used: readonly string[]): string => {
  const usedIndexes = used.map(paletteIndex).filter((index) => index >= 0);
  if (usedIndexes.length === 0) {
    return free.includes(FIRST_AUTOMATIC_COLOR) ? FIRST_AUTOMATIC_COLOR : free[0];
  }
  let best = free[0];
  let bestDistance = -1;
  free.forEach((color) => {
    const index = paletteIndex(color);
    const distance = Math.min(...usedIndexes.map((usedIndex) => hueSteps(index, usedIndex)));
    // Strictly greater: on a tie the earlier palette colour stays.
    if (distance > bestDistance) {
      best = color;
      bestDistance = distance;
    }
  });
  return best;
};

/** Oldest first, so a new team takes a colour without moving anybody else's. */
const byCreation = (left: GroupWithColor, right: GroupWithColor): number => (
  (left.createdAt ?? '').localeCompare(right.createdAt ?? '') || left.id.localeCompare(right.id)
);

/**
 * Stored colour per team: the picked one, or an automatic one — the free palette
 * colour furthest in hue from the colours already in use, handed out oldest team
 * first. Pass every team of the workspace: the automatic colours depend on the
 * whole list.
 */
export const buildGroupColorMap = (groups: GroupWithColor[]): Map<string, string> => (
  assignPaletteColors(groups, GROUP_PRESET_COLORS, { compare: byCreation, choose: chooseFarthestHue })
);

/** The same mapping in the tone marks are drawn in. */
export const buildGroupMarkColorMap = (groups: GroupWithColor[]): Map<string, string> => {
  const marks = new Map<string, string>();
  buildGroupColorMap(groups).forEach((color, id) => {
    marks.set(id, toGroupMarkColor(color));
  });
  return marks;
};
