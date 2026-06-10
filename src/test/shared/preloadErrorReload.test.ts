import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  installPreloadErrorReload,
  isPreloadError,
  maybeReloadForPreloadError,
} from '@/shared/lib/preloadErrorReload';

const makeStorage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => { map.set(key, value); },
    _map: map,
  };
};

describe('isPreloadError', () => {
  it('recognises the Chrome/Vite dynamic import failure message', () => {
    expect(isPreloadError(new Error(
      'Failed to fetch dynamically imported module: https://motio.nikog.net/assets/TaskCommentSection-kINYV_NF.js',
    ))).toBe(true);
  });

  it('recognises the Firefox variant', () => {
    expect(isPreloadError(new Error('error loading dynamically imported module'))).toBe(true);
  });

  it('recognises the Safari variant', () => {
    expect(isPreloadError(new Error('Importing a module script failed.'))).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(isPreloadError(new Error('Network request failed'))).toBe(false);
    expect(isPreloadError(null)).toBe(false);
    expect(isPreloadError(undefined)).toBe(false);
    expect(isPreloadError('random string')).toBe(false);
  });
});

describe('maybeReloadForPreloadError', () => {
  it('reloads on the first call and records a guard timestamp', () => {
    const storage = makeStorage();
    const reload = vi.fn();
    const reloaded = maybeReloadForPreloadError({
      now: () => 1_000,
      storage,
      reloader: { reload },
    });
    expect(reloaded).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage._map.get('motio:preload-reload-at')).toBe('1000');
  });

  it('skips reload when the guard is still within the cooldown window', () => {
    const storage = makeStorage();
    storage.setItem('motio:preload-reload-at', '1000');
    const reload = vi.fn();
    const reloaded = maybeReloadForPreloadError({
      now: () => 5_000,
      storage,
      reloader: { reload },
      cooldownMs: 10_000,
    });
    expect(reloaded).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads again once the cooldown has expired', () => {
    const storage = makeStorage();
    storage.setItem('motio:preload-reload-at', '1000');
    const reload = vi.fn();
    const reloaded = maybeReloadForPreloadError({
      now: () => 20_000,
      storage,
      reloader: { reload },
      cooldownMs: 10_000,
    });
    expect(reloaded).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('still reloads when sessionStorage is unavailable', () => {
    const reload = vi.fn();
    const reloaded = maybeReloadForPreloadError({
      now: () => 1_000,
      storage: null,
      reloader: { reload },
    });
    expect(reloaded).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('installPreloadErrorReload', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('reloads on vite:preloadError', () => {
    const reload = vi.fn();
    const uninstall = installPreloadErrorReload({
      now: () => 42,
      reloader: { reload },
    });

    window.dispatchEvent(new Event('vite:preloadError'));
    expect(reload).toHaveBeenCalledTimes(1);

    uninstall();
  });

  it('calls preventDefault on vite:preloadError so Vite suppresses the rejection', () => {
    const reload = vi.fn();
    const uninstall = installPreloadErrorReload({
      now: () => 42,
      reloader: { reload },
    });

    const event = new Event('vite:preloadError', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    uninstall();
  });

  it('reloads on unhandledrejection whose reason matches a preload error', () => {
    const reload = vi.fn();
    const uninstall = installPreloadErrorReload({
      now: () => 42,
      reloader: { reload },
    });

    window.dispatchEvent(Object.assign(new Event('unhandledrejection'), {
      reason: new Error('Failed to fetch dynamically imported module: /assets/Foo-abc.js'),
    }));
    expect(reload).toHaveBeenCalledTimes(1);

    uninstall();
  });

  it('ignores unhandledrejection for unrelated errors', () => {
    const reload = vi.fn();
    const uninstall = installPreloadErrorReload({
      now: () => 42,
      reloader: { reload },
    });

    window.dispatchEvent(Object.assign(new Event('unhandledrejection'), {
      reason: new Error('Something else broke'),
    }));
    expect(reload).not.toHaveBeenCalled();

    uninstall();
  });

  it('cleans up listeners when the returned disposer is called', () => {
    const reload = vi.fn();
    const uninstall = installPreloadErrorReload({
      now: () => 42,
      reloader: { reload },
    });
    uninstall();

    window.dispatchEvent(new Event('vite:preloadError'));
    expect(reload).not.toHaveBeenCalled();
  });
});
