import React from 'react';
import { t } from '@lingui/macro';

interface PageErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

interface PageErrorBoundaryProps {
  children: React.ReactNode;
}

/**
 * Page-level React Error Boundary.
 *
 * Catches unhandled render errors from any page component and displays a
 * recovery UI instead of a blank screen. Placed around the <Suspense> block
 * in App.tsx so every lazy-loaded page is covered.
 *
 * "Try again" resets state so React re-renders the subtree.
 * "Return to Home" navigates via a hard redirect (safe even after a crash).
 */
export class PageErrorBoundary extends React.Component<
  PageErrorBoundaryProps,
  PageErrorBoundaryState
> {
  constructor(props: PageErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): PageErrorBoundaryState {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { hasError: true, errorMessage };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[PageErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-muted p-8">
          <h1 className="text-2xl font-semibold">{t`Something went wrong`}</h1>
          {this.state.errorMessage && (
            <p className="max-w-md text-center text-sm text-muted-foreground">
              {this.state.errorMessage}
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={this.handleReset}
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
            >
              {t`Try again`}
            </button>
            <a
              href="/"
              className="rounded-md border px-4 py-2 text-sm hover:bg-muted-foreground/10"
            >
              {t`Return to Home`}
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
