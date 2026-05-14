import { describe, expect, it } from 'vitest';
import type { ErrorEvent } from '@sentry/react';

import { shouldDropSentryEvent } from '@/shared/lib/sentry';

const eventWithException = (type: string, value: string): ErrorEvent => ({
  exception: { values: [{ type, value }] },
} as ErrorEvent);

describe('shouldDropSentryEvent', () => {
  it('drops stale Vite chunk preload failures', () => {
    expect(
      shouldDropSentryEvent(
        eventWithException(
          'TypeError',
          'Failed to fetch dynamically imported module: https://motio.nikog.net/assets/ProjectsPage-C3SFzRZM.js',
        ),
      ),
    ).toBe(true);
  });

  it('drops the Firefox dynamic-import failure variant', () => {
    expect(
      shouldDropSentryEvent(
        eventWithException('TypeError', 'error loading dynamically imported module'),
      ),
    ).toBe(true);
  });

  it('drops ChunkLoadError', () => {
    expect(
      shouldDropSentryEvent(
        eventWithException('ChunkLoadError', 'Loading chunk 42 failed.'),
      ),
    ).toBe(true);
  });

  it('drops removeChild races caused by browser translation', () => {
    expect(
      shouldDropSentryEvent(
        eventWithException(
          'NotFoundError',
          "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.",
        ),
      ),
    ).toBe(true);
  });

  it('drops insertBefore races caused by browser translation', () => {
    expect(
      shouldDropSentryEvent(
        eventWithException(
          'NotFoundError',
          "Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node.",
        ),
      ),
    ).toBe(true);
  });

  it('keeps real application errors', () => {
    expect(
      shouldDropSentryEvent(
        eventWithException('TypeError', "Cannot read properties of undefined (reading 'id')"),
      ),
    ).toBe(false);
  });

  it('keeps events with no exception or message', () => {
    expect(shouldDropSentryEvent({} as ErrorEvent)).toBe(false);
  });
});
