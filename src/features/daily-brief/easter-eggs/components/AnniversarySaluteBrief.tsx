import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './AnniversarySaluteBrief.module.css';
import { useBriefCardBounds, viewportBox } from '../useBriefCardBounds';
import { pointClearOfCard, type Box } from '../lib/briefLayout';

const random = (min: number, max: number) => Math.random() * (max - min) + min;

const prefersReducedMotion = () =>
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const CONFIG = {
  /** A burst every so often, with a little slack so the rhythm is not a metronome. */
  intervalMs: 620,
  intervalJitterMs: 260,
  minRays: 12,
  maxRays: 22,
  maxLiveBursts: 5,
  /** Every fourth burst leaves a "20" hanging instead of a fan of rays. */
  numeralEvery: 4,
} as const;

/**
 * Anniversary easter egg: a salute drawn the way a plan is — no sparkle balls,
 * just thin gold rays fanning out from a point, and every few bursts a "20"
 * flashing in outline instead of a fan.
 *
 * Bursts go off around the card, never under it: the card is measured at
 * runtime (see useBriefCardBounds) and points that would land behind it are
 * rejected, so the salute stays where it can actually be seen.
 *
 * A body-level portal below the brief card (z-index lives in the CSS module).
 * Bursts are created imperatively while mounted and torn down on unmount.
 */
export const AnniversarySaluteBrief = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const card = useBriefCardBounds();
  // Held in a ref so a card that moves — a rotated phone, a card that grew as
  // its content loaded — steers the next burst without restarting the salute
  // and blanking what is already in the air.
  const cardRef = useRef<Box | null>(null);
  const ready = card !== undefined;

  useEffect(() => {
    cardRef.current = card ?? null;
  }, [card]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !ready || prefersReducedMotion()) return undefined;

    let liveBursts = 0;
    let burstIndex = 0;
    const timeouts = new Set<number>();

    const schedule = (fn: () => void, delayMs: number) => {
      const id = window.setTimeout(() => {
        timeouts.delete(id);
        fn();
      }, delayMs);
      timeouts.add(id);
    };

    const retire = (node: HTMLElement, afterMs: number) => {
      schedule(() => {
        if (!node.parentNode) return;
        node.remove();
        liveBursts = Math.max(0, liveBursts - 1);
      }, afterMs);
    };

    const createNumeral = (x: number, y: number) => {
      const numeral = document.createElement('span');
      numeral.className = styles.numeral;
      numeral.textContent = '20';
      const duration = random(1.6, 2.1);

      numeral.style.setProperty('--x', `${x}px`);
      numeral.style.setProperty('--y', `${y}px`);
      numeral.style.setProperty('--size', `${random(64, 104)}px`);
      numeral.style.setProperty('--duration', `${duration}s`);

      container.appendChild(numeral);
      liveBursts += 1;
      retire(numeral, duration * 1000 + 120);
    };

    const createFan = (x: number, y: number) => {
      const burst = document.createElement('div');
      burst.className = styles.burst;
      burst.style.setProperty('--x', `${x}px`);
      burst.style.setProperty('--y', `${y}px`);

      const rayCount = Math.round(random(CONFIG.minRays, CONFIG.maxRays));
      // A shared start angle keeps each fan even rather than clumped.
      const offset = random(0, 360);
      let longest = 0;

      for (let index = 0; index < rayCount; index += 1) {
        const ray = document.createElement('span');
        ray.className = styles.ray;
        const duration = random(0.9, 1.5);
        longest = Math.max(longest, duration);

        ray.style.setProperty('--angle', `${offset + (360 / rayCount) * index + random(-6, 6)}deg`);
        ray.style.setProperty('--length', `${random(70, 190)}px`);
        ray.style.setProperty('--duration', `${duration}s`);
        ray.style.animationDelay = `${random(0, 0.12)}s`;

        burst.appendChild(ray);
      }

      container.appendChild(burst);
      liveBursts += 1;
      retire(burst, longest * 1000 + 260);
    };

    // Inset so a burst never clips against the very edge of the screen.
    const field = (): Box => {
      const view = viewportBox();
      return {
        left: view.width * 0.08,
        top: view.height * 0.1,
        width: view.width * 0.84,
        height: view.height * 0.78,
      };
    };

    const somewhereClear = () => pointClearOfCard(field(), cardRef.current, Math.random);

    const fire = () => {
      if (liveBursts < CONFIG.maxLiveBursts) {
        const { x, y } = somewhereClear();
        burstIndex += 1;
        if (burstIndex % CONFIG.numeralEvery === 0) createNumeral(x, y);
        else createFan(x, y);
      }
      schedule(fire, CONFIG.intervalMs + random(-CONFIG.intervalJitterMs, CONFIG.intervalJitterMs));
    };

    // Open with two bursts so the salute starts immediately, then settle in.
    const opening = somewhereClear();
    createFan(opening.x, opening.y);
    schedule(() => {
      const second = somewhereClear();
      createFan(second.x, second.y);
    }, 320);
    schedule(fire, 900);

    return () => {
      timeouts.forEach((id) => window.clearTimeout(id));
      timeouts.clear();
      container.replaceChildren();
    };
  }, [ready]);

  return createPortal(
    <div ref={containerRef} className={styles.overlay} aria-hidden="true" />,
    document.body,
  );
};
