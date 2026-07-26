// Colours for the people marked as away on the calendar.
//
// Deliberately a fixed palette rather than getMonogramColor (shared/lib/
// monogramColor.ts), which derives a hue by hashing an id: that hash is nearly
// linear in the tail of the string, so real workspaces get hues one degree
// apart — a pie split between such people reads as one solid circle.
//
// Assignment is by POSITION in the workspace's own list of people, sorted by id.
// A new teammate lands at the end and never shifts anyone else's colour, which
// is what makes the mapping stable across sessions and devices. (A colour
// column on the assignee would be stabler still — worth doing only if a
// workspace ever outgrows the palette and the wrap-around becomes visible.)

import type { Assignee, TimeOff } from '@/features/planner/types/planner';

/**
 * Twelve pastel hues, evenly spread around the wheel, light enough for the day
 * number to stay readable on top and distinct enough to tell apart as adjacent
 * slices of a 28px circle.
 */
export const TIME_OFF_PALETTE: string[] = [
  'hsl(210, 72%, 80%)', // blue
  'hsl(150, 55%, 76%)', // green
  'hsl(28, 85%, 80%)', // orange
  'hsl(280, 55%, 82%)', // violet
  'hsl(340, 72%, 84%)', // pink
  'hsl(190, 60%, 76%)', // teal
  'hsl(50, 80%, 76%)', // yellow
  'hsl(255, 60%, 84%)', // periwinkle
  'hsl(10, 70%, 82%)', // coral
  'hsl(120, 40%, 78%)', // sage
  'hsl(320, 45%, 82%)', // mauve
  'hsl(85, 50%, 76%)', // lime
];

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
 * Stable colour per person: position in the id-sorted list of people, wrapping
 * around the palette if a workspace ever has more than twelve.
 */
export const buildTimeOffColorMap = (assignees: Assignee[]): Map<string, string> => {
  const ordered = [...assignees].sort((left, right) => left.id.localeCompare(right.id));
  const colors = new Map<string, string>();
  ordered.forEach((assignee, index) => {
    colors.set(assignee.id, TIME_OFF_PALETTE[index % TIME_OFF_PALETTE.length]);
  });
  return colors;
};

export const resolveTimeOffColor = (
  colors: Map<string, string>,
  assigneeId: string,
): string => colors.get(assigneeId) ?? TIME_OFF_PALETTE[hashToPaletteIndex(assigneeId)];

/** Beyond this the slices are too thin to tell apart; the rest becomes "+N". */
export const MAX_PIE_SEGMENTS = 4;

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

  return {
    colors: people.slice(0, MAX_PIE_SEGMENTS).map((id) => resolveTimeOffColor(colors, id)),
    overflow: Math.max(0, people.length - MAX_PIE_SEGMENTS),
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
