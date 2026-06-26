import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './MashallahBrief.module.css';

const random = (min: number, max: number) => Math.random() * (max - min) + min;
const sign = () => (Math.random() > 0.5 ? 1 : -1);

const prefersReducedMotion = () =>
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The letters that rain down, drawn from the word MASHALLAH. */
const LETTERS = ['M', 'A', 'S', 'H', 'A', 'L', 'L', 'A', 'H'] as const;
const CRESCENT = '🌙';

const CONFIG = {
  intervalMs: 150,
  burstCount: 18,
  maxLiveGlyphs: 40,
} as const;

/**
 * Daily-brief easter egg: a warm rain of the letters of "mashallah" mixed with
 * crescent moons, in a body-level portal behind the brief card. Letters are gold
 * and tumble straight down; the 🌙 crescents are lighter and sway as they fall,
 * so the two read as distinct. Spawns glyphs imperatively while mounted and
 * tears everything down on unmount. No title and no text by design.
 */
export const MashallahBrief = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || prefersReducedMotion()) return undefined;

    let liveGlyphs = 0;
    const timeouts = new Set<number>();

    const removeGlyph = (glyph: HTMLSpanElement) => {
      if (!glyph.parentNode) return;
      glyph.remove();
      liveGlyphs = Math.max(0, liveGlyphs - 1);
    };

    const createGlyph = () => {
      if (liveGlyphs >= CONFIG.maxLiveGlyphs) return;

      const isLetter = Math.random() < 0.6;
      const glyph = document.createElement('span');
      glyph.className = `${styles.glyph} ${isLetter ? styles.letter : styles.crescent}`;
      glyph.textContent = isLetter
        ? LETTERS[Math.floor(Math.random() * LETTERS.length)]
        : CRESCENT;

      // Letters are bigger, slower and spin hard; crescents are lighter, a touch
      // faster and barely rotate — the per-glyph values drive the two keyframes.
      const duration = isLetter ? random(4.2, 6.6) : random(3.2, 5);
      const size = isLetter ? random(26, 52) : random(22, 44);
      const drift = isLetter ? random(40, 120) * sign() : random(50, 130) * sign();
      const rotate = isLetter ? random(360, 760) * sign() : random(40, 160) * sign();

      glyph.style.setProperty('--x', `${random(-2, 98)}vw`);
      glyph.style.setProperty('--size', `${size}px`);
      glyph.style.setProperty('--duration', `${duration}s`);
      glyph.style.setProperty('--drift', `${drift}px`);
      glyph.style.setProperty('--rotate', `${rotate}deg`);
      glyph.style.setProperty('--opacity', `${random(0.74, 1)}`);

      container.appendChild(glyph);
      liveGlyphs += 1;

      const timeout = window.setTimeout(() => {
        timeouts.delete(timeout);
        removeGlyph(glyph);
      }, duration * 1000 + 180);
      timeouts.add(timeout);
    };

    // Initial burst so the screen fills quickly, then a steady trickle.
    for (let i = 0; i < CONFIG.burstCount; i += 1) {
      const timeout = window.setTimeout(() => {
        timeouts.delete(timeout);
        createGlyph();
      }, i * 55);
      timeouts.add(timeout);
    }

    const intervalId = window.setInterval(createGlyph, CONFIG.intervalMs);

    return () => {
      window.clearInterval(intervalId);
      timeouts.forEach((id) => window.clearTimeout(id));
      timeouts.clear();
      container.replaceChildren();
    };
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div ref={containerRef} className={styles.overlay} aria-hidden="true" />,
    document.body,
  );
};
