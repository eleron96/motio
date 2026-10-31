import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSerialFieldWrite } from '@/features/planner/hooks/useSerialFieldWrite';

type Write = (value: string[], key: string) => Promise<void>;

const deferredWrites = () => {
  const calls: Array<{ value: string[]; key: string; resolve: () => void; reject: (error: Error) => void }> = [];
  const write = vi.fn<Write>((value, key) => new Promise<void>((resolve, reject) => {
    calls.push({ value, key, resolve, reject });
  }));
  return { calls, write };
};

describe('useSerialFieldWrite', () => {
  it('shows the picked value at once and sends only the latest one after the write in flight', async () => {
    const { calls, write } = deferredWrites();
    const { result, rerender } = renderHook(
      ({ store }) => useSerialFieldWrite<string[]>(store, write, 'task-1'),
      { initialProps: { store: [] as string[] } },
    );

    act(() => result.current[1](['a']));
    act(() => result.current[1](['a', 'b']));
    act(() => result.current[1](['a', 'b', 'c']));

    expect(result.current[0]).toEqual(['a', 'b', 'c']);
    expect(write).toHaveBeenCalledTimes(1);
    expect(calls[0]).toMatchObject({ value: ['a'], key: 'task-1' });

    await act(async () => { calls[0].resolve(); });
    // ['a', 'b'] was superseded before it could go out.
    expect(write).toHaveBeenCalledTimes(2);
    expect(calls[1].value).toEqual(['a', 'b', 'c']);

    rerender({ store: ['a', 'b', 'c'] });
    await act(async () => { calls[1].resolve(); });
    expect(write).toHaveBeenCalledTimes(2);
    expect(result.current[0]).toEqual(['a', 'b', 'c']);
  });

  it('falls back to the store value once the last write fails', async () => {
    const { calls, write } = deferredWrites();
    const { result } = renderHook(() => useSerialFieldWrite<string[]>(['x'], write, 'task-1'));

    act(() => result.current[1](['x', 'y']));
    expect(result.current[0]).toEqual(['x', 'y']);

    await act(async () => { calls[0].reject(new Error('offline')); });
    expect(result.current[0]).toEqual(['x']);
  });

  it('still writes taps made just before the card switched to another task', async () => {
    const { calls, write } = deferredWrites();
    const { result, rerender } = renderHook(
      ({ taskKey }) => useSerialFieldWrite<string[]>([], write, taskKey),
      { initialProps: { taskKey: 'task-1' as string | null } },
    );

    act(() => result.current[1](['a']));
    act(() => result.current[1](['a', 'b']));
    rerender({ taskKey: null });
    expect(result.current[0]).toEqual([]);

    await act(async () => { calls[0].resolve(); });
    expect(calls[1]).toMatchObject({ value: ['a', 'b'], key: 'task-1' });
  });
});
