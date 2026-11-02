/**
 * Where the tour points on the timeline.
 *
 * The timeline's rows are as wide as the whole loaded date range — thousands of
 * pixels, most of them scrolled out of sight. Handed such a row, driver.js
 * scrolls it to its middle (`scrollIntoView({ inline: 'center' })`), carrying
 * the timeline months away from today, and frames a box mostly off screen. It
 * did the same with the whole grid as an anchor: the grid ran past the bottom
 * of the window, so the page jumped up under the header on that step.
 *
 * Task bars are no better: most run past the edge of the screen. So rows and
 * bars are spotlit through a stand-in: a fixed, invisible box laid over the
 * part the person actually sees. It sits inside the viewport, so
 * driver.js never scrolls anything, and the frame matches what is on screen.
 * The tour runs with the page's interaction switched off, so the box blocking
 * clicks costs nothing.
 */

const TIMELINE_SELECTOR = '[data-tour="timeline-grid"]';
const STICKY_CORNER_SELECTOR = '[data-timeline-sidebar="header"]';
const SPOTLIGHT_ID = 'motio-tour-spotlight';
/** A sliver thinner than this is not worth pointing at. */
const MIN_VISIBLE_PX = 8;
/** A bar showing less than this hardly tells what dragging it would do. */
const MIN_BAR_WIDTH_PX = 60;

type Box = { left: number; top: number; right: number; bottom: number };

const timelineElement = () => document.querySelector<HTMLElement>(TIMELINE_SELECTOR);

/** The part of the timeline scroller inside the window, without its scrollbars. */
const visibleTimelineBox = (timeline: HTMLElement): Box => {
  const rect = timeline.getBoundingClientRect();
  return {
    left: Math.max(rect.left, 0),
    top: Math.max(rect.top, 0),
    right: Math.min(rect.left + timeline.clientWidth, window.innerWidth),
    bottom: Math.min(rect.top + timeline.clientHeight, window.innerHeight),
  };
};

const spotlightElement = (): HTMLElement => {
  const existing = document.getElementById(SPOTLIGHT_ID);
  if (existing) return existing;
  const spotlight = document.createElement('div');
  spotlight.id = SPOTLIGHT_ID;
  spotlight.setAttribute('aria-hidden', 'true');
  spotlight.style.position = 'fixed';
  spotlight.style.pointerEvents = 'none';
  document.body.appendChild(spotlight);
  return spotlight;
};

const placeSpotlight = (box: Box): HTMLElement => {
  const spotlight = spotlightElement();
  spotlight.style.left = `${box.left}px`;
  spotlight.style.top = `${box.top}px`;
  spotlight.style.width = `${box.right - box.left}px`;
  spotlight.style.height = `${box.bottom - box.top}px`;
  return spotlight;
};

/**
 * A stand-in for the visible stretch of the timeline row matched by
 * `selector`: the full width of the timeline on screen, the height of the row.
 * Nothing to point at — no timeline, no row, the row scrolled away — returns
 * undefined, and driver.js shows the step's text in the middle of the screen.
 */
export const spotlightTimelineRow = (selector: string): HTMLElement | undefined => {
  const timeline = timelineElement();
  const row = document.querySelector(selector);
  if (!timeline || !row) return undefined;

  const view = visibleTimelineBox(timeline);
  const rowRect = row.getBoundingClientRect();
  const top = Math.max(rowRect.top, view.top);
  const bottom = Math.min(rowRect.bottom, view.bottom);
  if (bottom - top < MIN_VISIBLE_PX || view.right - view.left < MIN_VISIBLE_PX) return undefined;

  return placeSpotlight({ left: view.left, top, right: view.right, bottom });
};

/**
 * A stand-in for a task bar the person can see: its full height on screen,
 * not under the sticky names column or the date header. Most bars run past
 * the edge of the screen — a task is often longer than the days in view — so
 * the stand-in covers the visible part. A bar whose start (and title) is in
 * view wins, the topmost first; none on screen returns undefined.
 */
export const findVisibleTaskBar = (): HTMLElement | undefined => {
  const timeline = timelineElement();
  if (!timeline) return undefined;

  const view = visibleTimelineBox(timeline);
  const corner = timeline.querySelector(STICKY_CORNER_SELECTOR)?.getBoundingClientRect();
  const content: Box = {
    left: corner ? Math.max(view.left, corner.right) : view.left,
    top: corner ? Math.max(view.top, corner.bottom) : view.top,
    right: view.right,
    bottom: view.bottom,
  };

  const candidates = Array.from(timeline.querySelectorAll<HTMLElement>('.task-bar[data-task-id]'))
    .map((bar) => {
      const rect = bar.getBoundingClientRect();
      const visible: Box = {
        left: Math.max(rect.left, content.left),
        top: rect.top,
        right: Math.min(rect.right, content.right),
        bottom: rect.bottom,
      };
      return { rect, visible };
    })
    .filter(({ rect, visible }) => (
      rect.top >= content.top
      && rect.bottom <= content.bottom
      && visible.right - visible.left >= MIN_BAR_WIDTH_PX
    ))
    .sort((a, b) => {
      const aStartsInView = a.rect.left >= content.left ? 0 : 1;
      const bStartsInView = b.rect.left >= content.left ? 0 : 1;
      return aStartsInView - bStartsInView || a.rect.top - b.rect.top || a.rect.left - b.rect.left;
    });

  const best = candidates[0];
  return best ? placeSpotlight(best.visible) : undefined;
};

/**
 * A stand-in around several header controls at once — the workspace gear and
 * the section menu sit side by side, and the admin's last tip is about both.
 * Whichever of them is missing is left out; none returns undefined.
 */
export const spotlightAround = (selectors: string[]): HTMLElement | undefined => {
  const rects = selectors
    .map((selector) => document.querySelector(selector)?.getBoundingClientRect())
    .filter((rect): rect is DOMRect => Boolean(rect && rect.width > 0 && rect.height > 0));
  if (rects.length === 0) return undefined;

  return placeSpotlight({
    left: Math.max(Math.min(...rects.map((rect) => rect.left)), 0),
    top: Math.max(Math.min(...rects.map((rect) => rect.top)), 0),
    right: Math.min(Math.max(...rects.map((rect) => rect.right)), window.innerWidth),
    bottom: Math.min(Math.max(...rects.map((rect) => rect.bottom)), window.innerHeight),
  });
};

/** Takes the stand-in away once the tour is over. */
export const removeTourSpotlight = () => {
  document.getElementById(SPOTLIGHT_ID)?.remove();
};
