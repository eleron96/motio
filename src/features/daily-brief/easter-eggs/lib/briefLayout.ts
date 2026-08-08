export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type Side = 'top' | 'bottom' | 'left' | 'right';

export interface Zone extends Box {
  side: Side;
}

export interface Placement {
  left: number;
  top: number;
  width: number;
  height: number;
  side: Side;
}

/** Kept clear of the card so nothing crowds its edge. */
export const CARD_MARGIN = 24;

const MIN_SCALE = 0.45;
const MAX_SCALE = 1.6;

const zone = (side: Side, left: number, top: number, width: number, height: number): Zone => ({
  side, left, top, width, height,
});

/**
 * The four strips of screen the card leaves free. A strip with no room at all
 * comes back with a negative dimension and is discarded by the caller.
 */
export const freeZones = (viewport: Box, card: Box, margin = CARD_MARGIN): Zone[] => [
  zone('top', viewport.left, viewport.top, viewport.width, card.top - margin - viewport.top),
  zone(
    'bottom',
    viewport.left,
    card.top + card.height + margin,
    viewport.width,
    viewport.top + viewport.height - (card.top + card.height + margin),
  ),
  zone('left', viewport.left, viewport.top, card.left - margin - viewport.left, viewport.height),
  zone(
    'right',
    card.left + card.width + margin,
    viewport.top,
    viewport.left + viewport.width - (card.left + card.width + margin),
    viewport.height,
  ),
].filter((candidate) => candidate.width > 0 && candidate.height > 0);

/**
 * Where to draw something of a given aspect ratio so the brief card never
 * covers it: the roomiest free strip wins, and the content is centred in it at
 * whatever scale fits.
 *
 * Returns null when the card leaves nowhere sensible — a small phone, mostly —
 * and the caller should then skip the centrepiece rather than draw it under the
 * card.
 */
export const placeBesideCard = (
  viewport: Box,
  card: Box | null,
  content: { width: number; height: number },
  options: { padding?: number; avoid?: Side[] } = {},
): Placement | null => {
  const { padding = 16, avoid = [] } = options;

  const fit = (candidate: Zone): Placement | null => {
    const availableWidth = candidate.width - padding * 2;
    const availableHeight = candidate.height - padding * 2;
    if (availableWidth <= 0 || availableHeight <= 0) return null;

    const scale = Math.min(
      availableWidth / content.width,
      availableHeight / content.height,
      MAX_SCALE,
    );
    if (scale < MIN_SCALE) return null;

    const width = content.width * scale;
    const height = content.height * scale;
    return {
      left: candidate.left + (candidate.width - width) / 2,
      top: candidate.top + (candidate.height - height) / 2,
      width,
      height,
      side: candidate.side,
    };
  };

  // Without a card the whole viewport is free.
  if (!card) return fit({ ...viewport, side: 'right' });

  const placements = freeZones(viewport, card)
    .map(fit)
    .filter((placement): placement is Placement => placement !== null);

  if (placements.length === 0) return null;

  // Biggest drawing wins. Sides the caller has spoken for — the title block's
  // margin, say — are only used when nothing else fits, since a cramped numeral
  // still beats no numeral.
  const biggest = (list: Placement[]) => list.reduce((best, placement) => (
    placement.width * placement.height > best.width * best.height ? placement : best
  ));

  const preferred = placements.filter((placement) => !avoid.includes(placement.side));
  return biggest(preferred.length > 0 ? preferred : placements);
};

/** True when a point falls on the card (plus its margin) and would be hidden. */
export const isBehindCard = (
  point: { x: number; y: number },
  card: Box | null,
  margin = CARD_MARGIN,
): boolean => {
  if (!card) return false;
  return point.x >= card.left - margin
    && point.x <= card.left + card.width + margin
    && point.y >= card.top - margin
    && point.y <= card.top + card.height + margin;
};

/**
 * A point in the viewport that the card does not cover. Falls back to the raw
 * random point after a few tries, so a card that fills the screen degrades to
 * the old behaviour instead of looping.
 */
export const pointClearOfCard = (
  viewport: Box,
  card: Box | null,
  random: () => number,
  attempts = 12,
): { x: number; y: number } => {
  let point = { x: 0, y: 0 };
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    point = {
      x: viewport.left + random() * viewport.width,
      y: viewport.top + random() * viewport.height,
    };
    if (!isBehindCard(point, card)) return point;
  }
  return point;
};

export interface Anchor {
  x: number;
  y: number;
}

/**
 * A caption's spot in the left margin, and null when the card leaves no margin
 * worth writing in — better nothing than a word sliced by the card's edge.
 */
export const leftMarginAnchor = (
  viewport: Box,
  card: Box | null,
  minWidth = 96,
): Anchor | null => {
  const right = card ? card.left - CARD_MARGIN : viewport.left + viewport.width;
  const width = right - viewport.left;
  if (width < minWidth) return null;
  return {
    x: viewport.left + Math.min(32, width * 0.18),
    y: viewport.top + viewport.height / 2,
  };
};

/**
 * The bottom-right corner, lifted above the card if the card reaches into it —
 * on a phone the card runs the full width, so the corner alone is not enough.
 */
export const bottomRightAnchor = (
  viewport: Box,
  card: Box | null,
  inset = 46,
): Anchor => {
  const x = viewport.left + viewport.width - inset;
  const bottom = viewport.top + viewport.height - inset;
  if (!isBehindCard({ x, y: bottom }, card) || !card) return { x, y: bottom };

  const below = viewport.top + viewport.height - (card.top + card.height + CARD_MARGIN);
  // Below the card if there is room down there, otherwise just above it.
  return below >= inset
    ? { x, y: card.top + card.height + CARD_MARGIN + inset / 2 }
    : { x, y: card.top - CARD_MARGIN - inset / 2 };
};
