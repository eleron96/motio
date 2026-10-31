/**
 * fetch for the Supabase client: a timeout and a couple of retries for
 * database requests (`/rest/v1/…`).
 *
 * Without a timeout a request on a flaky connection (Wi-Fi ↔ LTE, a laptop
 * waking up) could hang for minutes with a spinner and no way out; a short
 * 502/503 while a container is recreated during a deploy ended as "not saved".
 *
 * Only requests that are safe to send twice are retried — reads, and updates
 * and deletes that set absolute values. POST (inserts, RPCs) is never retried,
 * so a lost answer can't create a duplicate. Auth, Edge Functions, Storage
 * uploads and Realtime don't go through here.
 */

export const REST_REQUEST_TIMEOUT_MS = 20_000;
export const REST_RETRY_DELAYS_MS = [400, 1200];

const REST_PATH = '/rest/v1/';
const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const RETRYABLE_METHODS = new Set(['GET', 'HEAD', 'PATCH', 'DELETE']);

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type ResilientFetchOptions = {
  timeoutMs?: number;
  retryDelaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
};

const requestUrl = (input: RequestInfo | URL) => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
};

const requestMethod = (input: RequestInfo | URL, init?: RequestInit) => (
  (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase()
);

export class RequestTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${Math.round(timeoutMs / 1000)} s`);
    this.name = 'RequestTimeoutError';
  }
}

// One attempt's signal: aborts on our timeout or when the caller aborts.
const attemptSignal = (timeoutMs: number, callerSignal?: AbortSignal | null) => {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onCallerAbort = () => controller.abort(callerSignal?.reason);
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort(callerSignal.reason);
    else callerSignal.addEventListener('abort', onCallerAbort, { once: true });
  }
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose: () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    },
  };
};

export const createResilientFetch = (
  baseFetch: FetchLike = (input, init) => fetch(input, init),
  options: ResilientFetchOptions = {},
): FetchLike => {
  const timeoutMs = options.timeoutMs ?? REST_REQUEST_TIMEOUT_MS;
  const retryDelaysMs = options.retryDelaysMs ?? REST_RETRY_DELAYS_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  return async (input, init) => {
    if (!requestUrl(input).includes(REST_PATH)) return baseFetch(input, init);
    const retryable = RETRYABLE_METHODS.has(requestMethod(input, init));

    for (let attempt = 0; ; attempt += 1) {
      const attemptAbort = attemptSignal(timeoutMs, init?.signal);
      const canRetry = retryable && attempt < retryDelaysMs.length;
      try {
        const response = await baseFetch(input, { ...init, signal: attemptAbort.signal });
        if (canRetry && RETRYABLE_STATUSES.has(response.status)) {
          await sleep(retryDelaysMs[attempt]);
          continue;
        }
        return response;
      } catch (error) {
        if (init?.signal?.aborted) throw error;
        if (attemptAbort.timedOut()) throw new RequestTimeoutError(timeoutMs);
        if (canRetry) {
          await sleep(retryDelaysMs[attempt]);
          continue;
        }
        throw error;
      } finally {
        attemptAbort.dispose();
      }
    }
  };
};
