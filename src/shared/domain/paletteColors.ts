// One rule for everything that is told apart by a palette colour — people
// (assignees.color, 0135) and teams (member_groups.color, 0191).
//
// A colour somebody picked wins. Everything else is served from the colours
// nobody claimed, in a fixed order (by id unless told otherwise), which keeps
// the automatic colours the same across sessions and devices. Picking a colour
// does reshuffle the automatic ones — the alternative is two things sharing a
// colour.

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** A colour as the database stores it: #rrggbb. */
export const isStoredPaletteColor = (value: unknown): value is string => (
  typeof value === 'string' && HEX_COLOR.test(value)
);

type PaletteItem = { id: string; color?: string | null };

export interface PaletteAssignmentOptions<T extends PaletteItem> {
  /**
   * The order items without a colour are served in. Defaults to the id; pass
   * something that puts newcomers last (a creation time) and nobody's automatic
   * colour moves when one more item appears.
   */
  compare?: (left: T, right: T) => number;
  /**
   * Which of the free colours the next item gets, given the colours already in
   * use. Defaults to the first free one, in palette order.
   */
  choose?: (free: readonly string[], used: readonly string[]) => string;
}

/**
 * Colour per id: the picked one if there is one, otherwise a palette colour
 * nobody holds yet, starting over once the list outgrows the palette.
 */
export const assignPaletteColors = <T extends PaletteItem>(
  items: T[],
  palette: readonly string[],
  options: PaletteAssignmentOptions<T> = {},
): Map<string, string> => {
  const compare = options.compare ?? ((left: T, right: T) => left.id.localeCompare(right.id));
  const ordered = [...items].sort(compare);

  // Picked colours are off the table for the automatic hand-out — otherwise one
  // item could be handed the exact colour another one picked, and the two would
  // be indistinguishable everywhere. If every colour is picked, the pool falls
  // back to the full palette rather than running dry.
  const picked = ordered
    .map((item) => (isStoredPaletteColor(item.color) ? item.color.toLowerCase() : null))
    .filter((color): color is string => color !== null);
  const taken = new Set(picked);
  const available = palette.filter((color) => !taken.has(color.toLowerCase()));
  const pool = available.length > 0 ? available : palette;

  const colors = new Map<string, string>();
  let autoIndex = 0;
  let used = [...picked];
  ordered.forEach((item) => {
    if (isStoredPaletteColor(item.color)) {
      colors.set(item.id, item.color);
      return;
    }
    if (!options.choose) {
      colors.set(item.id, pool[autoIndex % pool.length]);
      autoIndex += 1;
      return;
    }
    let free = palette.filter((color) => !used.includes(color.toLowerCase()));
    if (free.length === 0) {
      // Every colour is in use: a new round starts from the whole palette.
      free = [...palette];
      used = [];
    }
    const color = options.choose(free, used);
    colors.set(item.id, color);
    used.push(color.toLowerCase());
  });
  return colors;
};
