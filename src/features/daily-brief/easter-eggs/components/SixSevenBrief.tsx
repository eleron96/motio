import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './SixSevenBrief.module.css';

const random = (min: number, max: number) => Math.random() * (max - min) + min;
const sign = () => (Math.random() > 0.5 ? 1 : -1);

const prefersReducedMotion = () =>
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const CONFIG = {
  intervalMs: 140,
  burstCount: 20,
  maxLiveDigits: 44,
} as const;

/**
 * Daily-brief easter egg: a rain of the digits 6 and 7 in a body-level portal
 * behind the brief card. The two digits fall *differently* — the 6 is warm,
 * heavy and tumbles straight down while the 7 is cool, light and zig-zags — so
 * the falls read as distinct. Spawns digits imperatively while mounted and
 * tears everything down on unmount. No title and no text by design.
 */
export const SixSevenBrief = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || prefersReducedMotion()) return undefined;

    let liveDigits = 0;
    const timeouts = new Set<number>();

    const removeDigit = (digit: HTMLSpanElement) => {
      if (!digit.parentNode) return;
      digit.remove();
      liveDigits = Math.max(0, liveDigits - 1);
    };

    const createDigit = () => {
      if (liveDigits >= CONFIG.maxLiveDigits) return;

      const isSix = Math.random() < 0.5;
      const digit = document.createElement('span');
      digit.className = `${styles.digit} ${isSix ? styles.six : styles.seven}`;
      digit.textContent = isSix ? '6' : '7';

      // The 6 is bigger, slower and spins hard; the 7 is smaller, faster and
      // barely rotates — the per-digit values drive the two CSS keyframes.
      const duration = isSix ? random(4.6, 7) : random(2.8, 4.4);
      const size = isSix ? random(32, 64) : random(24, 50);
      const drift = isSix ? random(40, 120) * sign() : random(50, 130) * sign();
      const rotate = isSix ? random(420, 900) * sign() : random(60, 200) * sign();

      digit.style.setProperty('--x', `${random(-2, 98)}vw`);
      digit.style.setProperty('--size', `${size}px`);
      digit.style.setProperty('--duration', `${duration}s`);
      digit.style.setProperty('--drift', `${drift}px`);
      digit.style.setProperty('--rotate', `${rotate}deg`);
      digit.style.setProperty('--opacity', `${random(0.72, 1)}`);

      container.appendChild(digit);
      liveDigits += 1;

      const timeout = window.setTimeout(() => {
        timeouts.delete(timeout);
        removeDigit(digit);
      }, duration * 1000 + 180);
      timeouts.add(timeout);
    };

    // Initial burst so the screen fills quickly, then a steady trickle.
    for (let i = 0; i < CONFIG.burstCount; i += 1) {
      const timeout = window.setTimeout(() => {
        timeouts.delete(timeout);
        createDigit();
      }, i * 50);
      timeouts.add(timeout);
    }

    const intervalId = window.setInterval(createDigit, CONFIG.intervalMs);

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
