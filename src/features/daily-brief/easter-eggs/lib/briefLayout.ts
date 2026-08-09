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
 * The numeral and the year beneath it, in the numeral's own coordinates. The
 * band under the glyphs is what guarantees the year has somewhere to sit, on
 * any screen, instead of being placed and hoped for.
 */
const NUMERAL_BOX = { width: 120, height: 92 } as const;
const YEAR_BAND = 34;
const NUMERAL_BLOCK = { width: NUMERAL_BOX.width, height: NUMERAL_BOX.height + YEAR_BAND };

const clamp = (min: number, value: number, max: number) => Math.min(Math.max(value, min), max);

export interface SheetType {
  /** Font size for the practice name, in px. */
  practice: number;
  /** Font size for the years, in px. */
  year: number;
}

/**
 * Where the title block starts, and how it is aligned there: a margin of its
 * own reads as a drawing's title block, left-aligned; a band across the screen
 * reads as a heading and wants to be centred.
 */
export interface TitleAnchor extends Anchor {
  align: 'start' | 'middle';
}

export interface SheetLayout {
  /** Box the "20" is drawn into, or null when the screen has no room for it. */
  numeral: Placement | null;
  /** Centre of the anniversary year, under the numeral. */
  numeralYear: (Anchor & { size: number }) | null;
  /** Anchor for the practice name; the founding year follows below it. */
  title: TitleAnchor | null;
  type: SheetType;
}

/** Type scales with the screen: 38px reads well on a desktop and shouts on a phone. */
export const sheetType = (viewport: Box): SheetType => {
  const practice = clamp(17, Math.min(viewport.width, viewport.height) * 0.045, 38);
  return { practice, year: clamp(12, practice * 0.62, 24) };
};

const titleBlockSize = (type: SheetType) => ({
  // "СПИЧ" is four letters at 0.42em tracking; the year sits under it.
  width: type.practice * 4.6,
  height: type.practice * 1.2 + type.year * 1.7,
});

const area = (box: Box) => box.width * box.height;

/**
 * Lay the whole sheet out for this screen: the numeral with its year, and the
 * title block, both clear of the card.
 *
 * The two blocks take separate margins when the screen has them. When it does
 * not — a phone, where the card leaves only a strip above and below — they
 * share one strip side by side, which is the difference between "everything
 * fits" and "the title is missing".
 */
export const sheetLayout = (viewport: Box, card: Box | null, padding = 16): SheetLayout => {
  const type = sheetType(viewport);
  const title = titleBlockSize(type);

  const zones: Zone[] = card
    ? freeZones(viewport, card)
    : [{ ...viewport, side: 'right' as Side }];

  const fitNumeral = (candidate: Zone, reservedWidth = 0): Placement | null => {
    const availableWidth = candidate.width - padding * 2 - reservedWidth;
    const availableHeight = candidate.height - padding * 2;
    if (availableWidth <= 0 || availableHeight <= 0) return null;

    const scale = Math.min(
      availableWidth / NUMERAL_BLOCK.width,
      availableHeight / NUMERAL_BLOCK.height,
      MAX_SCALE,
    );
    if (scale < MIN_SCALE) return null;

    const width = NUMERAL_BLOCK.width * scale;
    const blockHeight = NUMERAL_BLOCK.height * scale;
    return {
      // Right-hand end of the zone when something shares it, centred otherwise.
      left: candidate.left + reservedWidth + (candidate.width - reservedWidth - width) / 2,
      top: candidate.top + (candidate.height - blockHeight) / 2,
      width,
      height: NUMERAL_BOX.height * scale,
      side: candidate.side,
    };
  };

  const holdsTitle = (candidate: Zone) => candidate.width - padding * 2 >= title.width
    && candidate.height - padding * 2 >= title.height;

  const zoneOn = (side: Side) => zones.find((candidate) => candidate.side === side);

  const titleAnchor = (band: Zone): TitleAnchor => {
    const sideMargin = band.side === 'left' || band.side === 'right';
    return {
      // In a side margin the block hangs off its left edge, the way a title
      // block does; across a band both lines centre on the same axis.
      x: sideMargin
        ? band.left + Math.min(32, Math.max(padding, (band.width - title.width) / 2))
        : band.left + band.width / 2,
      y: band.top + band.height / 2 - type.year * 0.5,
      align: sideMargin ? 'start' : 'middle',
    };
  };

  const withYear = (placed: Placement) => {
    const size = clamp(12, placed.width * 0.17, 26);
    return {
      x: placed.left + placed.width / 2,
      y: placed.top + placed.height + size * 1.5,
      size,
    };
  };

  // The sheet reads the same way on every screen: the practice on the left or
  // above, the numeral on the right or below. Only when neither pairing fits
  // does it fall back to whatever margin is roomiest.
  const pairings: Array<[Side, Side]> = [['left', 'right'], ['top', 'bottom']];
  for (const [titleSide, numeralSide] of pairings) {
    const titleBand = zoneOn(titleSide);
    const numeralBand = zoneOn(numeralSide);
    if (!titleBand || !numeralBand || !holdsTitle(titleBand)) continue;
    const placed = fitNumeral(numeralBand);
    if (!placed) continue;
    return { numeral: placed, numeralYear: withYear(placed), title: titleAnchor(titleBand), type };
  }

  const byArea = [...zones].sort((left, right) => area(right) - area(left));
  const numeralZone = byArea.find((candidate) => fitNumeral(candidate) !== null) ?? null;
  const numeral = numeralZone ? fitNumeral(numeralZone) : null;
  const numeralYear = numeral ? withYear(numeral) : null;

  // A margin of its own first: the title block belongs beside the card, not
  // wedged next to the numeral, whenever the screen is wide enough for both.
  const titleZone = byArea.find((candidate) => candidate !== numeralZone && holdsTitle(candidate));
  if (titleZone) {
    return { numeral, numeralYear, title: titleAnchor(titleZone), type };
  }

  // Otherwise share the numeral's strip, if what is left of it is enough.
  if (numeral && numeralZone) {
    const shared = fitNumeral(numeralZone, title.width + padding);
    const roomBeside = numeralZone.width - padding * 2 - title.width;
    if (shared && roomBeside > 0 && numeralZone.height - padding * 2 >= title.height) {
      return {
        numeral: shared,
        numeralYear: withYear(shared),
        title: {
          x: numeralZone.left + padding,
          y: numeralZone.top + numeralZone.height / 2,
          align: 'start',
        },
        type,
      };
    }
  }

  // No room for the name: the numeral alone still says it.
  return { numeral, numeralYear, title: null, type };
};
