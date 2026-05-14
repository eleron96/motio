import { useEffect } from "react";
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from "react-router-dom";
import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_GLITCHTIP_DSN;

// Errors we never want in Glitchtip:
//   - Recoverable Vite chunk-load failures: a fresh deploy rotates the
//     bundle, an old tab requests a hash that no longer exists; we already
//     auto-reload, the report is noise.
//   - DOM mutation races caused by browser auto-translation (Google Translate
//     / Yandex Browser) — the page is wrapped in notranslate but extensions
//     can still mutate the tree.
export const IGNORED_ERROR_PATTERNS: RegExp[] = [
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
  /ChunkLoadError/i,
  /Failed to execute 'removeChild' on 'Node'/i,
  /Failed to execute 'insertBefore' on 'Node'/i,
  /The node to be removed is not a child of this node/i,
];

const getEventMessage = (event: Sentry.ErrorEvent): string => {
  const exceptionValues = event.exception?.values ?? [];
  const exceptionMessage = exceptionValues
    .map((value) => `${value.type ?? ''} ${value.value ?? ''}`)
    .join(' ')
    .trim();
  return [exceptionMessage, event.message ?? ''].filter(Boolean).join(' ');
};

export const shouldDropSentryEvent = (event: Sentry.ErrorEvent): boolean => {
  const message = getEventMessage(event);
  if (!message) return false;
  return IGNORED_ERROR_PATTERNS.some((pattern) => pattern.test(message));
};

export function initSentry() {
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    enabled: import.meta.env.PROD,
    integrations: [
      Sentry.reactRouterV6BrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
    ],
    sampleRate: 1.0,
    tracesSampleRate: 0.2,
    maxBreadcrumbs: 50,
    beforeSend: (event) => (shouldDropSentryEvent(event) ? null : event),
  });
}

export { Sentry };
