import { describe, expect, it, vi } from 'vitest';
import {
  createLatestAsyncRequest,
  isAbortError,
  withAbortSignal,
} from '@/shared/lib/latestAsyncRequest';

describe('latestAsyncRequest', () => {
  it('keeps only the latest request current and aborts previous one', () => {
    const guard = createLatestAsyncRequest();
    const first = guard.next();
    expect(guard.isCurrent(first.requestId)).toBe(true);
    expect(first.signal.aborted).toBe(false);

    const second = guard.next();
    expect(first.signal.aborted).toBe(true);
    expect(guard.isCurrent(first.requestId)).toBe(false);
    expect(guard.isCurrent(second.requestId)).toBe(true);
    expect(second.signal.aborted).toBe(false);
  });

  it('aborts active request on cancel', () => {
    const guard = createLatestAsyncRequest();
    const request = guard.next();
    expect(request.signal.aborted).toBe(false);
    guard.cancel();
    expect(request.signal.aborted).toBe(true);
  });

  it('attaches abort signal when query supports abortSignal()', () => {
    const signal = new AbortController().signal;
    const abortSignal = vi.fn().mockReturnValue({ attached: true });
    const query = { abortSignal };
    const result = withAbortSignal(query, signal);
    expect(abortSignal).toHaveBeenCalledWith(signal);
    expect(result).toEqual({ attached: true });
  });

  it('returns original query when abortSignal() is not supported', () => {
    const signal = new AbortController().signal;
    const query = { select: vi.fn() };
    const result = withAbortSignal(query, signal);
    expect(result).toBe(query);
  });

  it('detects abort errors by name or message', () => {
    expect(isAbortError({ name: 'AbortError' })).toBe(true);
    expect(isAbortError({ message: 'The operation was aborted.' })).toBe(true);
    expect(isAbortError({ message: 'signal is aborted without reason' })).toBe(true);
    expect(isAbortError('AbortError: signal is aborted without reason')).toBe(true);
    expect(isAbortError({ cause: { message: 'signal is aborted without reason' } })).toBe(true);
    expect(isAbortError({ message: 'Permission denied' })).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });
});
