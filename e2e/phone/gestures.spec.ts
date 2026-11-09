import {
  boxOf,
  demoTaskDates,
  expect,
  openDemo,
  settledBoxOf,
  taskBar,
  test,
  visibleCenterOf,
} from "../support/demo";
import { doubleTap, longPress, swipe } from "../support/touch";

// Touch gestures on a phone-sized screen, sent as real touch input. What these
// catch and jsdom cannot: the browser taking a drag for a scroll halfway
// (`pointercancel`), `touch-action` on the wrong element, Radix's long-press
// timers, and native scrolling of the timeline under a finger.

// One person, no repeat, starts today (src/features/demo/lib/demoSeed.ts).
const TASK = "Fix: experiment bucket leaks across tabs";

test.beforeEach(async ({ page }) => {
  await openDemo(page);
});

test("swiping along the header walks the sections, a short swipe does not", async ({ page }) => {
  const header = await boxOf(page.getByTestId("mobile-pill-nav"));
  const y = header.y + header.height / 2;
  const right = { x: header.x + header.width * 0.85, y };
  const left = { x: header.x + header.width * 0.25, y };

  await swipe(page, right, { x: right.x - 30, y });
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/\/demo$/);

  await swipe(page, right, left);
  await expect(page).toHaveURL(/\/demo\/dashboard$/);

  await swipe(page, left, right);
  await expect(page).toHaveURL(/\/demo$/);
});

test("the View sheet follows the finger down and closes only past the threshold", async ({ page }) => {
  await page.getByRole("button", { name: "View" }).tap();
  const sheet = page.getByRole("dialog", { name: "View" });
  await expect(sheet).toBeVisible();
  const box = await settledBoxOf(sheet);
  // The grab handle and the title, above the option cards.
  const grab = { x: box.x + box.width / 2, y: box.y + 20 };

  await swipe(page, grab, { x: grab.x, y: grab.y + 50 }, {
    whileHeld: async () => {
      // The sheet moves with the finger: the browser did not take the drag for a scroll.
      expect((await boxOf(sheet)).y).toBeGreaterThan(box.y + 25);
    },
  });
  await expect(sheet).toBeVisible();
  await expect.poll(async () => Math.round((await boxOf(sheet)).y)).toBe(Math.round(box.y));

  await swipe(page, grab, { x: grab.x, y: grab.y + 200 });
  await expect(sheet).toBeHidden();
});

test("a full-screen panel closes with a swipe to the right, a vertical swipe leaves it open", async ({ page }) => {
  await page.getByRole("button", { name: "Expand filters" }).tap();
  const screen = page.getByRole("dialog", { name: "Filters" });
  await expect(screen).toBeVisible();
  const box = await settledBoxOf(screen);
  const middleX = box.x + box.width / 2;

  await swipe(page, { x: middleX, y: box.y + box.height * 0.7 }, { x: middleX, y: box.y + box.height * 0.35 });
  await page.waitForTimeout(300);
  await expect(screen).toBeVisible();

  const y = box.y + box.height / 2;
  await swipe(page, { x: box.x + 40, y }, { x: box.x + 40 + 220, y }, { steps: 16 });
  await expect(screen).toBeHidden();
});

test("a sideways swipe across a task bar scrolls the timeline and leaves the task alone", async ({ page }) => {
  const bar = taskBar(page, TASK);
  const scroller = page.getByTestId("timeline-scroll-container");
  await bar.scrollIntoViewIfNeeded();
  const before = await demoTaskDates(page, TASK);
  const scrollBefore = await scroller.evaluate((element) => element.scrollLeft);
  const start = await visibleCenterOf(page, bar);

  await swipe(page, start, { x: start.x - 180, y: start.y }, { steps: 16 });

  await expect.poll(() => scroller.evaluate((element) => element.scrollLeft)).toBeGreaterThan(scrollBefore + 100);
  await page.waitForTimeout(400);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("menu")).toHaveCount(0);
  expect(await demoTaskDates(page, TASK)).toEqual(before);
});

test("double-tapping a task bar opens the task", async ({ page }) => {
  const bar = taskBar(page, TASK);
  await bar.scrollIntoViewIfNeeded();

  await doubleTap(page, await visibleCenterOf(page, bar));

  const card = page.getByRole("dialog");
  await expect(card).toBeVisible();
  await expect(card.getByRole("textbox").first()).toHaveValue(TASK);
});

test("holding a task bar opens its quick actions", async ({ page }) => {
  const bar = taskBar(page, TASK);
  await bar.scrollIntoViewIfNeeded();

  await longPress(page, await visibleCenterOf(page, bar));

  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
