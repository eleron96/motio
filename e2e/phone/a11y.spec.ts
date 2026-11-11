import { expectNoNewA11yViolations } from "../support/a11y";
import { expect, openDemo, taskBar, test } from "../support/demo";

// The phone layer is its own markup over the same screens: checked separately.

test("the timeline on a phone breaks no new accessibility rule", async ({ page }, testInfo) => {
  await openDemo(page);
  await expect(taskBar(page, "Fix: experiment bucket leaks across tabs").first()).toBeAttached();

  await expectNoNewA11yViolations(page, testInfo, "phone timeline");
});
