import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { AnniversaryBlueprintBrief } from '@/features/daily-brief/easter-eggs/components/AnniversaryBlueprintBrief';
import { AnniversarySaluteBrief } from '@/features/daily-brief/easter-eggs/components/AnniversarySaluteBrief';
import { BRIEF_CARD_ATTRIBUTE } from '@/features/daily-brief/easter-eggs/useBriefCardBounds';
import { isBehindCard, type Box } from '@/features/daily-brief/easter-eggs/lib/briefLayout';

const CARD: Box = { left: 272, top: 184, width: 480, height: 400 };

/** A stand-in for the brief's dialog card, measurable in jsdom. */
const mountCard = (): HTMLElement => {
  const card = document.createElement('div');
  card.setAttribute(BRIEF_CARD_ATTRIBUTE, '');
  card.getBoundingClientRect = () => ({
    left: CARD.left,
    top: CARD.top,
    width: CARD.width,
    height: CARD.height,
    right: CARD.left + CARD.width,
    bottom: CARD.top + CARD.height,
    x: CARD.left,
    y: CARD.top,
    toJSON: () => ({}),
  }) as DOMRect;
  document.body.appendChild(card);
  return card;
};

const parseTranslate = (transform: string) => {
  const match = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(transform);
  if (!match) throw new Error(`no translate in ${transform}`);
  return { x: Number(match[1]), y: Number(match[2]) };
};

describe('anniversary eggs lay themselves out around the brief card', () => {
  afterEach(() => {
    document.querySelectorAll(`[${BRIEF_CARD_ATTRIBUTE}]`).forEach((node) => node.remove());
  });

  it('draws the numeral clear of the card instead of underneath it', async () => {
    mountCard();

    render(<AnniversaryBlueprintBrief />);

    // Nothing is drawn until the card has been measured, a frame after mount.
    const group = await waitFor(() => {
      const outline = document.querySelector('svg rect');
      const node = document.querySelector('g[transform]');
      if (!outline || !node) throw new Error('not measured yet');
      return node;
    });

    const { x, y } = parseTranslate(group.getAttribute('transform') ?? '');
    // The numeral's own box is 120×92 before scaling; its corners must all miss
    // the card, which is the whole point of measuring it.
    expect(isBehindCard({ x, y }, CARD)).toBe(false);
    expect(isBehindCard({ x: x + 120, y: y + 92 }, CARD)).toBe(false);
  });

  it('traces the card rather than covering it', async () => {
    mountCard();

    render(<AnniversaryBlueprintBrief />);

    const outline = await waitFor(() => {
      const node = document.querySelector('svg rect');
      if (!node) throw new Error('outline not drawn yet');
      return node;
    });

    // The outline sits just outside the card on every side.
    expect(Number(outline.getAttribute('x'))).toBeLessThan(CARD.left);
    expect(Number(outline.getAttribute('y'))).toBeLessThan(CARD.top);
    expect(Number(outline.getAttribute('width'))).toBeGreaterThan(CARD.width);
    expect(Number(outline.getAttribute('height'))).toBeGreaterThan(CARD.height);
  });

  it('fires every salute burst somewhere the card does not hide', async () => {
    mountCard();

    render(<AnniversarySaluteBrief />);

    // The salute holds off until the card is measured, then keeps firing.
    await waitFor(() => {
      if (document.querySelectorAll('div[style*="--x"]').length === 0) {
        throw new Error('no bursts yet');
      }
    });

    await act(async () => {
      await new Promise((resolve) => { setTimeout(resolve, 1400); });
    });

    const bursts = Array.from(document.querySelectorAll('[style*="--x"]'));
    expect(bursts.length).toBeGreaterThan(1);
    for (const burst of bursts) {
      const style = burst.getAttribute('style') ?? '';
      const x = Number(/--x:\s*([-\d.]+)px/.exec(style)?.[1]);
      const y = Number(/--y:\s*([-\d.]+)px/.exec(style)?.[1]);
      expect(isBehindCard({ x, y }, CARD)).toBe(false);
    }
  });

  it('uses the middle of the screen when there is no card to work around', async () => {
    render(<AnniversaryBlueprintBrief />);

    const group = await waitFor(() => {
      const node = document.querySelector('g[transform]');
      if (!node) throw new Error('numeral not placed yet');
      return node;
    });

    const { x } = parseTranslate(group.getAttribute('transform') ?? '');
    expect(x).toBeGreaterThan(0);
    // No card, no outline to trace.
    expect(document.querySelector('svg rect')).toBeNull();
  });
});
