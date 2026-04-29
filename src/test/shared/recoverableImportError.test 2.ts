import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isRecoverableImportError,
  reloadForRecoverableImportError,
} from '@/shared/lib/recoverableImportError';

const createMemoryStorage = () => {
  const values = new Map<string, string>();

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
};

describe('recoverableImportError', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('recognizes stale lazy chunk fetch failures as recoverable', () => {
    expect(
      isRecoverableImportError(
        new Error('Failed to fetch dynamically imported module: https://motio.nikog.net/assets/AuthPage-B0CeTuqf.js'),
      ),
    ).toBe(true);
    expect(isRecoverableImportError(new Error('ChunkLoadError: Loading chunk 42 failed.'))).toBe(true);
    expect(isRecoverableImportError(new Error('Regular render failure'))).toBe(false);
  });

  it('reloads only once for the same missing chunk signature', () => {
    const storage = createMemoryStorage();
    const reload = vi.fn();
    const error = new Error(
      'Failed to fetch dynamically imported module: https://motio.nikog.net/assets/AuthPage-B0CeTuqf.js',
    );

    expect(reloadForRecoverableImportError(error, { storage, reload })).toBe(true);
    expect(reloadForRecoverableImportError(error, { storage, reload })).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('allows another reload for a different chunk signature', () => {
    const storage = createMemoryStorage();
    const reload = vi.fn();

    expect(
      reloadForRecoverableImportError(
        new Error('Failed to fetch dynamically imported module: https://motio.nikog.net/assets/AuthPage-B0CeTuqf.js'),
        { storage, reload },
      ),
    ).toBe(true);

    expect(
      reloadForRecoverableImportError(
        new Error('Failed to fetch dynamically imported module: https://motio.nikog.net/assets/PlannerPage-Q1w2e3r4.js'),
        { storage, reload },
      ),
    ).toBe(true);

    expect(reload).toHaveBeenCalledTimes(2);
  });
});
