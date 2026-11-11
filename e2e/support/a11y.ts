import AxeBuilder from "@axe-core/playwright";
import type { Page, TestInfo } from "@playwright/test";
import { expect } from "./demo";
import { A11Y_BASELINE, type A11yScreen } from "./a11yBaseline";

// WCAG 2.1 levels A and AA: what axe can decide on its own. It finds roughly a
// third of real problems; keyboard paths and screen-reader wording still need
// a person.
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

interface A11yFinding {
  rule: string;
  impact: string | null;
  help: string;
  elements: number;
  example: string;
}

/**
 * Waits until the page stops changing: sections load their code lazily and
 * panels slide in, and a scan taken halfway reports a different page each time.
 */
const settle = async (page: Page): Promise<void> => {
  await page.waitForLoadState("networkidle");
  const size = () => page.evaluate(() => document.querySelectorAll("*").length);
  let previous = await size();
  let calmReads = 0;
  await expect
    .poll(async () => {
      const current = await size();
      calmReads = current === previous ? calmReads + 1 : 0;
      previous = current;
      return calmReads;
    }, { intervals: [250], timeout: 15_000 })
    .toBeGreaterThanOrEqual(3);
};

const scan = async (page: Page): Promise<A11yFinding[]> => {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  return results.violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact ?? null,
    help: violation.help,
    elements: violation.nodes.length,
    example: violation.nodes[0]?.target.join(" ") ?? "",
  }));
};

/**
 * Runs axe on what the page shows now and fails on any rule the screen did not
 * break before (`a11yBaseline.ts`). The full findings are attached to the test.
 */
export const expectNoNewA11yViolations = async (
  page: Page,
  testInfo: TestInfo,
  screen: A11yScreen,
): Promise<void> => {
  await settle(page);
  const findings = await scan(page);
  await testInfo.attach(`a11y ${screen}.json`, {
    body: JSON.stringify(findings, null, 2),
    contentType: "application/json",
  });

  const known: readonly string[] = A11Y_BASELINE[screen];
  const fixed = known.filter((rule) => !findings.some((finding) => finding.rule === rule));
  if (fixed.length > 0) {
    testInfo.annotations.push({
      type: "a11y baseline",
      description: `"${screen}" no longer breaks: ${fixed.join(", ")}. Remove from e2e/support/a11yBaseline.ts.`,
    });
  }

  const fresh = findings
    .filter((finding) => !known.includes(finding.rule))
    .map((finding) =>
      `${finding.rule} (${finding.impact ?? "unrated"}): ${finding.help} — ${finding.elements} element(s), e.g. ${finding.example}`);
  expect(fresh, `new accessibility violations on "${screen}"`).toEqual([]);
};
