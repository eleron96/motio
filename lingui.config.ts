import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";

export default defineConfig({
  sourceLocale: "en",
  locales: ["en", "ru"],
  catalogs: [
    {
      path: "src/locales/{locale}/messages",
      include: ["src"],
    },
  ],
  compileNamespace: "es",
  // Keep file origins but drop line numbers: otherwise every unrelated edit that
  // shifts a line churns the catalogs and trips the CI "catalogs up to date" gate.
  format: formatter({ lineNumbers: false }),
});
