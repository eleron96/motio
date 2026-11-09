import type { CDPSession, Page } from "@playwright/test";

// Touch gestures sent the way a phone sends them: through the Chrome DevTools
// protocol, as trusted touch input. Chrome then does everything a real touch
// screen makes it do — pointer and touch events, `touch-action`, native
// scrolling, and `pointercancel` when it decides the finger is scrolling.
// Synthetic events from page scripts skip all of that, which is why the unit
// tests in jsdom cannot tell whether a gesture survives in a browser.
// Playwright itself only offers a tap, hence this file. Chromium only.

export interface Point {
  x: number;
  y: number;
}

interface SwipeOptions {
  /** Intermediate moves between the two points. */
  steps?: number;
  /** Pause between moves, in ms. */
  stepMs?: number;
  /** Runs with the finger still down at the end point, before it lifts. */
  whileHeld?: () => Promise<void>;
}

const sessions = new WeakMap<Page, CDPSession>();

const sessionFor = async (page: Page): Promise<CDPSession> => {
  const existing = sessions.get(page);
  if (existing) return existing;
  const session = await page.context().newCDPSession(page);
  sessions.set(page, session);
  return session;
};

const sendTouch = async (
  page: Page,
  type: "touchStart" | "touchMove" | "touchEnd",
  points: Point[],
): Promise<void> => {
  const session = await sessionFor(page);
  await session.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: points.map(({ x, y }) => ({ x: Math.round(x), y: Math.round(y) })),
  });
};

const pause = (page: Page, ms: number): Promise<void> => page.waitForTimeout(ms);

/** One finger from `from` to `to`, at roughly finger speed. */
export const swipe = async (
  page: Page,
  from: Point,
  to: Point,
  { steps = 12, stepMs = 16, whileHeld }: SwipeOptions = {},
): Promise<void> => {
  await sendTouch(page, "touchStart", [from]);
  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps;
    await pause(page, stepMs);
    await sendTouch(page, "touchMove", [{
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
    }]);
  }
  if (whileHeld) await whileHeld();
  await sendTouch(page, "touchEnd", []);
};

export const tap = async (page: Page, point: Point): Promise<void> => {
  await sendTouch(page, "touchStart", [point]);
  await pause(page, 40);
  await sendTouch(page, "touchEnd", []);
};

export const doubleTap = async (page: Page, point: Point): Promise<void> => {
  await tap(page, point);
  await pause(page, 90);
  await tap(page, point);
};

export const longPress = async (page: Page, point: Point, holdMs = 900): Promise<void> => {
  await sendTouch(page, "touchStart", [point]);
  await pause(page, holdMs);
  await sendTouch(page, "touchEnd", []);
};
