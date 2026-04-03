import { initSentry } from "@/shared/lib/sentry";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { syncBrowserThemeFavicons } from "@/shared/lib/themeFavicon";
import "./index.css";

initSentry();
syncBrowserThemeFavicons();

createRoot(document.getElementById("root")!).render(<App />);
