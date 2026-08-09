import { useEffect, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import styles from './AnniversaryBlueprintBrief.module.css';
import { useBriefCardBounds, viewportBox } from '../useBriefCardBounds';
import { sheetLayout, CARD_MARGIN } from '../lib/briefLayout';

const random = (min: number, max: number) => Math.random() * (max - min) + min;

const prefersReducedMotion = () =>
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * One pass of the drawing: pen down, hold, fade, start over. Shared by the CSS
 * (as `--cycle`) and by the sparks, which fire once per lap.
 */
const CYCLE_MS = 9000;
/** Into the cycle, right after the numeral is drawn. */
const SPARKS_AT_MS = 3100;

/** Stroke length as a CSS custom property, which React's types do not model. */
const pen = (length: number): CSSProperties => ({ '--len': String(length) } as CSSProperties);

/** The sheet's title block: who, and the span the anniversary covers. */
const PRACTICE = 'СПИЧ';
const YEAR_FROM = '2006';
const YEAR_TO = '2026';

/** "20" drawn in its own coordinates, then placed wherever there is room. */
const NUMERAL = { width: 120, height: 92 } as const;
const TWO_PATH = 'M4 26 a24 24 0 0 1 48 0 c0 24 -48 34 -48 62 h50';
const ZERO = { cx: 88, cy: 48, rx: 30, ry: 42 } as const;

/**
 * Letter-spacing adds a gap after the last letter too, so centred tracked text
 * sits visibly left of the axis. Nudging by half the tracking puts it back.
 */
const PRACTICE_TRACKING = 0.42;
const YEAR_TRACKING = 0.28;
const centred = (x: number, fontSize: number, tracking: number) => x + (fontSize * tracking) / 2;

const SPARK_CONFIG = {
  count: 24,
  minDistance: 60,
  maxDistance: 170,
} as const;

/**
 * Anniversary easter egg: the brief is drawn on, the way a sheet is. The card
 * itself becomes the part on the drawing — an outline is traced around it and
 * dimension lines go down along its edges. The practice and its founding year
 * stand in the left margin; a gold "20" is drawn stroke by stroke on the other
 * side with the anniversary year beneath it, hatched and sparked.
 *
 * The whole thing loops for as long as the brief is open, so it is not missed
 * by someone who looked away.
 *
 * Everything is laid out *around* the card rather than behind it: the card is
 * measured at runtime (see useBriefCardBounds), so nothing important ends up
 * hidden under the report. If the card leaves no room — a small phone — the
 * numeral is skipped and only the outline is drawn.
 *
 * A body-level portal below the card (z-index lives in the CSS module). Under
 * reduced motion the drawing simply stands still, finished.
 */
export const AnniversaryBlueprintBrief = () => {
  const sparksRef = useRef<HTMLDivElement | null>(null);
  const card = useBriefCardBounds();
  const viewport = viewportBox();

  // Undefined means the card has not been measured yet: drawing now would put
  // the numeral under it for a frame and then jump it aside.
  const measured = card !== undefined;
  // One layout pass for the whole sheet: the numeral, the year under it and the
  // title block are sized and placed against this screen together, so nothing
  // lands half under the card or off the edge.
  const layout = measured ? sheetLayout(viewport, card ?? null) : null;
  const numeral = layout?.numeral ?? null;
  const titleBlock = layout?.title ?? null;
  const signOff = layout?.numeralYear ?? null;

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

    // In step with the linework: the first scatter lands just after the numeral
    // is drawn, and every lap from then on hits the same point in the cycle.
    let lap = 0;
    const start = window.setTimeout(() => {
      timeouts.delete(start);
      scatter();
      lap = window.setInterval(scatter, CYCLE_MS);
    }, SPARKS_AT_MS);
    timeouts.add(start);

    return () => {
      window.clearInterval(lap);
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
    <div
      className={styles.overlay}
      style={{ '--cycle': `${CYCLE_MS}ms` } as CSSProperties}
      aria-hidden="true"
    >
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
              className={`${styles.stroke} ${styles.axis} ${styles.drawAxisX}`}
              style={pen(viewport.width)}
              x1="0" y1={card!.top + card!.height / 2}
              x2={viewport.width} y2={card!.top + card!.height / 2}
            />
            {/* Dropped on a phone: with the card full width, a line down the
                middle of the screen reads as a stray mark, not a construction
                axis. */}
            {!layout?.stacked && (
              <line
                className={`${styles.stroke} ${styles.axis} ${styles.drawAxisY}`}
                style={pen(viewport.height)}
                x1={card!.left + card!.width / 2} y1="0"
                x2={card!.left + card!.width / 2} y2={viewport.height}
              />
            )}

            {/* The card, outlined the way a part is. */}
            <rect
              className={`${styles.stroke} ${styles.outline} ${styles.drawOutline}`}
              style={pen(outlineLength)}
              x={outline.left} y={outline.top}
              width={outline.width} height={outline.height}
              rx="14"
            />

            {/* Dimension lines along its width and height, ticks included. */}
            <path
              className={`${styles.stroke} ${styles.dimension} ${styles.drawDimX}`}
              style={pen(outline.width + 24)}
              d={`M${outline.left} ${dimensionY} H${outline.left + outline.width}`
                + ` M${outline.left} ${dimensionY - 6} V${dimensionY + 6}`
                + ` M${outline.left + outline.width} ${dimensionY - 6} V${dimensionY + 6}`}
            />
            <path
              className={`${styles.stroke} ${styles.dimension} ${styles.drawDimY}`}
              style={pen(outline.height + 24)}
              d={`M${dimensionX} ${outline.top} V${outline.top + outline.height}`
                + ` M${dimensionX - 6} ${outline.top} H${dimensionX + 6}`
                + ` M${dimensionX - 6} ${outline.top + outline.height} H${dimensionX + 6}`}
            />
          </>
        )}

        {titleBlock && layout && (
          <g className={styles.caption}>
            <text
              x={titleBlock.align === 'middle'
                ? centred(titleBlock.x, layout.type.practice, PRACTICE_TRACKING)
                : titleBlock.x}
              y={titleBlock.y}
              textAnchor={titleBlock.align}
              className={styles.practice}
              style={{ fontSize: layout.type.practice }}
            >
              {PRACTICE}
            </text>
            <text
              x={titleBlock.align === 'middle'
                ? centred(titleBlock.x, layout.type.year, YEAR_TRACKING)
                : titleBlock.x}
              y={titleBlock.y + layout.type.practice * 1.15}
              textAnchor={titleBlock.align}
              className={styles.year}
              style={{ fontSize: layout.type.year }}
            >
              {YEAR_FROM}
            </text>
          </g>
        )}

        {numeral && (
          <g transform={`translate(${numeral.left} ${numeral.top}) scale(${numeral.width / NUMERAL.width})`}>
            <path
              className={`${styles.stroke} ${styles.numeral} ${styles.drawTwo}`}
              style={pen(210)}
              d={TWO_PATH}
            />
            <ellipse
              className={`${styles.stroke} ${styles.numeral} ${styles.drawZero}`}
              style={pen(230)}
              cx={ZERO.cx} cy={ZERO.cy} rx={ZERO.rx} ry={ZERO.ry}
            />
            <ellipse className={styles.hatch} cx={ZERO.cx} cy={ZERO.cy} rx={ZERO.rx} ry={ZERO.ry} />
          </g>
        )}

        {signOff && (
          <text
            x={centred(signOff.x, signOff.size, YEAR_TRACKING)}
            y={signOff.y}
            textAnchor="middle"
            className={`${styles.caption} ${styles.year}`}
            style={{ fontSize: signOff.size }}
          >
            {YEAR_TO}
          </text>
        )}
      </svg>

      <div ref={sparksRef} className={styles.sparks} />
    </div>,
    document.body,
  );
};
