type GoogleTagEventParams = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const GOOGLE_TAG_SCRIPT_ID = "google-tag-script";

const getMeasurementId = () => (import.meta.env.VITE_GA_MEASUREMENT_ID ?? "").trim();

const ensureDataLayer = () => {
  if (!window.dataLayer) {
    window.dataLayer = [];
  }
};

export const initGoogleTag = () => {
  const measurementId = getMeasurementId();
  if (!measurementId || typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  ensureDataLayer();

  if (!window.gtag) {
    window.gtag = (...args: unknown[]) => {
      window.dataLayer.push(args);
    };
    window.gtag("js", new Date());
    window.gtag("config", measurementId, { send_page_view: false });
  }

  if (document.getElementById(GOOGLE_TAG_SCRIPT_ID)) {
    return;
  }

  const script = document.createElement("script");
  script.id = GOOGLE_TAG_SCRIPT_ID;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);
};

export const trackGooglePageView = (pagePath: string) => {
  const measurementId = getMeasurementId();
  if (!measurementId || typeof window === "undefined") return;

  initGoogleTag();
  window.gtag?.("event", "page_view", {
    send_to: measurementId,
    page_path: pagePath,
    page_location: window.location.href,
    page_title: typeof document !== "undefined" ? document.title : "",
  });
};

export const trackGoogleEvent = (eventName: string, params?: GoogleTagEventParams) => {
  const measurementId = getMeasurementId();
  if (!measurementId || typeof window === "undefined") return;

  initGoogleTag();
  window.gtag?.("event", eventName, {
    send_to: measurementId,
    ...params,
  });
};
