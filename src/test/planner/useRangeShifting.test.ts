import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useRangeShifting } from '@/features/planner/components/timeline/hooks/useRangeShifting';

// One animation frame = one 16 ms timer, so frames can be stepped exactly.
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => (
    setTimeout(() => callback(performance.now()), 16) as unknown as number
  ));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const frames = (count: number) => act(() => { vi.advanceTimersByTime(16 * count); });

describe('useRangeShifting', () => {
  it('is off while the range stays put', () => {
    const { result, rerender } = renderHook(({ rangeKey }) => useRangeShifting(rangeKey), {
      initialProps: { rangeKey: 'a' },
    });
    expect(result.current).toBe(false);
    rerender({ rangeKey: 'a' });
    frames(3);
    expect(result.current).toBe(false);
  });

  it('is on in the render where the range shifts and off two frames later', () => {
    const { result, rerender } = renderHook(({ rangeKey }) => useRangeShifting(rangeKey), {
      initialProps: { rangeKey: 'a' },
    });

    rerender({ rangeKey: 'b' });
    expect(result.current).toBe(true);

    frames(1);
    expect(result.current).toBe(true);

    frames(1);
    expect(result.current).toBe(false);
  });

  it('starts over when the range shifts again before settling', () => {
    const { result, rerender } = renderHook(({ rangeKey }) => useRangeShifting(rangeKey), {
      initialProps: { rangeKey: 'a' },
    });

    rerender({ rangeKey: 'b' });
    frames(1);
    rerender({ rangeKey: 'c' });
    expect(result.current).toBe(true);

    frames(1);
    expect(result.current).toBe(true);

    frames(1);
    expect(result.current).toBe(false);
  });
});
