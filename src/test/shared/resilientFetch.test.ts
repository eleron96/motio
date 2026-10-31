import { describe, expect, it, vi } from 'vitest';
import { createResilientFetch, RequestTimeoutError } from '@/shared/lib/resilientFetch';

const REST = 'https://motio.example/rest/v1/tasks?id=eq.1';
const noSleep = () => Promise.resolve();
const response = (status: number) => new Response(status === 204 ? null : '{}', { status });

describe('createResilientFetch', () => {
  it('retries a read after a gateway error and returns the good answer', async () => {
    const base = vi.fn()
      .mockResolvedValueOnce(response(502))
      .mockResolvedValueOnce(response(200));
    const fetchFn = createResilientFetch(base, { sleep: noSleep });

    const result = await fetchFn(REST, { method: 'GET' });
    expect(result.status).toBe(200);
    expect(base).toHaveBeenCalledTimes(2);
  });

  it('retries an absolute update after a network failure, at most twice', async () => {
    const base = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const fetchFn = createResilientFetch(base, { sleep: noSleep });

    await expect(fetchFn(REST, { method: 'PATCH', body: '{"start_date":"2026-08-10"}' })).rejects.toThrow('Failed to fetch');
    expect(base).toHaveBeenCalledTimes(3);
    // The same body goes out every time.
    expect(base.mock.calls.every(([, init]) => init.body === '{"start_date":"2026-08-10"}')).toBe(true);
  });

  it('never retries a POST, so a lost answer cannot create a duplicate', async () => {
    const base = vi.fn().mockResolvedValue(response(503));
    const fetchFn = createResilientFetch(base, { sleep: noSleep });

    const result = await fetchFn(REST, { method: 'POST', body: '{}' });
    expect(result.status).toBe(503);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it('does not retry client errors', async () => {
    const base = vi.fn().mockResolvedValue(response(409));
    const fetchFn = createResilientFetch(base, { sleep: noSleep });
    expect((await fetchFn(REST, { method: 'PATCH' })).status).toBe(409);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it('gives up with a timeout error instead of hanging', async () => {
    vi.useFakeTimers();
    try {
      const base = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      }));
      const fetchFn = createResilientFetch(base, { timeoutMs: 1000, sleep: noSleep });
      const pending = fetchFn(REST, { method: 'GET' });
      const assertion = expect(pending).rejects.toBeInstanceOf(RequestTimeoutError);
      await vi.advanceTimersByTimeAsync(1000);
      await assertion;
      // A timed-out request is not repeated: it may still be running on the server.
      expect(base).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('respects a caller abort and does not retry it', async () => {
    const controller = new AbortController();
    const base = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const fetchFn = createResilientFetch(base, { sleep: noSleep });
    const pending = fetchFn(REST, { method: 'GET', signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow('aborted');
    expect(base).toHaveBeenCalledTimes(1);
  });

  it('leaves auth, functions, storage and realtime requests alone', async () => {
    const base = vi.fn().mockResolvedValue(response(503));
    const fetchFn = createResilientFetch(base, { sleep: noSleep });
    for (const url of [
      'https://motio.example/auth/v1/token?grant_type=refresh_token',
      'https://motio.example/functions/v1/task-media',
      'https://motio.example/storage/v1/object/avatars/a.png',
    ]) {
      await fetchFn(url, { method: 'GET' });
    }
    expect(base).toHaveBeenCalledTimes(3);
    expect(base.mock.calls.every(([, init]) => init === undefined || init.signal === undefined)).toBe(true);
  });
});
