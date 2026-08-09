import { describe, expect, it } from 'vitest';
import {
  CARD_MARGIN,
  freeZones,
  isBehindCard,
  pointClearOfCard,
  sheetLayout,
  sheetType,
  type Box,
} from '@/features/daily-brief/easter-eggs/lib/briefLayout';

const desktop: Box = { left: 0, top: 0, width: 1440, height: 900 };
// Roughly the brief on a desktop: 480 wide, centred.
const card: Box = { left: 480, top: 250, width: 480, height: 400 };

const laptop: Box = { left: 0, top: 0, width: 1280, height: 720 };
const laptopCard: Box = { left: 400, top: 140, width: 480, height: 440 };

const phone: Box = { left: 0, top: 0, width: 390, height: 844 };
// A phone brief: full width bar the margins, tall, leaving a band top and bottom.
const phoneCard: Box = { left: 16, top: 240, width: 358, height: 420 };

const overlaps = (a: Box, b: Box, margin = CARD_MARGIN) =>
  a.left < b.left + b.width + margin
  && a.left + a.width > b.left - margin
  && a.top < b.top + b.height + margin
  && a.top + a.height > b.top - margin;

const insideViewport = (box: Box, viewport: Box) =>
  box.left >= viewport.left
  && box.top >= viewport.top
  && box.left + box.width <= viewport.left + viewport.width
  && box.top + box.height <= viewport.top + viewport.height;

describe('freeZones', () => {
  it('offers the four strips the card leaves free', () => {
    const zones = freeZones(desktop, card);

    expect(zones).toHaveLength(4);
    for (const zone of zones) {
      expect(zone.width).toBeGreaterThan(0);
      expect(zone.height).toBeGreaterThan(0);
      expect(overlaps({ ...zone }, card, 0)).toBe(false);
    }
  });

  it('drops a strip the card has squeezed to nothing', () => {
    const pinned: Box = { left: 0, top: 0, width: 1440, height: 400 };

    const zones = freeZones(desktop, pinned);

    expect(zones).toHaveLength(1);
    expect(zones[0]!.top).toBeGreaterThan(pinned.height);
  });
});

describe('sheetType', () => {
  it('scales the lettering with the screen', () => {
    const big = sheetType(desktop);
    const small = sheetType(phone);

    // 38px reads well on a desktop and shouts on a phone.
    expect(big.practice).toBe(38);
    expect(small.practice).toBeLessThan(big.practice);
    expect(small.practice).toBeGreaterThanOrEqual(17);
    expect(small.year).toBeLessThan(small.practice);
  });
});

describe('sheetLayout', () => {
  it('puts the practice on the left and the numeral on the right of a desktop', () => {
    const layout = sheetLayout(desktop, card);

    expect(layout.numeral).not.toBeNull();
    expect(layout.title).not.toBeNull();
    expect(overlaps(layout.numeral!, card)).toBe(false);
    expect(insideViewport(layout.numeral!, desktop)).toBe(true);
    // The sheet always reads the same way round.
    expect(layout.title!.x).toBeLessThan(card.left);
    expect(layout.numeral!.left).toBeGreaterThan(card.left + card.width);
  });

  it('keeps that reading order as the desktop window narrows', () => {
    for (const width of [1680, 1440, 1280, 1150]) {
      const viewport: Box = { left: 0, top: 0, width, height: 820 };
      // The brief is a fixed 480 wide, centred.
      const dialog: Box = { left: (width - 480) / 2, top: 180, width: 480, height: 420 };

      const layout = sheetLayout(viewport, dialog);

      expect(layout.numeral, `numeral at ${width}px`).not.toBeNull();
      expect(layout.title, `title at ${width}px`).not.toBeNull();
      expect(layout.title!.x).toBeLessThan(dialog.left);
      expect(layout.numeral!.left).toBeGreaterThan(dialog.left + dialog.width);
      expect(insideViewport(layout.numeral!, viewport)).toBe(true);
    }
  });

  it('keeps the anniversary year under the numeral and on screen', () => {
    for (const [viewport, dialog] of [
      [desktop, card],
      [laptop, laptopCard],
      [phone, phoneCard],
    ] as Array<[Box, Box]>) {
      const layout = sheetLayout(viewport, dialog);

      expect(layout.numeral).not.toBeNull();
      const year = layout.numeralYear!;
      // Centred under the numeral...
      expect(year.x).toBeCloseTo(layout.numeral!.left + layout.numeral!.width / 2, 5);
      expect(year.y).toBeGreaterThan(layout.numeral!.top + layout.numeral!.height);
      // ...and neither off the screen nor under the card.
      expect(year.y).toBeLessThanOrEqual(viewport.top + viewport.height);
      expect(isBehindCard({ x: year.x, y: year.y }, dialog)).toBe(false);
    }
  });

  it('stacks the sheet on a phone: the name above, the numeral below', () => {
    const layout = sheetLayout(phone, phoneCard);

    expect(layout.title).not.toBeNull();
    expect(layout.numeral).not.toBeNull();
    // The name sits in the band above the card...
    expect(layout.title!.y).toBeLessThan(phoneCard.top);
    // ...and the numeral with its year in the band below it.
    expect(layout.numeral!.top).toBeGreaterThan(phoneCard.top + phoneCard.height);
    expect(insideViewport(layout.numeral!, phone)).toBe(true);
    expect(layout.numeralYear!.y).toBeLessThanOrEqual(phone.height);
  });

  it('centres the title block when it spans a band, and hangs it left in a margin', () => {
    const stacked = sheetLayout(phone, phoneCard);
    // Across the top of a phone both lines share one centred axis.
    expect(stacked.title!.align).toBe('middle');
    expect(stacked.title!.x).toBeCloseTo(phone.width / 2, 5);

    const beside = sheetLayout(desktop, card);
    // In a side margin it reads as a drawing's title block instead.
    expect(beside.title!.align).toBe('start');
    expect(beside.title!.x).toBeLessThan(card.left);
  });

  it('marks the phone layout as stacked, so the vertical axis can be dropped', () => {
    // A line down the middle of a phone reads as a stray mark, not a drawing.
    expect(sheetLayout(phone, phoneCard).stacked).toBe(true);
    expect(sheetLayout(desktop, card).stacked).toBe(false);
    expect(sheetLayout(laptop, laptopCard).stacked).toBe(false);
  });

  it('still fits on a small phone', () => {
    const small: Box = { left: 0, top: 0, width: 360, height: 640 };
    const smallCard: Box = { left: 12, top: 180, width: 336, height: 330 };

    const layout = sheetLayout(small, smallCard);

    expect(layout.numeral).not.toBeNull();
    expect(insideViewport(layout.numeral!, small)).toBe(true);
    expect(overlaps(layout.numeral!, smallCard)).toBe(false);
    expect(layout.numeralYear!.y).toBeLessThanOrEqual(small.height);
  });

  it('uses the whole screen when there is no card', () => {
    const layout = sheetLayout(desktop, null);

    expect(layout.numeral).not.toBeNull();
    expect(insideViewport(layout.numeral!, desktop)).toBe(true);
  });

  it('draws nothing rather than hiding under a card that fills the screen', () => {
    const everywhere: Box = { left: 0, top: 0, width: 1440, height: 900 };

    const layout = sheetLayout(desktop, everywhere);

    expect(layout.numeral).toBeNull();
    expect(layout.numeralYear).toBeNull();
    expect(layout.title).toBeNull();
  });
});

describe('bursts', () => {
  it('knows which points the card would hide', () => {
    expect(isBehindCard({ x: 700, y: 400 }, card)).toBe(true);
    expect(isBehindCard({ x: 100, y: 100 }, card)).toBe(false);
    expect(isBehindCard({ x: card.left - CARD_MARGIN + 2, y: 400 }, card)).toBe(true);
    expect(isBehindCard({ x: 100, y: 100 }, null)).toBe(false);
  });

  it('picks burst points away from the card', () => {
    const sequence = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.02, 0.02];
    let index = 0;
    const random = () => sequence[Math.min(index++, sequence.length - 1)]!;

    expect(isBehindCard(pointClearOfCard(desktop, card, random), card)).toBe(false);
  });

  it('falls back to a plain point when nothing is clear', () => {
    const everywhere: Box = { left: 0, top: 0, width: 1440, height: 900 };

    // No infinite loop, no exception — the old behaviour, on a screen the card
    // has taken over entirely.
    expect(pointClearOfCard(desktop, everywhere, () => 0.5)).toEqual({ x: 720, y: 450 });
  });
});
