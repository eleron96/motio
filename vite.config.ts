import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Emit source maps only when there is a Sentry token to upload them to: the
  // plugin uploads the maps for error symbolication and then deletes them from
  // the build output (filesToDeleteAfterUpload), so they never land in the served
  // nginx image. Every other build (Docker prod without a token, dev builds)
  // emits no maps at all, and "hidden" keeps the sourceMappingURL comment out of
  // the shipped JS. The nginx "map -> 404" rule stays as a belt-and-suspenders
  // backstop.
  const sentryEnabled = mode === "production" && Boolean(process.env.SENTRY_AUTH_TOKEN);

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [
      react({
        babel: {
          plugins: ["@lingui/babel-plugin-lingui-macro"],
        },
      }),
      mode === "development" && componentTagger(),
      sentryEnabled && sentryVitePlugin({
        org: process.env.SENTRY_ORG || "motio",
        project: process.env.SENTRY_PROJECT || "motio-frontend",
        authToken: process.env.SENTRY_AUTH_TOKEN,
        url: process.env.SENTRY_URL || "https://errors.motio.nikog.net",
        sourcemaps: {
          filesToDeleteAfterUpload: ["./dist/**/*.map"],
        },
      }),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      sourcemap: sentryEnabled ? "hidden" : false,
      // Vite ships an inline JS polyfill that emulates <link rel="modulepreload">
      // for browsers that don't support it natively. Every modern browser we
      // target (Chrome 89+, Safari 15+, Firefox 115+) ships native support, so
      // we drop the polyfill from index.html.
      modulePreload: { polyfill: false },
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-supabase': ['@supabase/supabase-js'],
            'vendor-date': ['date-fns'],
          },
        },
      },
    },
  };
});
