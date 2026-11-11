import { expectNoNewA11yViolations } from "../support/a11y";
import { expect, openDemo, taskBar, test } from "../support/demo";

// axe on the main screens of the sandbox. The linter (jsx-a11y) reads the
// markup we wrote; this reads the page a person gets: computed colours, the
// markup of libraries, what is really on screen.

// One person, no repeat, four days from today on (src/features/demo/lib/demoSeed.ts).
const TASK = "Fix: experiment bucket leaks across tabs";

test("the timeline breaks no new accessibility rule", async ({ page }, testInfo) => {
  await openDemo(page);
  await expect(taskBar(page, TASK)).toBeVisible();

  await expectNoNewA11yViolations(page, testInfo, "desktop timeline");
});

test("the open task card breaks no new accessibility rule", async ({ page }, testInfo) => {
  await openDemo(page);
  await taskBar(page, TASK).scrollIntoViewIfNeeded();
  await taskBar(page, TASK).click();
  await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible();

  await expectNoNewA11yViolations(page, testInfo, "desktop task card");
});

for (const [path, screen, heading] of [
  ["/demo/dashboard", "desktop dashboard", "Dashboard"],
  ["/demo/projects", "desktop projects", "Projects"],
  ["/demo/members", "desktop team", "Team"],
] as const) {
  test(`${heading.toLowerCase()} breaks no new accessibility rule`, async ({ page }, testInfo) => {
    // The tour belongs to the timeline: skip it there, then open the section.
    await openDemo(page);
    await page.goto(path);

    await expectNoNewA11yViolations(page, testInfo, screen);
  });
}
