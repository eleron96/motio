import { describe, expect, it } from 'vitest';
import {
  CARD_MARGIN,
  freeZones,
  isBehindCard,
  placeBesideCard,
  pointClearOfCard,
  type Box,
} from '@/features/daily-brief/easter-eggs/lib/briefLayout';

const desktop: Box = { left: 0, top: 0, width: 1440, height: 900 };
// Roughly the brief on a desktop: 480 wide, centred.
const card: Box = { left: 480, top: 250, width: 480, height: 400 };
const numeral = { width: 120, height: 92 };

const overlaps = (a: Box, b: Box, margin = CARD_MARGIN) =>
  a.left < b.left + b.width + margin
  && a.left + a.width > b.left - margin
  && a.top < b.top + b.height + margin
  && a.top + a.height > b.top - margin;

describe('briefLayout', () => {
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
    // A card pinned to the top leaves no room above it.
    const pinned: Box = { left: 0, top: 0, width: 1440, height: 400 };

    const zones = freeZones(desktop, pinned);

    expect(zones).toHaveLength(1);
    expect(zones[0]!.top).toBeGreaterThan(pinned.height);
  });

  it('places the numeral clear of the card', () => {
    const placement = placeBesideCard(desktop, card, numeral);

    expect(placement).not.toBeNull();
    expect(overlaps(placement!, card)).toBe(false);
    // Still on screen.
    expect(placement!.left).toBeGreaterThanOrEqual(0);
    expect(placement!.top).toBeGreaterThanOrEqual(0);
    expect(placement!.left + placement!.width).toBeLessThanOrEqual(desktop.width);
    expect(placement!.top + placement!.height).toBeLessThanOrEqual(desktop.height);
  });

  it('keeps the numeral proportional', () => {
    const placement = placeBesideCard(desktop, card, numeral)!;

    expect(placement.width / placement.height).toBeCloseTo(numeral.width / numeral.height, 5);
  });

  it('uses the whole viewport when there is no card to avoid', () => {
    const placement = placeBesideCard(desktop, null, numeral);

    expect(placement).not.toBeNull();
    expect(placement!.left).toBeGreaterThan(0);
    expect(placement!.top).toBeGreaterThan(0);
  });

  it('gives up rather than drawing under a card that fills the screen', () => {
    const everywhere: Box = { left: 0, top: 0, width: 1440, height: 900 };

    expect(placeBesideCard(desktop, everywhere, numeral)).toBeNull();
  });

  it('still finds room on a phone, above or below the card', () => {
    const phone: Box = { left: 0, top: 0, width: 390, height: 844 };
    const phoneCard: Box = { left: 16, top: 240, width: 358, height: 380 };

    const placement = placeBesideCard(phone, phoneCard, numeral);

    expect(placement).not.toBeNull();
    expect(overlaps(placement!, phoneCard)).toBe(false);
  });

  it('knows which points the card would hide', () => {
    expect(isBehindCard({ x: 700, y: 400 }, card)).toBe(true);
    expect(isBehindCard({ x: 100, y: 100 }, card)).toBe(false);
    // The margin counts as hidden: a burst hugging the edge reads as clipped.
    expect(isBehindCard({ x: card.left - CARD_MARGIN + 2, y: 400 }, card)).toBe(true);
    expect(isBehindCard({ x: 100, y: 100 }, null)).toBe(false);
  });

  it('picks burst points away from the card', () => {
    // A generator that keeps aiming at the middle of the card, then gives up
    // and aims high-left.
    const sequence = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.02, 0.02];
    let index = 0;
    const random = () => sequence[Math.min(index++, sequence.length - 1)]!;

    const point = pointClearOfCard(desktop, card, random);

    expect(isBehindCard(point, card)).toBe(false);
  });

  it('falls back to a plain point when nothing is clear', () => {
    const everywhere: Box = { left: 0, top: 0, width: 1440, height: 900 };

    const point = pointClearOfCard(desktop, everywhere, () => 0.5);

    // No infinite loop, no exception — the old behaviour, on a screen the card
    // has taken over entirely.
    expect(point).toEqual({ x: 720, y: 450 });
  });
});
