// Colours for the people marked as away on the calendar.
//
// Deliberately a fixed palette rather than getMonogramColor (shared/lib/
// monogramColor.ts), which derives a hue by hashing an id: that hash is nearly
// linear in the tail of the string, so real workspaces get hues one degree
// apart — a pie split between such people reads as one solid circle.
//
// Since 0135 a person can be given an explicit colour in workspace settings, and
// that one wins. Everyone else is served from the colours nobody claimed, by
// POSITION in the workspace's own list of people sorted by id: a new teammate
// lands at the end and never shifts anyone else's colour, which is what keeps the
// fallback stable across sessions and devices. Handing somebody a colour does
// reshuffle the automatic ones — the alternative is two people sharing a colour.

import { PERSON_PRESET_COLORS } from '@/shared/lib/colors';
import { isPersonColor } from '@/shared/lib/personColor';
import type { Assignee, TimeOff } from '@/features/planner/types/planner';

/**
 * The twenty colours from workspace settings, reused verbatim — one source, so an
 * automatic colour and a hand-picked one cannot drift apart. See
 * PERSON_PRESET_COLORS for why they are light and how far apart they sit.
 */
export const TIME_OFF_PALETTE: string[] = [...PERSON_PRESET_COLORS];

/**
 * A record can point at somebody the client does not hold: the assignee list is
 * pruned to people with an account or a task in the loaded window, while time
 * off arrives on its own window. Such a person still gets a stable palette
 * colour (hashed from the id) rather than a grey blob — colliding with someone
 * else's colour is a far smaller problem than a row of identical grey circles.
 */
const hashToPaletteIndex = (value: string): number => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 1_000_000_007;
  }
  return hash % TIME_OFF_PALETTE.length;
};

/**
 * Colour per person: the one picked in workspace settings if there is one,
 * otherwise the next unclaimed colour by position in the id-sorted list of
 * people, wrapping around once a workspace outgrows the palette.
 */
export const buildPersonColorMap = (
  people: Array<{ id: string; color?: string | null }>,
): Map<string, string> => {
  const ordered = [...people].sort((left, right) => left.id.localeCompare(right.id));

  // Colours somebody chose are off the table for the automatic hand-out —
  // otherwise a teammate could be handed the exact colour another person picked,
  // and the two would be indistinguishable everywhere. If a workspace picked all
  // of them, the pool falls back to the full palette rather than running dry.
  const taken = new Set(
    ordered
      .map((person) => (isPersonColor(person.color) ? person.color.toLowerCase() : null))
      .filter((color): color is string => color !== null),
  );
  const available = TIME_OFF_PALETTE.filter((color) => !taken.has(color.toLowerCase()));
  const pool = available.length > 0 ? available : TIME_OFF_PALETTE;

  const colors = new Map<string, string>();
  let autoIndex = 0;
  ordered.forEach((person) => {
    if (isPersonColor(person.color)) {
      colors.set(person.id, person.color);
      return;
    }
    colors.set(person.id, pool[autoIndex % pool.length]);
    autoIndex += 1;
  });
  return colors;
};

/**
 * The calendar's view of the same mapping. Dashboard charts call
 * buildPersonColorMap directly with their own list of people — same function, so
 * a person reads the same in both places as long as both lists hold the same
 * people (the position fallback is what makes that a condition).
 */
export const buildTimeOffColorMap = (assignees: Assignee[]): Map<string, string> => (
  buildPersonColorMap(assignees)
);

export const resolveTimeOffColor = (
  colors: Map<string, string>,
  assigneeId: string,
): string => colors.get(assigneeId) ?? TIME_OFF_PALETTE[hashToPaletteIndex(assigneeId)];

/**
 * Beyond this the slices are too thin to tell apart on a 28px circle. The last
 * slice then turns neutral and stands for "and N more" — the day card lists
 * everyone by name anyway.
 */
export const MAX_PIE_SEGMENTS = 4;

/** Colour of the slice that stands for the people who did not get their own. */
export const TIME_OFF_OVERFLOW_COLOR = 'hsl(220, 14%, 78%)';

export type DayPie = {
  /** Colours actually drawn, at most MAX_PIE_SEGMENTS. */
  colors: string[];
  /** People not represented by their own slice. */
  overflow: number;
  /** Everyone away that day, including the overflow. */
  total: number;
};

/**
 * Sorted by assignee id, NOT by the order the records arrive: neither the
 * initial query nor the realtime refetch has an ORDER BY, so Postgres is free to
 * hand them back in a different order every time — without this the slices would
 * swap colours after every refresh.
 */
export const buildDayPie = (
  records: TimeOff[],
  colors: Map<string, string>,
): DayPie => {
  const people = Array.from(new Set(records.map((record) => record.assigneeId)))
    .sort((left, right) => left.localeCompare(right));

  const overflow = Math.max(0, people.length - MAX_PIE_SEGMENTS);

  // With an overflow the last slice is neutral and represents everyone left,
  // so the circle never claims to show more people than it can distinguish.
  const shown = overflow > 0
    ? [
      ...people.slice(0, MAX_PIE_SEGMENTS - 1).map((id) => resolveTimeOffColor(colors, id)),
      TIME_OFF_OVERFLOW_COLOR,
    ]
    : people.map((id) => resolveTimeOffColor(colors, id));

  return {
    colors: shown,
    overflow: overflow > 0 ? overflow + 1 : 0,
    total: people.length,
  };
};

/**
 * CSS background for the day circle: a flat colour for one person, equal slices
 * for several. A 1° gap between stops keeps neighbouring slices readable.
 */
export const buildPieBackground = (pie: DayPie): string => {
  if (pie.colors.length === 0) return 'transparent';
  if (pie.colors.length === 1) return pie.colors[0];

  const slice = 360 / pie.colors.length;
  const stops = pie.colors.map((color, index) => {
    const from = index * slice;
    const to = (index + 1) * slice;
    return `${color} ${from + (index === 0 ? 0 : 1)}deg ${to}deg`;
  });
  return `conic-gradient(from 0deg, ${stops.join(', ')})`;
};
