import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Lingui macro mock — t`...` tagged template returns the static string.
vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray) => strings[0],
}));

const boundaryMocks = vi.hoisted(() => ({
  isRecoverableImportError: vi.fn(() => false),
  reloadCurrentPage: vi.fn(),
  reloadForRecoverableImportError: vi.fn(() => false),
  captureException: vi.fn(),
}));

vi.mock('@/shared/lib/recoverableImportError', () => ({
  isRecoverableImportError: boundaryMocks.isRecoverableImportError,
  reloadCurrentPage: boundaryMocks.reloadCurrentPage,
  reloadForRecoverableImportError: boundaryMocks.reloadForRecoverableImportError,
}));

vi.mock('@/shared/lib/sentry', () => ({
  Sentry: {
    captureException: boundaryMocks.captureException,
  },
}));

import { PageErrorBoundary } from '@/app/PageErrorBoundary';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Always throws while `control.shouldThrow` is true.
 * Using an external mutable object avoids conflicts with React 18's
 * render-retry behaviour (which would increment a closure counter prematurely).
 */
const makeControlledComponent = () => {
  const control = { shouldThrow: true };
  const ControlledComponent = () => {
    if (control.shouldThrow) throw new Error('Controlled error');
    return <div>Recovered content</div>;
  };
  return { ControlledComponent, control };
};

/** Always throws. */
const AlwaysThrowingComponent = ({ message = 'Test render error' }: { message?: string }) => {
  throw new Error(message);
};

/** Never throws. */
const StableComponent = () => <div>Normal content</div>;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PageErrorBoundary', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Suppress the expected console.error calls that React emits during error handling.
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    boundaryMocks.isRecoverableImportError.mockReturnValue(false);
    boundaryMocks.reloadCurrentPage.mockReset();
    boundaryMocks.reloadForRecoverableImportError.mockReset();
    boundaryMocks.reloadForRecoverableImportError.mockReturnValue(false);
    boundaryMocks.captureException.mockReset();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('renders children normally when no error occurs', () => {
    render(
      <PageErrorBoundary>
        <StableComponent />
      </PageErrorBoundary>,
    );

    expect(screen.getByText('Normal content')).toBeInTheDocument();
  });

  it('shows the fallback heading when a child component throws', () => {
    render(
      <PageErrorBoundary>
        <AlwaysThrowingComponent />
      </PageErrorBoundary>,
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Something went wrong');
  });

  it('displays the error message from the thrown Error in the fallback UI', () => {
    render(
      <PageErrorBoundary>
        <AlwaysThrowingComponent message="Catastrophic failure" />
      </PageErrorBoundary>,
    );

    expect(screen.getByText('Catastrophic failure')).toBeInTheDocument();
  });

  it('renders a "Try again" button and a "Return to Home" link in the fallback UI', () => {
    render(
      <PageErrorBoundary>
        <AlwaysThrowingComponent />
      </PageErrorBoundary>,
    );

    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /return to home/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /return to home/i })).toHaveAttribute('href', '/');
  });

  it('recovers and re-renders children after clicking "Try again"', () => {
    const { ControlledComponent, control } = makeControlledComponent();

    render(
      <PageErrorBoundary>
        <ControlledComponent />
      </PageErrorBoundary>,
    );

    // Boundary should catch the error and show the fallback UI.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Something went wrong');

    // Allow the next render to succeed, then reset the boundary.
    control.shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(screen.getByText('Recovered content')).toBeInTheDocument();
  });

  it('logs [PageErrorBoundary] with the error and component stack', () => {
    render(
      <PageErrorBoundary>
        <AlwaysThrowingComponent />
      </PageErrorBoundary>,
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      '[PageErrorBoundary]',
      expect.any(Error),
      expect.any(String),
    );
  });

  it('triggers recoverable import reload flow without rendering the raw chunk URL', () => {
    boundaryMocks.isRecoverableImportError.mockReturnValue(true);
    boundaryMocks.reloadForRecoverableImportError.mockReturnValue(true);

    render(
      <PageErrorBoundary>
        <AlwaysThrowingComponent message="Failed to fetch dynamically imported module: https://motio.nikog.net/assets/AuthPage-B0CeTuqf.js" />
      </PageErrorBoundary>,
    );

    expect(
      screen.queryByText(
        'Failed to fetch dynamically imported module: https://motio.nikog.net/assets/AuthPage-B0CeTuqf.js',
      ),
    ).not.toBeInTheDocument();
    expect(boundaryMocks.reloadForRecoverableImportError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('hard reloads when clicking "Try again" for a recoverable import error', () => {
    boundaryMocks.isRecoverableImportError.mockReturnValue(true);

    render(
      <PageErrorBoundary>
        <AlwaysThrowingComponent message="Failed to fetch dynamically imported module: https://motio.nikog.net/assets/AuthPage-B0CeTuqf.js" />
      </PageErrorBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(boundaryMocks.reloadCurrentPage).toHaveBeenCalledTimes(1);
  });
});
