import React from 'react';
import { Sentry } from '@/shared/lib/sentry';
import {
  isRecoverableImportError,
  reloadForRecoverableImportError,
} from '@/shared/lib/recoverableImportError';

interface BackgroundSuspenseBoundaryProps {
  children: React.ReactNode;
}

/**
 * Error boundary for non-essential, lazily-loaded background widgets that live
 * OUTSIDE the routed PageErrorBoundary (e.g. the daily-brief controller mounted
 * on every authenticated page).
 *
 * Unlike PageErrorBoundary it never shows a recovery screen — a background
 * widget failing must not take down the whole app. On a stale-chunk failure it
 * reloads once to pick up the fresh bundle; on any other error it reports to
 * Sentry and renders nothing so the rest of the page keeps working.
 */
export class BackgroundSuspenseBoundary extends React.Component<
  BackgroundSuspenseBoundaryProps,
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    if (isRecoverableImportError(error)) {
      reloadForRecoverableImportError(error);
      return;
    }
    Sentry.captureException(error, { contexts: { react: { componentStack: info.componentStack } } });
  }

  render() {
    return this.state.hasError ? null : this.props.children;
  }
}
