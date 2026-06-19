import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

const { reloadForRecoverableImportError, captureException } = vi.hoisted(() => ({
  reloadForRecoverableImportError: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('@/shared/lib/recoverableImportError', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/recoverableImportError')>();
  return { ...actual, reloadForRecoverableImportError };
});

vi.mock('@/shared/lib/sentry', () => ({
  Sentry: { captureException },
}));

import { BackgroundSuspenseBoundary } from '@/app/BackgroundSuspenseBoundary';
import { makeRecoverableImportError } from '@/shared/lib/lazyComponent';

const Boom = ({ error }: { error: unknown }): React.ReactElement => {
  throw error;
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('BackgroundSuspenseBoundary', () => {
  it('reloads (and renders nothing) on a recoverable stale-chunk error', () => {
    const { container } = render(
      <BackgroundSuspenseBoundary>
        <Boom error={makeRecoverableImportError('DailyBriefController')} />
      </BackgroundSuspenseBoundary>,
    );
    expect(reloadForRecoverableImportError).toHaveBeenCalledTimes(1);
    expect(captureException).not.toHaveBeenCalled();
    expect(container.textContent).toBe('');
  });

  it('reports other errors to Sentry without reloading or crashing the page', () => {
    const { container } = render(
      <BackgroundSuspenseBoundary>
        <Boom error={new Error('genuine background bug')} />
      </BackgroundSuspenseBoundary>,
    );
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(reloadForRecoverableImportError).not.toHaveBeenCalled();
    expect(container.textContent).toBe('');
  });
});
