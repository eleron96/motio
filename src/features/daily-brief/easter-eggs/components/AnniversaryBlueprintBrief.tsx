import { useEffect, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import styles from './AnniversaryBlueprintBrief.module.css';
import { useBriefCardBounds, viewportBox } from '../useBriefCardBounds';
import {
  bottomRightAnchor,
  leftMarginAnchor,
  placeBesideCard,
  CARD_MARGIN,
} from '../lib/briefLayout';

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

/** The sheet's title block: who, and the span the anniversary covers. */
const PRACTICE = 'СПИЧ';
const YEAR_FROM = '2006';
const YEAR_TO = '2026';

/** "20" drawn in its own coordinates, then placed wherever there is room. */
const NUMERAL = { width: 120, height: 92 } as const;
const TWO_PATH = 'M4 26 a24 24 0 0 1 48 0 c0 24 -48 34 -48 62 h50';
const ZERO = { cx: 88, cy: 48, rx: 30, ry: 42 } as const;

/** The pen reaches the numeral only after the outline is down. */
const SPARKS_DELAY_MS = 2600;

const SPARK_CONFIG = {
  count: 24,
  minDistance: 60,
  maxDistance: 170,
} as const;

/**
 * Anniversary easter egg: the brief is drawn on, the way a sheet is. The card
 * itself becomes the part on the drawing — an outline is traced around it,
 * dimension lines go down along its edges, and a gold "20" is drawn stroke by
 * stroke in whichever margin has room, then hatched and sparked. The margins
 * carry the title block: the practice and its founding year down the left, the
 * current year in the bottom-right corner, the way a sheet is signed off.
 *
 * Everything is laid out *around* the card rather than behind it: the card is
 * measured at runtime (see useBriefCardBounds), so nothing important ends up
 * hidden under the report. If the card leaves no room — a small phone — the
 * numeral is skipped and only the outline is drawn.
 *
 * A body-level portal below the card (z-index lives in the CSS module). No
 * title and no text by design. Under reduced motion the drawing is simply
 * already finished when it appears.
 */
export const AnniversaryBlueprintBrief = () => {
  const sparksRef = useRef<HTMLDivElement | null>(null);
  const card = useBriefCardBounds();
  const viewport = viewportBox();

  // Undefined means the card has not been measured yet: drawing now would put
  // the numeral under it for a frame and then jump it aside.
  const measured = card !== undefined;
  const titleBlock = measured ? leftMarginAnchor(viewport, card ?? null) : null;
  const signOff = measured ? bottomRightAnchor(viewport, card ?? null) : null;
  // The left margin is the title block's; the numeral goes elsewhere unless
  // there is nowhere else at all.
  const numeral = measured
    ? placeBesideCard(viewport, card ?? null, NUMERAL, { avoid: titleBlock ? ['left'] : [] })
    : null;
  // Primitives, so the scatter re-runs when the numeral moves and not when a
  // fresh object with the same values comes back from a re-render.
  const sparkX = numeral ? numeral.left + numeral.width / 2 : null;
  const sparkY = numeral ? numeral.top + numeral.height / 2 : null;

  useEffect(() => {
    const container = sparksRef.current;
    if (!container || sparkX === null || sparkY === null || prefersReducedMotion()) return undefined;

    const timeouts = new Set<number>();

    const scatter = () => {
      for (let index = 0; index < SPARK_CONFIG.count; index += 1) {
        const spark = document.createElement('span');
        spark.className = styles.spark;

        const angle = random(0, Math.PI * 2);
        const distance = random(SPARK_CONFIG.minDistance, SPARK_CONFIG.maxDistance);
        const duration = random(0.9, 1.6);

        spark.style.left = `${sparkX}px`;
        spark.style.top = `${sparkY}px`;
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
    // Restarting when the numeral moves is the point: sparks belong wherever
    // it ended up.
  }, [sparkX, sparkY]);

  // The outline traces the card at a constant remove, so it reads as the part
  // on the sheet rather than as a border of its own.
  const outline = card ? {
    left: card.left - CARD_MARGIN / 2,
    top: card.top - CARD_MARGIN / 2,
    width: card.width + CARD_MARGIN,
    height: card.height + CARD_MARGIN,
  } : null;
  const outlineLength = outline ? (outline.width + outline.height) * 2 : 0;

  const dimensionY = outline ? outline.top + outline.height + 18 : 0;
  const dimensionX = outline ? outline.left - 18 : 0;

  return createPortal(
    <div className={styles.overlay} aria-hidden="true">
      <svg
        className={styles.sheet}
        viewBox={`0 0 ${viewport.width} ${viewport.height}`}
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="anniversaryHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#f5c96b" strokeWidth="1" opacity="0.35" />
          </pattern>
        </defs>

        {outline && (
          <>
            {/* Axes through the card's centre: the sheet before anything is on it. */}
            <line
              className={`${styles.stroke} ${styles.axis}`}
              style={pen(viewport.width, '0s', '0.7s')}
              x1="0" y1={card!.top + card!.height / 2}
              x2={viewport.width} y2={card!.top + card!.height / 2}
            />
            <line
              className={`${styles.stroke} ${styles.axis}`}
              style={pen(viewport.height, '0.15s', '0.6s')}
              x1={card!.left + card!.width / 2} y1="0"
              x2={card!.left + card!.width / 2} y2={viewport.height}
            />

            {/* The card, outlined the way a part is. */}
            <rect
              className={`${styles.stroke} ${styles.outline}`}
              style={pen(outlineLength, '0.35s', '1.1s')}
              x={outline.left} y={outline.top}
              width={outline.width} height={outline.height}
              rx="14"
            />

            {/* Dimension lines along its width and height, ticks included. */}
            <path
              className={`${styles.stroke} ${styles.dimension}`}
              style={pen(outline.width + 24, '0.9s', '0.7s')}
              d={`M${outline.left} ${dimensionY} H${outline.left + outline.width}`
                + ` M${outline.left} ${dimensionY - 6} V${dimensionY + 6}`
                + ` M${outline.left + outline.width} ${dimensionY - 6} V${dimensionY + 6}`}
            />
            <path
              className={`${styles.stroke} ${styles.dimension}`}
              style={pen(outline.height + 24, '1.05s', '0.7s')}
              d={`M${dimensionX} ${outline.top} V${outline.top + outline.height}`
                + ` M${dimensionX - 6} ${outline.top} H${dimensionX + 6}`
                + ` M${dimensionX - 6} ${outline.top + outline.height} H${dimensionX + 6}`}
            />
          </>
        )}

        {titleBlock && (
          <g className={styles.caption}>
            <text x={titleBlock.x} y={titleBlock.y} className={styles.practice}>{PRACTICE}</text>
            <text x={titleBlock.x} y={titleBlock.y + 34} className={styles.year}>{YEAR_FROM}</text>
          </g>
        )}

        {signOff && (
          <text
            x={signOff.x}
            y={signOff.y}
            textAnchor="end"
            className={`${styles.caption} ${styles.year}`}
          >
            {YEAR_TO}
          </text>
        )}

        {numeral && (
          <g transform={`translate(${numeral.left} ${numeral.top}) scale(${numeral.width / NUMERAL.width})`}>
            <path
              className={`${styles.stroke} ${styles.numeral}`}
              style={pen(210, '1.4s', '0.9s')}
              d={TWO_PATH}
            />
            <ellipse
              className={`${styles.stroke} ${styles.numeral}`}
              style={pen(230, '1.8s', '1s')}
              cx={ZERO.cx} cy={ZERO.cy} rx={ZERO.rx} ry={ZERO.ry}
            />
            <ellipse className={styles.hatch} cx={ZERO.cx} cy={ZERO.cy} rx={ZERO.rx} ry={ZERO.ry} />
          </g>
        )}
      </svg>

      <div ref={sparksRef} className={styles.sparks} />
    </div>,
    document.body,
  );
};
