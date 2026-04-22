import { initSentry } from "@/shared/lib/sentry";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { syncBrowserThemeFavicons } from "@/shared/lib/themeFavicon";
import { installPreloadErrorReload } from "@/shared/lib/preloadErrorReload";
import "./index.css";

initSentry();
syncBrowserThemeFavicons();
installPreloadErrorReload();

createRoot(document.getElementById("root")!).render(<App />);
