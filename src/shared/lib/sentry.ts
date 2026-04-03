import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_GLITCHTIP_DSN;

export function initSentry() {
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    enabled: import.meta.env.PROD,
    sampleRate: 1.0,
    tracesSampleRate: 0.2,
    maxBreadcrumbs: 50,
  });
}

export { Sentry };
