import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { syncBrowserThemeFavicons } from "@/shared/lib/themeFavicon";
import "./index.css";

syncBrowserThemeFavicons();

createRoot(document.getElementById("root")!).render(<App />);
