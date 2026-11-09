import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@lingui/macro', () => ({
  t: (input: TemplateStringsArray, ...values: unknown[]) => (
    input.reduce((acc: string, str, index) => acc + str + (values[index] ?? ''), '')
  ),
}));

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  published: vi.fn<() => Promise<string | null>>(),
}));

vi.mock('@/shared/ui/sonner', () => ({ toast: mocks.toast }));
vi.mock('@/shared/lib/appVersion', () => ({ APP_VERSION: '0.10.44' }));
vi.mock('@/shared/lib/appVersionCheck', () => ({ fetchPublishedAppVersion: mocks.published }));

import { useNewVersionNotice } from '@/features/workspace/hooks/useNewVersionNotice';

describe('useNewVersionNotice', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.toast.mockClear();
    mocks.published.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('offers the update once when an important release is out, and never reloads by itself', async () => {
    mocks.published.mockResolvedValue('0.11.0');
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    renderHook(() => useNewVersionNotice());

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(mocks.toast.mock.calls[0][0]).toBe('A new version of Motio is available');
    expect(reload).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(15 * 60_000);
    window.dispatchEvent(new Event('focus'));
    expect(mocks.toast).toHaveBeenCalledTimes(1);

    // The button reloads.
    mocks.toast.mock.calls[0][1].action.onClick();
    expect(reload).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('stays quiet for patch releases, which arrive on the next page load', async () => {
    mocks.published
      .mockResolvedValueOnce('0.10.45')
      .mockResolvedValueOnce('0.10.99')
      .mockResolvedValueOnce('1.0.0');
    renderHook(() => useNewVersionNotice());

    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(mocks.published).toHaveBeenCalledTimes(2);
    expect(mocks.toast).not.toHaveBeenCalled();

    // A new major version is important too.
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(mocks.toast).toHaveBeenCalledTimes(1);
  });

  it('stays quiet for the same or an older version', async () => {
    mocks.published.mockResolvedValueOnce('0.10.44').mockResolvedValueOnce('0.10.43');
    renderHook(() => useNewVersionNotice());
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(mocks.published).toHaveBeenCalledTimes(2);
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('does not check right after load or more often than every 5 minutes', async () => {
    mocks.published.mockResolvedValue('0.10.44');
    renderHook(() => useNewVersionNotice());
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.published).not.toHaveBeenCalled();
  });
});
