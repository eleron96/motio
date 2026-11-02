import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTimeoutSlot } from '@/shared/lib/timeoutSlot';

describe('createTimeoutSlot', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs the callback once and is free again afterwards', () => {
    const slot = createTimeoutSlot();
    const callback = vi.fn();
    slot.set(callback, 100);
    expect(slot.pending).toBe(true);
    vi.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(slot.pending).toBe(false);
  });

  it('replaces a waiting callback when set again, and drops it on clear', () => {
    const slot = createTimeoutSlot();
    const first = vi.fn();
    const second = vi.fn();
    slot.set(first, 100);
    slot.set(second, 100);
    vi.advanceTimersByTime(100);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);

    slot.set(first, 100);
    slot.clear();
    vi.advanceTimersByTime(100);
    expect(first).not.toHaveBeenCalled();
  });
});
