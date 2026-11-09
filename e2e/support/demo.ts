import { test as base, expect, type Locator, type Page } from "@playwright/test";

/**
 * The Playwright `test`, plus one rule for every test: an uncaught error in
 * the page fails it, even when the screen still looks right.
 */
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, provide) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await provide(errors);
      expect(errors, "uncaught errors in the page").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Opens the sandbox and skips the getting-started tour every first visit shows. */
export const openDemo = async (page: Page, path = "/demo"): Promise<void> => {
  await page.goto(path);
  const skip = page.getByRole("button", { name: "Skip", exact: true });
  await skip.click();
  await expect(skip).toBeHidden();
};

/** The bar of a task on the timeline, found by its title. */
export const taskBar = (page: Page, title: string): Locator =>
  page.locator("[data-task-id]").filter({ has: page.getByText(title, { exact: true }) });

export interface DemoTaskDates {
  startDate: string;
  endDate: string;
}

/**
 * The task's dates as the sandbox saved them — what the app would have sent to
 * the server. The demo keeps its tables in sessionStorage.
 */
export const readDemoTaskDates = (page: Page, title: string): Promise<DemoTaskDates | null> =>
  page.evaluate((taskTitle) => {
    const raw = window.sessionStorage.getItem("motio.demo.state.v1");
    if (!raw) return null;
    const state = JSON.parse(raw) as { tables?: { tasks?: Array<Record<string, unknown>> } };
    const row = state.tables?.tasks?.find((task) => task.title === taskTitle);
    return row ? { startDate: String(row.start_date), endDate: String(row.end_date) } : null;
  }, title);

/** Reads the task's dates and fails right away if the sandbox has no such task. */
export const demoTaskDates = async (page: Page, title: string): Promise<DemoTaskDates> => {
  const dates = await readDemoTaskDates(page, title);
  if (!dates) throw new Error(`The demo has no task titled "${title}"`);
  return dates;
};

/** `YYYY-MM-DD` moved by whole days. */
export const shiftDate = (date: string, days: number): string => {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
};

/** Whole days from one `YYYY-MM-DD` to another. */
export const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Width of one day column on the timeline, in CSS pixels. */
export const timelineDayWidth = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const [first, second] = Array.from(document.querySelectorAll("[data-day-key]"));
    if (!first || !second) throw new Error("The timeline shows no day columns");
    return second.getBoundingClientRect().left - first.getBoundingClientRect().left;
  });

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const boxOf = async (locator: Locator): Promise<Box> => {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Not on screen: ${locator.toString()}`);
  return box;
};

/**
 * The element's box once it stops moving — sheets and screens slide in, and a
 * gesture that starts mid-animation starts from the wrong place.
 */
export const settledBoxOf = async (locator: Locator): Promise<Box> => {
  let previous = await boxOf(locator);
  await expect
    .poll(async () => {
      const current = await boxOf(locator);
      const still = current.x === previous.x && current.y === previous.y;
      previous = current;
      return still;
    }, { intervals: [100] })
    .toBe(true);
  return previous;
};

/** Centre of the part of the element that is inside the viewport. */
export const visibleCenterOf = async (page: Page, locator: Locator): Promise<{ x: number; y: number }> => {
  const box = await boxOf(locator);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("The page has no fixed viewport");
  const left = Math.max(box.x, 0);
  const right = Math.min(box.x + box.width, viewport.width);
  const top = Math.max(box.y, 0);
  const bottom = Math.min(box.y + box.height, viewport.height);
  if (right <= left || bottom <= top) throw new Error(`Outside the viewport: ${locator.toString()}`);
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
};
