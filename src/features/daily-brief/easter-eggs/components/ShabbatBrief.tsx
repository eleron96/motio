import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './ShabbatBrief.module.css';

const ICONS = ['✡', '🕎', '💰', '🪙'];

const CONFIG = {
  intervalMs: 130,
  burstCount: 22,
  maxLiveIcons: 46,
  minSize: 24,
  maxSize: 58,
} as const;

const random = (min: number, max: number) => Math.random() * (max - min) + min;

const prefersReducedMotion = () =>
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Daily-brief easter egg: a gentle rain of Shabbat-themed icons rendered in a
 * body-level portal behind the brief card (z-index lives in the CSS module).
 * Spawns icons imperatively while mounted and tears everything down on unmount.
 * No title and no text by design.
 */
export const ShabbatBrief = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || prefersReducedMotion()) return undefined;

    let liveIcons = 0;
    const timeouts = new Set<number>();

    const removeIcon = (icon: HTMLSpanElement) => {
      if (!icon.parentNode) return;
      icon.remove();
      liveIcons = Math.max(0, liveIcons - 1);
    };

    const createIcon = () => {
      if (liveIcons >= CONFIG.maxLiveIcons) return;

      const icon = document.createElement('span');
      icon.className = styles.icon;
      icon.textContent = ICONS[(Math.random() * ICONS.length) | 0];

      const duration = random(3.8, 6.4);
      icon.style.setProperty('--x', `${random(-4, 100)}vw`);
      icon.style.setProperty('--size', `${random(CONFIG.minSize, CONFIG.maxSize)}px`);
      icon.style.setProperty('--duration', `${duration}s`);
      icon.style.setProperty('--drift', `${random(-90, 90)}px`);
      icon.style.setProperty('--rotate', `${(Math.random() > 0.5 ? 1 : -1) * random(180, 540)}deg`);
      icon.style.setProperty('--opacity', `${random(0.72, 1)}`);

      container.appendChild(icon);
      liveIcons += 1;

      const timeout = window.setTimeout(() => {
        timeouts.delete(timeout);
        removeIcon(icon);
      }, duration * 1000 + 180);
      timeouts.add(timeout);
    };

    // Initial burst so the screen fills quickly, then a steady trickle.
    for (let i = 0; i < CONFIG.burstCount; i += 1) {
      const timeout = window.setTimeout(() => {
        timeouts.delete(timeout);
        createIcon();
      }, i * 45);
      timeouts.add(timeout);
    }

    const intervalId = window.setInterval(createIcon, CONFIG.intervalMs);

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
