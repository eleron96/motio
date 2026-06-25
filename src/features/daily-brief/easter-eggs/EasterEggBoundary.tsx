import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

/**
 * Dedicated error boundary around ONLY the easter-egg overlay. An egg is purely
 * decorative, so if its lazy chunk or render throws we swallow it and render
 * nothing — the daily brief keeps working. This is intentionally separate from
 * the app-wide BackgroundSuspenseBoundary, which would blank the whole brief.
 */
export class EasterEggBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Decorative only — log for debugging, never surface to the user.
    console.warn('[EasterEggBoundary] easter egg failed, ignoring:', error, info.componentStack);
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
