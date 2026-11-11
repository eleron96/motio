# Browser tests

The app in a real browser, driven by [Playwright](https://playwright.dev/). They
run against the `/demo` sandbox, which keeps its data in the page, so no
backend is needed. CI runs them in the `e2e` job on every push.

The unit tests in `src/test/` render components in jsdom: nothing there has a
size, nothing scrolls, and events come from scripts. These tests cover what
only a browser can show:

| Project | Screen | Covers |
| --- | --- | --- |
| `desktop` | 1440×900, mouse | `desktop/timeline-drag.spec.ts`: moving a task bar by whole days and undoing it with Ctrl/Cmd+Z; stretching either end; holding a dragged bar at the edge so the timeline scrolls under it; a click without moving opens the task |
| `phone` | Pixel 7, touch | `phone/gestures.spec.ts`: swiping along the header between sections; pulling the View sheet down to close it; swiping a full-screen panel away to the right; a sideways swipe over a task bar scrolls the timeline and leaves the task alone; double tap opens a task; holding it opens the quick actions |
| both | as above | `desktop/a11y.spec.ts`, `phone/a11y.spec.ts`: axe (WCAG 2.1 A and AA) on the timeline, the open task card, the dashboard, projects and the team page, and on the phone timeline. A rule a screen did not break before fails the test. |

Touch is sent as real touch input through the Chrome DevTools protocol
(`support/touch.ts`), so Chrome applies `touch-action`, scrolls natively and
fires `pointercancel` when it takes a drag for a scroll, the same as on a
phone. That is why the phone project runs on Chromium only. It is still an
emulation, though: iOS Safari is not covered, so gestures still need a check on
a real iPhone.

**Not covered.** Two people editing at once (live sync between clients) needs
the real backend with Realtime and sign-in. The sandbox has neither. The
database side of it (conflicting saves, deletes reaching teammates) is covered
by `tests/integration/`; the rest is still checked by hand on a test server.

## Running

The tests are not tied to a server of their own: they open whatever
`E2E_BASE_URL` points at.

```bash
# against a deployed Motio, e.g. your test server
E2E_BASE_URL=https://motio-test.example.com npm run test:e2e

# against your own build: Playwright serves dist/ with `vite preview`.
# /demo needs no backend, but the app needs these two values to start.
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=placeholder npm run build
npm run test:e2e
```

Playwright's browser is installed once with `npx playwright install chromium`.
To use an installed Chrome instead, add `E2E_BROWSER_CHANNEL=chrome`.

Useful flags: `--project=phone`, `--headed`, `--repeat-each=5` (to catch a
flaky gesture), `--ui`. Traces, screenshots and the HTML report go to
`$TMPDIR/motio-e2e` (`E2E_OUTPUT_DIR` overrides it), never into the working
tree. On a red CI run they are attached to the run as `playwright-report`; open
a trace with `npx playwright show-trace <trace.zip>`.

## Writing a test

- Start with `openDemo(page)` from `support/demo.ts`: it opens the sandbox and
  skips the getting-started tour every new visit shows.
- Import `test` and `expect` from `support/demo.ts`, not from
  `@playwright/test`: that `test` fails on any uncaught error in the page.
- Find things the way a person does: role and name (`getByRole`), task bars by
  title (`taskBar`). The interface language is English (`locale` in
  `playwright.config.ts`).
- Check the result twice: on screen (where the bar is) and in the data
  (`readDemoTaskDates`: what the app would have sent to the server).
- Tasks come from `src/features/demo/lib/demoSeed.ts`, with dates relative to
  today. Changing a task a test uses there changes the test.
- Accessibility: `expectNoNewA11yViolations(page, testInfo, "<screen>")` from
  `support/a11y.ts` runs axe on what the page shows. What each screen already
  breaks is listed by rule in `support/a11yBaseline.ts`; add a screen there
  first. A rule outside the list fails the test and names the element. A listed
  rule that axe no longer reports only leaves a note on the test: remove it
  from the list then, so the list shrinks. Do not add a rule to the list to get
  a new screen through — fix the markup. axe decides only what a machine can
  (contrast, names, roles): keyboard paths and screen-reader wording still need
  a person.
- Before relying on a new test, make sure it can fail: break the behaviour on
  purpose (an injected style or listener) and watch it go red.
