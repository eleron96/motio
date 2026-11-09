import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Browser tests of the /demo sandbox: the real app in a real browser, with the
// data kept in the page (no backend). Mouse drags on the desktop timeline,
// touch gestures on a phone-sized screen. See e2e/README.md.
//
// Without E2E_BASE_URL the tests build nothing themselves: they serve the
// existing `dist/` with `vite preview` (CI builds it first). With E2E_BASE_URL
// they run against a deployed stand instead, e.g. the test server.
const externalBaseUrl = process.env.E2E_BASE_URL?.replace(/\/+$/, "");
const previewPort = 4173;
// Traces, screenshots and the HTML report go to a temp folder, never into the
// working tree (it is rsynced to the servers as is).
const outputRoot = process.env.E2E_OUTPUT_DIR ?? path.join(os.tmpdir(), "motio-e2e");
const isCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  outputDir: path.join(outputRoot, "results"),
  fullyParallel: true,
  forbidOnly: isCi,
  // One retry in CI, so a flaky gesture shows up as "flaky" in the report
  // instead of a red run; it still has to pass on the retry.
  retries: isCi ? 1 : 0,
  workers: isCi ? 2 : undefined,
  timeout: 45_000,
  expect: { timeout: 7_000 },
  reporter: isCi
    ? [["github"], ["list"], ["html", { open: "never", outputFolder: path.join(outputRoot, "report") }]]
    : [["list"]],
  use: {
    baseURL: externalBaseUrl ?? `http://127.0.0.1:${previewPort}`,
    // Selectors read the English interface.
    locale: "en-US",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Optional: run on an installed browser instead of Playwright's own
    // (E2E_BROWSER_CHANNEL=chrome), so a local run needs no browser download.
    channel: process.env.E2E_BROWSER_CHANNEL || undefined,
  },
  projects: [
    {
      name: "desktop",
      testMatch: /desktop\/.*\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "phone",
      testMatch: /phone\/.*\.spec\.ts$/,
      // Touch screen, mobile viewport and user agent; the gestures are sent as
      // real touch input through the Chrome DevTools protocol (e2e/support/touch.ts).
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: `npx vite preview --host 127.0.0.1 --port ${previewPort} --strictPort`,
        url: `http://127.0.0.1:${previewPort}/demo`,
        reuseExistingServer: false,
        timeout: 60_000,
      },
});
