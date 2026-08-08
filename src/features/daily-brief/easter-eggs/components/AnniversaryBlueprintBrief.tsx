import { useEffect, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import styles from './AnniversaryBlueprintBrief.module.css';

const random = (min: number, max: number) => Math.random() * (max - min) + min;

const prefersReducedMotion = () =>
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Stroke timing as CSS custom properties, which React's types do not model. */
const pen = (length: number, delay: string, duration: string): CSSProperties => ({
  '--len': String(length),
  '--delay': delay,
  '--duration': duration,
} as CSSProperties);

/** The pen reaches the numeral only after the axes are down. */
const SPARKS_DELAY_MS = 2600;

const SPARK_CONFIG = {
  count: 26,
  minDistance: 120,
  maxDistance: 320,
} as const;

/**
 * Anniversary easter egg: the brief is drawn on, the way a sheet is. Axes and
 * dimension lines go down first, then "20" is drawn stroke by stroke in gold,
 * the hatch fills it in, and a handful of sparks scatter from the middle.
 *
 * A body-level portal behind the brief card (z-index lives in the CSS module).
 * No title and no text by design — the numeral is the whole message. Under
 * reduced motion the drawing is simply already finished when it appears.
 */
export const AnniversaryBlueprintBrief = () => {
  const sparksRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = sparksRef.current;
    if (!container || prefersReducedMotion()) return undefined;

    const timeouts = new Set<number>();

    const scatter = () => {
      for (let index = 0; index < SPARK_CONFIG.count; index += 1) {
        const spark = document.createElement('span');
        spark.className = styles.spark;

        const angle = random(0, Math.PI * 2);
        const distance = random(SPARK_CONFIG.minDistance, SPARK_CONFIG.maxDistance);
        const duration = random(0.9, 1.6);

        spark.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
        spark.style.setProperty('--dy', `${Math.sin(angle) * distance}px`);
        spark.style.setProperty('--size', `${random(4, 9)}px`);
        spark.style.setProperty('--duration', `${duration}s`);

        container.appendChild(spark);

        const cleanup = window.setTimeout(() => {
          timeouts.delete(cleanup);
          spark.remove();
        }, duration * 1000 + 120);
        timeouts.add(cleanup);
      }
    };

    const start = window.setTimeout(() => {
      timeouts.delete(start);
      scatter();
    }, SPARKS_DELAY_MS);
    timeouts.add(start);

    return () => {
      timeouts.forEach((id) => window.clearTimeout(id));
      timeouts.clear();
      container.replaceChildren();
    };
  }, []);

  return createPortal(
    <div className={styles.overlay} aria-hidden="true">
      <svg className={styles.sheet} viewBox="0 0 300 200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="anniversaryHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#f5c96b" strokeWidth="1" opacity="0.35" />
          </pattern>
        </defs>

        {/* Axes: the sheet before anything is on it. */}
        <line
          className={`${styles.stroke} ${styles.axis}`}
          style={pen(300, '0s', '0.7s')}
          x1="0" y1="100" x2="300" y2="100"
        />
        <line
          className={`${styles.stroke} ${styles.axis}`}
          style={pen(200, '0.15s', '0.6s')}
          x1="150" y1="0" x2="150" y2="200"
        />

        {/* Dimension line under the numeral, ticks included. */}
        <path
          className={`${styles.stroke} ${styles.dimension}`}
          style={pen(180, '0.5s', '0.7s')}
          d="M70 160 H230 M70 154 V166 M230 154 V166"
        />

        {/* "20" — two strokes, drawn in order like a hand would. */}
        <path
          className={`${styles.stroke} ${styles.numeral}`}
          style={pen(210, '1.1s', '0.9s')}
          d="M92 74 a24 24 0 0 1 48 0 c0 24 -48 34 -48 62 h50"
        />
        <ellipse
          className={`${styles.stroke} ${styles.numeral}`}
          style={pen(230, '1.5s', '1s')}
          cx="188" cy="106" rx="30" ry="42"
        />
        <ellipse className={styles.hatch} cx="188" cy="106" rx="30" ry="42" />
      </svg>

      <div ref={sparksRef} className={styles.sparks} />
    </div>,
    document.body,
  );
};
