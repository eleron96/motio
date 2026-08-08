export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Placement {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Kept clear of the card so nothing crowds its edge. */
export const CARD_MARGIN = 24;

const MIN_SCALE = 0.45;
const MAX_SCALE = 1.6;

const box = (left: number, top: number, width: number, height: number): Box => ({
  left, top, width, height,
});

/**
 * The four strips of screen the card leaves free. A strip with no room at all
 * comes back with a negative dimension and is discarded by the caller.
 */
export const freeZones = (viewport: Box, card: Box, margin = CARD_MARGIN): Box[] => [
  box(viewport.left, viewport.top, viewport.width, card.top - margin - viewport.top),
  box(
    viewport.left,
    card.top + card.height + margin,
    viewport.width,
    viewport.top + viewport.height - (card.top + card.height + margin),
  ),
  box(viewport.left, viewport.top, card.left - margin - viewport.left, viewport.height),
  box(
    card.left + card.width + margin,
    viewport.top,
    viewport.left + viewport.width - (card.left + card.width + margin),
    viewport.height,
  ),
].filter((zone) => zone.width > 0 && zone.height > 0);

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
  padding = 16,
): Placement | null => {
  const fit = (zone: Box): Placement | null => {
    const availableWidth = zone.width - padding * 2;
    const availableHeight = zone.height - padding * 2;
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
      left: zone.left + (zone.width - width) / 2,
      top: zone.top + (zone.height - height) / 2,
      width,
      height,
    };
  };

  // Without a card the whole viewport is free.
  if (!card) return fit(viewport);

  const candidates = freeZones(viewport, card)
    .map((zone) => ({ zone, placement: fit(zone) }))
    .filter((candidate): candidate is { zone: Box; placement: Placement } => candidate.placement !== null);

  if (candidates.length === 0) return null;

  // Biggest drawing wins; area breaks ties so it leans towards open space.
  return candidates.reduce((best, candidate) => (
    candidate.placement.width * candidate.placement.height
      > best.placement.width * best.placement.height
      ? candidate
      : best
  )).placement;
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
  inset = 32,
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
