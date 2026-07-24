import { initSentry } from "@/shared/lib/sentry";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { syncBrowserThemeFavicons } from "@/shared/lib/themeFavicon";
import { installPreloadErrorReload } from "@/shared/lib/preloadErrorReload";
import { isPushEnabled } from "@/shared/lib/featureFlags";
import "./index.css";

initSentry();
syncBrowserThemeFavicons();
installPreloadErrorReload();

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
