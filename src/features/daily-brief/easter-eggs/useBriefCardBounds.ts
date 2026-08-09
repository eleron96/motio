import { useEffect, useState } from 'react';
import type { Box } from './lib/briefLayout';

/** Set on the brief's dialog card so the eggs can draw around it. */
export const BRIEF_CARD_ATTRIBUTE = 'data-daily-brief-card';

const measure = (): Box | null => {
  if (typeof document === 'undefined') return null;
  const card = document.querySelector(`[${BRIEF_CARD_ATTRIBUTE}]`);
  if (!card) return null;
  const rect = card.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
};

/**
 * Where the brief card sits, so an egg can work around it instead of behind it.
 *
 * `undefined` means "not measured yet" and `null` means "there is no card" —
 * the difference matters, because drawing during that first frame would put the
 * artwork under the card and then jump it away.
 *
 * The card animates in, so the first measurement is taken on the next frame and
 * then kept current with a ResizeObserver — a phone rotating or the card
 * growing as its content loads both move it.
 */
export const useBriefCardBounds = (): Box | null | undefined => {
  const [bounds, setBounds] = useState<Box | null | undefined>(undefined);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let frame = 0;
    const update = () => setBounds(measure());

    // The dialog is mid-animation on mount; one frame later it has its size.
    frame = window.requestAnimationFrame(update);

    const card = document.querySelector(`[${BRIEF_CARD_ATTRIBUTE}]`);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    if (card && observer) observer.observe(card);

    window.addEventListener('resize', update);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  return bounds;
};

/** The visible area, in the same coordinates as the card's bounds. */
export const viewportBox = (): Box => ({
  left: 0,
  top: 0,
  width: typeof window === 'undefined' ? 0 : window.innerWidth,
  height: typeof window === 'undefined' ? 0 : window.innerHeight,
});
