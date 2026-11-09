import type { Page } from "@playwright/test";
import {
  boxOf,
  daysBetween,
  demoTaskDates,
  expect,
  openDemo,
  readDemoTaskDates,
  shiftDate,
  taskBar,
  test,
  timelineDayWidth,
} from "../support/demo";

// Dragging on the timeline with a real mouse, in a real layout. The unit tests
// cover the arithmetic in jsdom, where nothing has a size and nothing scrolls.

// One person, no repeat, four days from today on (src/features/demo/lib/demoSeed.ts):
// both ends are on screen, clear of the row sidebar that covers the left side.
const TASK = "Fix: experiment bucket leaks across tabs";

/** Press, move in small steps like a hand would, release. */
const drag = async (page: Page, from: { x: number; y: number }, to: { x: number; y: number }) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
};

test.beforeEach(async ({ page }) => {
  await openDemo(page);
  await taskBar(page, TASK).scrollIntoViewIfNeeded();
});

test("dragging a bar moves the task by whole days, and Ctrl/Cmd+Z puts it back", async ({ page }) => {
  const bar = taskBar(page, TASK);
  const before = await demoTaskDates(page, TASK);
  const dayWidth = await timelineDayWidth(page);
  const box = await boxOf(bar);
  const grab = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  await drag(page, grab, { x: grab.x + dayWidth * 2, y: grab.y });

  await expect.poll(() => readDemoTaskDates(page, TASK)).toEqual({
    startDate: shiftDate(before.startDate, 2),
    endDate: shiftDate(before.endDate, 2),
  });
  await expect.poll(async () => Math.round((await boxOf(bar)).x - box.x)).toBe(Math.round(dayWidth * 2));
  // A drag is not a click: the task card stays closed.
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+z");

  await expect.poll(() => readDemoTaskDates(page, TASK)).toEqual(before);
  await expect.poll(async () => Math.round((await boxOf(bar)).x - box.x)).toBe(0);
});

test("pulling either end of a bar changes only that date", async ({ page }) => {
  const bar = taskBar(page, TASK);
  const before = await demoTaskDates(page, TASK);
  const dayWidth = await timelineDayWidth(page);
  const box = await boxOf(bar);
  const middle = box.y + box.height / 2;

  // The handles are 8 px strips at the ends of the bar.
  await drag(page, { x: box.x + box.width - 3, y: middle }, { x: box.x + box.width - 3 + dayWidth, y: middle });

  await expect.poll(() => readDemoTaskDates(page, TASK)).toEqual({
    startDate: before.startDate,
    endDate: shiftDate(before.endDate, 1),
  });
  await expect.poll(async () => Math.round((await boxOf(bar)).width - box.width)).toBe(Math.round(dayWidth));

  // A stretched bar may move to another lane of its row: take it from where it is now.
  const stretched = await boxOf(bar);
  const stretchedMiddle = stretched.y + stretched.height / 2;
  await drag(
    page,
    { x: stretched.x + 3, y: stretchedMiddle },
    { x: stretched.x + 3 - dayWidth, y: stretchedMiddle },
  );

  await expect.poll(() => readDemoTaskDates(page, TASK)).toEqual({
    startDate: shiftDate(before.startDate, -1),
    endDate: shiftDate(before.endDate, 1),
  });
  await expect.poll(async () => Math.round((await boxOf(bar)).x - box.x)).toBe(-Math.round(dayWidth));
});

test("holding a dragged bar at the edge scrolls the timeline, and the task lands where it was dropped", async ({ page }) => {
  const bar = taskBar(page, TASK);
  const scroller = page.getByTestId("timeline-scroll-container");
  const before = await demoTaskDates(page, TASK);
  const dayWidth = await timelineDayWidth(page);
  const box = await boxOf(bar);
  const area = await boxOf(scroller);
  const scrollBefore = await scroller.evaluate((element) => element.scrollLeft);
  const grab = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  // Inside the 56 px strip at the right edge, where the timeline scrolls by itself.
  const edge = { x: area.x + area.width - 24, y: grab.y };

  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(edge.x, edge.y, { steps: 20 });
  await expect(page.getByTestId("timeline-drag-edge-right")).toHaveAttribute("data-active", "true");
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(scrollBefore + dayWidth * 4);
  await page.mouse.up();

  // The bar travelled the mouse distance plus everything that scrolled under it.
  const scrolled = (await scroller.evaluate((element) => element.scrollLeft)) - scrollBefore;
  const expectedDays = Math.round((edge.x - grab.x + scrolled) / dayWidth);
  await expect
    .poll(async () => {
      const after = await readDemoTaskDates(page, TASK);
      return after ? daysBetween(before.startDate, after.startDate) : null;
    })
    .toBe(expectedDays);
  const after = await demoTaskDates(page, TASK);
  expect(daysBetween(after.startDate, after.endDate)).toBe(daysBetween(before.startDate, before.endDate));
  // Dropped under the cursor, not somewhere off screen.
  const dropped = await boxOf(bar);
  expect(dropped.x).toBeLessThan(edge.x);
  expect(dropped.x + dropped.width).toBeGreaterThan(edge.x - dayWidth);
  await expect(page.getByTestId("timeline-drag-edge-right")).not.toHaveAttribute("data-active", "true");
});

test("a click without moving opens the task card", async ({ page }) => {
  const bar = taskBar(page, TASK);
  const before = await demoTaskDates(page, TASK);

  await bar.click();

  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("textbox").first()).toHaveValue(TASK);
  expect(await demoTaskDates(page, TASK)).toEqual(before);
});
