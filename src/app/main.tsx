import { initSentry } from "@/shared/lib/sentry";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { syncBrowserThemeFavicons } from "@/shared/lib/themeFavicon";
import { installPreloadErrorReload } from "@/shared/lib/preloadErrorReload";
import { isPushEnabled } from "@/shared/lib/featureFlags";
import { preloadLandingHero } from "@/features/marketing/lib/preloadLandingHero";
import "./index.css";

initSentry();
syncBrowserThemeFavicons();
installPreloadErrorReload();
preloadLandingHero();

// The timeline is the first screen of /app and /demo: start fetching its code
// right away instead of after the session check mounts the route (React.lazy
// in App.tsx gets the same module).
if (/^\/(app|demo)(\/|$)/.test(window.location.pathname) && !window.location.pathname.startsWith('/app/admin')) {
  void import('@/features/planner/pages/PlannerPage').catch(() => undefined);
}

// Register the push service worker up front (only when the feature is enabled)
// so it is active and ready when a user opts into notifications. It has no fetch
// handler, so it does not affect app loading or caching.
if (isPushEnabled() && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* insecure context or unsupported — the settings toggle stays hidden */
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
