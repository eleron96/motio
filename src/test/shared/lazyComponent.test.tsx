import React, { Suspense } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import { lazyDefault, lazyNamed, makeRecoverableImportError } from '@/shared/lib/lazyComponent';
import { isRecoverableImportError } from '@/shared/lib/recoverableImportError';

class CaptureBoundary extends React.Component<
  { onError: (error: unknown) => void; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    this.props.onError(error);
  }

  render() {
    return this.state.failed ? <div>boundary</div> : this.props.children;
  }
}

const renderLazy = (Lazy: React.ComponentType) => {
  let captured: unknown = null;
  render(
    <CaptureBoundary onError={(error) => { captured = error; }}>
      <Suspense fallback={<div>loading</div>}>
        <Lazy />
      </Suspense>
    </CaptureBoundary>,
  );
  return () => captured;
};

describe('makeRecoverableImportError', () => {
  it('produces a message recognised as a recoverable import error', () => {
    expect(isRecoverableImportError(makeRecoverableImportError('RichTextEditor'))).toBe(true);
  });
});

describe('lazyNamed', () => {
  it('renders the named export when the module resolves correctly', async () => {
    const Lazy = lazyNamed(
      () => Promise.resolve({ Widget: () => <div>widget ok</div> }),
      'Widget',
    );
    render(
      <Suspense fallback={<div>loading</div>}>
        <Lazy />
      </Suspense>,
    );
    expect(await screen.findByText('widget ok')).toBeTruthy();
  });

  it('throws a recoverable error when the module resolves to undefined', async () => {
    // Mirrors Vite resolving a failed dynamic import to `undefined`.
    const Lazy = lazyNamed(
      () => Promise.resolve(undefined as unknown as Record<string, unknown>),
      'RichTextEditor',
    );
    const getError = renderLazy(Lazy);
    await waitFor(() => expect(getError()).not.toBeNull());
    expect(isRecoverableImportError(getError())).toBe(true);
  });

  it('throws a recoverable error when the named export is missing', async () => {
    const Lazy = lazyNamed(
      () => Promise.resolve({ SomethingElse: () => <div /> }),
      'RichTextEditor' as never,
    );
    const getError = renderLazy(Lazy);
    await waitFor(() => expect(getError()).not.toBeNull());
    expect(isRecoverableImportError(getError())).toBe(true);
  });
});

describe('lazyDefault', () => {
  it('renders the default export when the module resolves correctly', async () => {
    const Lazy = lazyDefault(
      () => Promise.resolve({ default: () => <div>page ok</div> }),
      'Page',
    );
    render(
      <Suspense fallback={<div>loading</div>}>
        <Lazy />
      </Suspense>,
    );
    expect(await screen.findByText('page ok')).toBeTruthy();
  });

  it('throws a recoverable error when the module resolves to undefined', async () => {
    const Lazy = lazyDefault(
      () => Promise.resolve(undefined as unknown as { default: React.ComponentType }),
      'Page',
    );
    const getError = renderLazy(Lazy);
    await waitFor(() => expect(getError()).not.toBeNull());
    expect(isRecoverableImportError(getError())).toBe(true);
  });
});
